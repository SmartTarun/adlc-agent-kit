/**
 * dashboard-server.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit — Team Panchayat
 * Date: 2026-03-14
 *
 * Live Dashboard Server — serves sprint-dashboard.html on a local port
 * with real-time push via Server-Sent Events (SSE).
 * All changes to agent-status.json, group-chat.json, requirement.json
 * are instantly pushed to all connected browsers — no manual refresh needed.
 *
 * Usage:
 *   node dashboard-server.js          → start on default port 3000
 *   node dashboard-server.js --port 8080
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const ROOT   = __dirname;
const PORT   = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? parseInt(process.argv[i+1]) : 3000; })();

// Files to watch for live updates
const WATCHED_FILES = [
  'agent-status.json',
  'group-chat.json',
  'requirement.json',
  ...fs.readdirSync(path.join(ROOT, 'agent-memory')).map(f => `agent-memory/${f}`),
].map(f => path.join(ROOT, f));

// Connected SSE clients
let clients = [];
let fileCache = {};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(c => {
    try { c.res.write(payload); return true; }
    catch { return false; }
  });
}

function getFullState() {
  const status  = readJSON(path.join(ROOT, 'agent-status.json'))  || {};
  const chat    = readJSON(path.join(ROOT, 'group-chat.json'))     || {};
  const req     = readJSON(path.join(ROOT, 'requirement.json'))    || {};
  const memory  = {};
  try {
    fs.readdirSync(path.join(ROOT, 'agent-memory')).forEach(f => {
      const agent = f.replace('-memory.json', '');
      memory[agent] = readJSON(path.join(ROOT, 'agent-memory', f));
    });
  } catch {}
  return { status, chat, req, memory, timestamp: new Date().toISOString() };
}

// Watch files and broadcast on change
WATCHED_FILES.forEach(file => {
  if (!fs.existsSync(file)) return;
  fs.watch(file, () => {
    setTimeout(() => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content !== fileCache[file]) {
          fileCache[file] = content;
          broadcast('update', getFullState());
          const rel = path.relative(ROOT, file);
          console.log(`[${new Date().toLocaleTimeString()}] 🔄 Changed: ${rel} → pushed to ${clients.length} client(s)`);
        }
      } catch {}
    }, 300);
  });
});

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── SSE endpoint ──────────────────────────────────────────────
  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 2000\n\n');

    // Send full state immediately on connect
    const state = getFullState();
    res.write(`event: init\ndata: ${JSON.stringify(state)}\n\n`);

    const client = { id: Date.now(), res };
    clients.push(client);
    console.log(`[${new Date().toLocaleTimeString()}] 🔌 Client connected (${clients.length} total)`);

    req.on('close', () => {
      clients = clients.filter(c => c.id !== client.id);
      console.log(`[${new Date().toLocaleTimeString()}] 🔌 Client disconnected (${clients.length} remaining)`);
    });
    return;
  }

  // ── API: current state ────────────────────────────────────────
  if (pathname === '/api/state') {
    const data = JSON.stringify(getFullState(), null, 2);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
    return;
  }

  // ── API: post to group chat ───────────────────────────────────
  if (pathname === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const msg  = JSON.parse(body);
        const chat = readJSON(path.join(ROOT, 'group-chat.json')) || { messages: [] };
        msg.id        = `msg-${Date.now()}-web`;
        msg.timestamp = new Date().toISOString();
        chat.messages.push(msg);
        fs.writeFileSync(path.join(ROOT, 'group-chat.json'), JSON.stringify(chat, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Static files ──────────────────────────────────────────────
  let filePath = pathname === '/' ? '/sprint-dashboard.html' : pathname;

  // Inject SSE client script into the dashboard HTML
  if (filePath === '/sprint-dashboard.html') {
    try {
      let html = fs.readFileSync(path.join(ROOT, 'sprint-dashboard.html'), 'utf8');

      // Inject live update script before </body>
      const liveScript = `
<script>
/* ── ADLC Live Dashboard SSE Client ── */
(function() {
  const PORT = ${PORT};
  let evtSource;

  function connect() {
    evtSource = new EventSource('http://localhost:' + PORT + '/events');

    evtSource.addEventListener('init', function(e) {
      applyState(JSON.parse(e.data));
      showBanner('🟢 Live — connected to dashboard server', 'green');
    });

    evtSource.addEventListener('update', function(e) {
      applyState(JSON.parse(e.data));
      flashBanner();
    });

    evtSource.onerror = function() {
      showBanner('🔴 Disconnected — retrying...', '#fb7185');
      setTimeout(connect, 3000);
    };
  }

  function applyState(state) {
    if (!state) return;
    const agents = state.status?.agents || {};
    const agentOrder = ['vikram','rohan','kiran','rasool','kavya','keerthi'];

    agentOrder.forEach((id, i) => {
      const a = agents[id];
      if (!a) return;
      const card = document.getElementById('card-' + id);
      if (!card) return;

      // Update progress bar
      const fill = card.querySelector('.progress-fill');
      const pct  = card.querySelector('.progress-pct');
      const slider = card.querySelector('.progress-slider');
      if (fill)   fill.style.width = (a.progress || 0) + '%';
      if (pct)    pct.textContent  = (a.progress || 0) + '%';
      if (slider) slider.value     = a.progress || 0;

      // Update task
      const taskEl = card.querySelector('.task-name');
      if (taskEl && a.task) taskEl.textContent = a.task;

      // Update last update time
      const updEl = card.querySelector('.last-update');
      if (updEl && a.updated) updEl.textContent = 'Last update: ' + new Date(a.updated).toLocaleTimeString('en-GB');
    });

    // Update global stats
    if (typeof updateStats === 'function') updateStats();

    // Update group chat badge if new messages
    const chatCount = state.chat?.messages?.length || 0;
    const badge = document.getElementById('chatBadge');
    if (badge) badge.textContent = chatCount + ' messages';

    // Update requirement badge
    const req = state.req;
    const reqEl = document.getElementById('reqStatus');
    if (reqEl && req?.title) {
      reqEl.textContent = req.title + ' [' + (req.status || '') + ']';
    }
  }

  function showBanner(msg, color) {
    let banner = document.getElementById('liveBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'liveBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;padding:6px 16px;font-family:monospace;font-size:11px;display:flex;align-items:center;gap:8px;';
      document.body.prepend(banner);
    }
    banner.style.background = color === 'green' ? 'rgba(4,120,87,0.95)' : 'rgba(127,29,29,0.95)';
    banner.style.color = '#fff';
    banner.innerHTML = msg + ' <span style="margin-left:auto;opacity:0.6">localhost:' + PORT + '</span>';
  }

  function flashBanner() {
    const banner = document.getElementById('liveBanner');
    if (banner) {
      banner.style.background = 'rgba(37,99,235,0.95)';
      banner.innerHTML = '⚡ Update received — ' + new Date().toLocaleTimeString('en-GB') + ' <span style="margin-left:auto;opacity:0.6">localhost:' + PORT + '</span>';
      setTimeout(() => showBanner('🟢 Live — connected to dashboard server', 'green'), 2000);
    }
  }

  connect();
})();
</script>`;

      html = html.replace('</body>', liveScript + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (e) {
      res.writeHead(500); res.end('Error loading dashboard: ' + e.message);
    }
    return;
  }

  // Serve other static files
  const abs = path.join(ROOT, filePath);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    const ext  = path.extname(abs);
    const mime = MIME[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(abs).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  🚀  ADLC Live Dashboard Server                              ║`);
  console.log(`║  Author: Tarun Vangari                                        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  📊  Dashboard:   http://localhost:${PORT}`);
  console.log(`  📡  SSE Events:  http://localhost:${PORT}/events`);
  console.log(`  🔌  API State:   http://localhost:${PORT}/api/state`);
  console.log(`  💬  Post Chat:   POST http://localhost:${PORT}/api/chat`);
  console.log(`\n  Watching ${WATCHED_FILES.length} files for live updates...`);
  console.log('  Press Ctrl+C to stop\n');
});
