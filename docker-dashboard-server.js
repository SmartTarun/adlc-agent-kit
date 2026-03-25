// Agent: Arjun | Sprint: 01 | Date: 2026-03-14
// Docker-aware dashboard server  --  serves sprint board + Docker API proxy
// Endpoints: GET / | GET /health | GET /events (SSE) | GET /api/state
//            GET /api/logs/:agent | GET /api/logs/:agent/stream (SSE)
//            POST /api/chat | POST /api/scale | POST /api/agent/:name/restart

'use strict';

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const url      = require('url');
const { exec } = require('child_process');

// -- Config -------------------------------------------------------------------
const PORT           = parseInt(process.env.PORT || '3000', 10);
const WORKSPACE      = process.env.WORKSPACE || path.join(__dirname, '..');
const DOCKER_SOCKET  = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const PROJECT_NAME   = process.env.COMPOSE_PROJECT_NAME || 'panchayat';
const BOARD_HTML     = path.join(__dirname, 'sprint-board.html');

const STATUS_FILE    = path.join(WORKSPACE, 'agent-status.json');
const CHAT_FILE      = path.join(WORKSPACE, 'group-chat.json');
const REQ_FILE       = path.join(WORKSPACE, 'requirement.json');
const MEMORY_DIR     = path.join(WORKSPACE, 'agent-memory');
const LOG_DIR        = path.join(WORKSPACE, 'agent-logs');

const AGENTS = ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'];

// -- SSE clients --------------------------------------------------------------
const sseClients  = new Set();
const logClients  = new Map(); // agent -> Set of SSE response objects

// -- Docker API helper --------------------------------------------------------
function dockerRequest(reqPath, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      socketPath : DOCKER_SOCKET,
      path       : reqPath,
      method,
      headers    : { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

// -- Get container stats for all panchayat containers ------------------------
async function getContainerStats() {
  const result = {};
  try {
    const containers = await dockerRequest('/containers/json?all=true');
    if (!Array.isArray(containers)) return result;

    const ours = containers.filter(c =>
      c.Labels && c.Labels['com.panchayat.sprint'] === 'dynamic'
    );

    await Promise.all(ours.map(async c => {
      const agentLabel = c.Labels['com.panchayat.agent'];
      if (!agentLabel) return;

      const id     = c.Id;
      const state  = c.State;   // running / exited / etc.
      const status = c.Status;  // "Up 4 minutes" / "Exited (0)"
      const health = c.Status.includes('healthy') ? 'healthy'
                   : c.Status.includes('unhealthy') ? 'unhealthy'
                   : c.Status.includes('starting') ? 'starting'
                   : 'unknown';

      // Parse uptime string
      const uptimeMatch = status.match(/Up (.+?)(?:\s*\(|$)/);
      const uptime = uptimeMatch ? uptimeMatch[1] : '--';

      let cpuPercent = 0;
      let memMB = 0;

      if (state === 'running') {
        try {
          const stats = await dockerRequest(`/containers/${id}/stats?stream=false`);
          if (stats && stats.cpu_stats) {
            const cpuDelta    = stats.cpu_stats.cpu_usage.total_usage
                              - stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta = stats.cpu_stats.system_cpu_usage
                              - stats.precpu_stats.system_cpu_usage;
            const numCPUs     = stats.cpu_stats.online_cpus
                              || (stats.cpu_stats.cpu_usage.percpu_usage || []).length
                              || 1;
            cpuPercent = systemDelta > 0
              ? ((cpuDelta / systemDelta) * numCPUs * 100).toFixed(1)
              : 0;
          }
          if (stats && stats.memory_stats) {
            memMB = Math.round((stats.memory_stats.usage || 0) / 1048576);
          }
        } catch { /* stats unavailable */ }
      }

      result[agentLabel] = { id, state, status, health, uptime, cpuPercent: parseFloat(cpuPercent), memMB };
    }));
  } catch (e) {
    // Docker socket unavailable (e.g., running outside Docker)
  }
  return result;
}

// -- Read workspace files -----------------------------------------------------
function readJSON(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function readMemories() {
  const result = {};
  AGENTS.forEach(name => {
    const f = path.join(MEMORY_DIR, `${name}-memory.json`);
    if (fs.existsSync(f)) result[name] = readJSON(f);
  });
  return result;
}

// -- Build full state object --------------------------------------------------
async function buildState() {
  const [containers] = await Promise.all([getContainerStats()]);
  return {
    timestamp  : new Date().toISOString(),
    agents     : readJSON(STATUS_FILE, {}),
    chat       : readJSON(CHAT_FILE, []),
    requirement: readJSON(REQ_FILE, {}),
    memories   : readMemories(),
    containers,
  };
}

// -- Broadcast state to all SSE clients --------------------------------------
async function broadcast() {
  if (sseClients.size === 0) return;
  try {
    const state = await buildState();
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    sseClients.forEach(res => {
      try { res.write(payload); } catch { sseClients.delete(res); }
    });
  } catch { /* ignore */ }
}

// -- Watch workspace files ----------------------------------------------------
let broadcastTimer = null;
function scheduleBroadcast() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(broadcast, 200);
}

[STATUS_FILE, CHAT_FILE, REQ_FILE].forEach(f => {
  try { fs.watch(f, scheduleBroadcast); } catch { /* file may not exist yet */ }
});
try {
  fs.watch(MEMORY_DIR, { recursive: false }, scheduleBroadcast);
} catch { /* ignore */ }

// Poll Docker stats every 10 seconds
setInterval(broadcast, 10000);

// -- Container log reader -----------------------------------------------------
function readLogFile(agentName, lines = 200) {
  const logFile = path.join(LOG_DIR, `${agentName}.log`);
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const all = content.split('\n');
    return all.slice(-lines).join('\n');
  } catch {
    return `No logs found for ${agentName}`;
  }
}

// -- HTTP Server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  // -- CORS ------------------------------------------------------------------
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // -- GET /  --  Serve sprint board HTML ---------------------------------------
  if (req.method === 'GET' && pathname === '/') {
    try {
      let html = fs.readFileSync(BOARD_HTML, 'utf8');
      // Inject SSE client script before </body>
      const sseScript = `
<script>
(function() {
  const es = new EventSource('/events');
  window.__panchayatES = es;
  es.onmessage = e => {
    try { window.dispatchEvent(new CustomEvent('panchayat-state', { detail: JSON.parse(e.data) })); }
    catch {}
  };
  es.onerror = () => {
    const el = document.getElementById('sse-status');
    if (el) { el.textContent = '[?] Disconnected  --  retrying...'; el.className = 'sse-status disconnected'; }
  };
  es.onopen = () => {
    const el = document.getElementById('sse-status');
    if (el) { el.textContent = '[?] Live'; el.className = 'sse-status connected'; }
  };
})();
</script>`;
      html = html.replace('</body>', sseScript + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    } catch {
      res.writeHead(500); return res.end('Dashboard HTML not found');
    }
  }

  // -- GET /health -----------------------------------------------------------
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  // -- GET /events  --  SSE main state stream -----------------------------------
  if (req.method === 'GET' && pathname === '/events') {
    res.writeHead(200, {
      'Content-Type'  : 'text/event-stream',
      'Cache-Control' : 'no-cache',
      'Connection'    : 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': panchayat-stream\n\n');
    sseClients.add(res);

    // Send initial state immediately
    buildState().then(state => {
      try { res.write(`data: ${JSON.stringify(state)}\n\n`); } catch {}
    });

    // Keepalive
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch { clearInterval(ka); } }, 25000);

    req.on('close', () => {
      sseClients.delete(res);
      clearInterval(ka);
    });
    return;
  }

  // -- GET /api/state  --  Full state JSON --------------------------------------
  if (req.method === 'GET' && pathname === '/api/state') {
    const state = await buildState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(state, null, 2));
  }

  // -- GET /api/logs/:agent  --  Last N lines of agent log ---------------------
  const logsMatch = pathname.match(/^\/api\/logs\/([a-z]+)$/);
  if (req.method === 'GET' && logsMatch) {
    const agentName = logsMatch[1];
    const lines = parseInt(query.lines || '200', 10);
    const content = readLogFile(agentName, lines);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(content);
  }

  // -- GET /api/logs/:agent/stream  --  SSE log tail ----------------------------
  const logStreamMatch = pathname.match(/^\/api\/logs\/([a-z]+)\/stream$/);
  if (req.method === 'GET' && logStreamMatch) {
    const agentName = logStreamMatch[1];
    const logFile = path.join(LOG_DIR, `${agentName}.log`);

    res.writeHead(200, {
      'Content-Type'  : 'text/event-stream',
      'Cache-Control' : 'no-cache',
      'Connection'    : 'keep-alive',
    });

    // Send last 50 lines immediately
    const initial = readLogFile(agentName, 50);
    res.write(`data: ${JSON.stringify({ type: 'init', content: initial })}\n\n`);

    if (!logClients.has(agentName)) logClients.set(agentName, new Set());
    logClients.get(agentName).add(res);

    // Watch the log file for new data
    let watcher = null;
    let lastSize = 0;
    try {
      const stat = fs.statSync(logFile);
      lastSize = stat.size;
    } catch {}

    try {
      watcher = fs.watch(logFile, () => {
        try {
          const stat = fs.statSync(logFile);
          if (stat.size > lastSize) {
            const fd = fs.openSync(logFile, 'r');
            const buf = Buffer.alloc(stat.size - lastSize);
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            fs.closeSync(fd);
            lastSize = stat.size;
            const newLines = buf.toString('utf8');
            try { res.write(`data: ${JSON.stringify({ type: 'append', content: newLines })}\n\n`); }
            catch {}
          }
        } catch {}
      });
    } catch { /* log file doesn't exist yet */ }

    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch { clearInterval(ka); } }, 25000);

    req.on('close', () => {
      if (watcher) try { watcher.close(); } catch {}
      logClients.get(agentName)?.delete(res);
      clearInterval(ka);
    });
    return;
  }

  // -- POST /api/chat  --  Post message to group chat ---------------------------
  if (req.method === 'POST' && pathname === '/api/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { sender = 'Tarun', message, type = 'message' } = JSON.parse(body);
        if (!message) { res.writeHead(400); return res.end('{"error":"message required"}'); }

        const chat = readJSON(CHAT_FILE, []);
        chat.push({ id: Date.now(), sender, message, type, timestamp: new Date().toISOString(), source: 'dashboard' });
        fs.writeFileSync(CHAT_FILE, JSON.stringify(chat, null, 2));
        scheduleBroadcast();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end(`{"error":"${e.message}"}`);
      }
    });
    return;
  }

  // -- POST /api/scale  --  Scale a service ------------------------------------
  if (req.method === 'POST' && pathname === '/api/scale') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { service, replicas = 2 } = JSON.parse(body);
        if (!service) { res.writeHead(400); return res.end('{"error":"service required"}'); }
        if (!AGENTS.includes(service)) { res.writeHead(400); return res.end('{"error":"unknown agent"}'); }

        const cmd = `docker compose -p ${PROJECT_NAME} up --scale ${service}=${replicas} -d --no-recreate`;
        exec(cmd, { cwd: WORKSPACE }, (err, stdout, stderr) => {
          if (err) {
            res.writeHead(500);
            return res.end(JSON.stringify({ error: err.message, stderr }));
          }
          scheduleBroadcast();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, service, replicas, stdout }));
        });
      } catch (e) {
        res.writeHead(400); res.end(`{"error":"${e.message}"}`);
      }
    });
    return;
  }

  // -- POST /api/agent/:name/restart -----------------------------------------
  const restartMatch = pathname.match(/^\/api\/agent\/([a-z]+)\/restart$/);
  if (req.method === 'POST' && restartMatch) {
    const agentName = restartMatch[1];
    const containerName = `${PROJECT_NAME}-${agentName}-1`;
    exec(`docker restart ${containerName}`, (err) => {
      if (err) { res.writeHead(500); return res.end(JSON.stringify({ error: err.message })); }
      scheduleBroadcast();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, restarted: agentName }));
    });
    return;
  }

  // -- POST /api/agent/keerthi/activate -------------------------------------
  if (req.method === 'POST' && pathname === '/api/agent/keerthi/activate') {
    const cmd = `docker compose -p ${PROJECT_NAME} --profile qa up keerthi -d`;
    exec(cmd, { cwd: WORKSPACE }, (err) => {
      if (err) { res.writeHead(500); return res.end(JSON.stringify({ error: err.message })); }
      scheduleBroadcast();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Keerthi QA agent activated' }));
    });
    return;
  }

  // -- 404 -------------------------------------------------------------------
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"not found"}');
});

server.listen(PORT, () => {
  console.log(`\n[*] Team Panchayat Dashboard Server`);
  console.log(`   Sprint Board : http://localhost:${PORT}`);
  console.log(`   SSE Events   : http://localhost:${PORT}/events`);
  console.log(`   API State    : http://localhost:${PORT}/api/state`);
  console.log(`   Docker Socket: ${DOCKER_SOCKET}`);
  console.log(`   Project      : ${PROJECT_NAME}`);
  console.log(`   Workspace    : ${WORKSPACE}\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[error] Port ${PORT} is already in use.`);
    console.error(`        Try: node docker-dashboard-server.js --port 3001\n`);
  } else {
    console.error('[error]', err.message);
  }
  process.exit(1);
});

// -- Handle CLI args ----------------------------------------------------------
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
if (portArg !== -1 && args[portArg + 1]) {
  // PORT is read from env above; flag overrides at startup not supported after listen
  // Use PORT env var instead: PORT=3001 node docker-dashboard-server.js
}
