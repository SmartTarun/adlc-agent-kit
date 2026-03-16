/**
 * dashboard-server.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit -- Team Panchayat
 * Date: 2026-03-15
 *
 * Live Dashboard Server -- serves sprint-board.html on a local port
 * with real-time push via Server-Sent Events (SSE).
 * All changes to agent-status.json, group-chat.json, requirement.json
 * are instantly pushed to all connected browsers -- no manual refresh needed.
 *
 * Usage:
 *   node dashboard-server.js          -> start on default port 3000
 *   node dashboard-server.js --port 8080
 *
 * API endpoints:
 *   GET  /api/state                  -- current full state (JSON)
 *   POST /api/chat                   -- post a message to group chat
 *   POST /api/requirement            -- post a new requirement (from wizard)
 *   POST /api/requirement/approve    -- Tarun approves the sprint plan
 *   GET  /events                     -- SSE stream
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const ROOT   = __dirname;
const PORT   = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? parseInt(process.argv[i+1]) : 3000; })();
const AGENTS = ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'];

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

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
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
  const chat    = readJSON(path.join(ROOT, 'group-chat.json'))     || { channel: 'team-panchayat-general', messages: [] };
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

function postToChat(from, role, type, message, tags) {
  const chatFile = path.join(ROOT, 'group-chat.json');
  const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
  if (!chat.messages) chat.messages = [];
  chat.messages.push({
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    from, role, type, message,
    tags:      tags || [],
    timestamp: new Date().toISOString(),
  });
  writeJSON(chatFile, chat);
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
          console.log(`[${new Date().toLocaleTimeString()}] Changed: ${rel} -> pushed to ${clients.length} client(s)`);
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

// CORS headers helper
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Read body helper
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) reject(new Error('Body too large')); });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    cors(res); res.writeHead(204); res.end(); return;
  }

  // -- SSE endpoint ----------------------------------------------
  if (pathname === '/events') {
    cors(res);
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('retry: 2000\n\n');
    const state = getFullState();
    res.write(`event: init\ndata: ${JSON.stringify(state)}\n\n`);
    const client = { id: Date.now(), res };
    clients.push(client);
    console.log(`[${new Date().toLocaleTimeString()}] Client connected (${clients.length} total)`);
    req.on('close', () => {
      clients = clients.filter(c => c.id !== client.id);
      console.log(`[${new Date().toLocaleTimeString()}] Client disconnected (${clients.length} remaining)`);
    });
    return;
  }

  // -- API: current state -----------------------------------------
  if (pathname === '/api/state') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getFullState(), null, 2));
    return;
  }

  // -- API: post to group chat ------------------------------------
  if (pathname === '/api/chat' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const msg  = JSON.parse(body);
      // Normalise: accept either 'from' or 'sender' field
      if (!msg.from && msg.sender) msg.from = msg.sender;
      if (!msg.role)      msg.role      = 'user';
      if (!msg.type)      msg.type      = 'message';
      msg.id        = `msg-${Date.now()}-web`;
      msg.timestamp = new Date().toISOString();
      const chatFile = path.join(ROOT, 'group-chat.json');
      const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
      if (!chat.messages) chat.messages = [];
      chat.messages.push(msg);
      writeJSON(chatFile, chat);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: post new requirement (from wizard) --------------------
  if (pathname === '/api/requirement' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const req_id = `REQ-${Date.now()}`;
      const reqObj = {
        requirementId:   req_id,
        postedBy:        'Tarun Vangari',
        postedAt:        new Date().toISOString(),
        sprint:          data.sprint       || '',
        type:            data.type         || 'new_feature',
        title:           data.title        || '',
        description:     data.description  || '',
        businessGoal:    data.businessGoal || '',
        targetUsers:     data.targetUsers  || '',
        techConstraints: Array.isArray(data.techConstraints) ? data.techConstraints
                         : (data.techConstraints || '').split(',').map(s => s.trim()).filter(Boolean),
        deadline:        data.deadline     || '',
        priority:        data.priority     || 'medium',
        status:          'pending_analysis',
        agentInputs:     Object.fromEntries(
          AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])
        ),
        sprintPlan:      '',
        approvedByTarun: false,
      };
      writeJSON(path.join(ROOT, 'requirement.json'), reqObj);

      // Reset agent statuses
      const statusData = readJSON(path.join(ROOT, 'agent-status.json')) || { agents: {} };
      statusData.sprint = data.sprint || statusData.sprint || '01';
      AGENTS.forEach(a => {
        statusData.agents[a] = {
          status: 'queue', progress: 0,
          task: 'Awaiting requirement analysis',
          blocker: '', updated: new Date().toISOString(),
        };
      });
      writeJSON(path.join(ROOT, 'agent-status.json'), statusData);

      // Post to group chat
      postToChat('TARUN', 'Product Owner', 'requirement',
        `NEW REQUIREMENT [${req_id}] "${reqObj.title}" | Sprint-${reqObj.sprint} | Priority: ${reqObj.priority.toUpperCase()}`,
        ['requirement', `sprint-${reqObj.sprint}`]);
      postToChat('TARUN', 'Product Owner', 'broadcast',
        `${reqObj.description}${reqObj.businessGoal ? ' | Goal: ' + reqObj.businessGoal : ''}${reqObj.targetUsers ? ' | Users: ' + reqObj.targetUsers : ''}${reqObj.techConstraints.length ? ' | Constraints: ' + reqObj.techConstraints.join(', ') : ''}`,
        ['requirement-detail']);
      postToChat('ARJUN', 'Orchestrator', 'broadcast',
        `All agents - new requirement received: "${reqObj.title}". Read requirement.json and post your analysis.`,
        ['action-required', 'all-agents']);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, requirementId: req_id }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: approve sprint plan -----------------------------------
  if (pathname === '/api/requirement/approve' && req.method === 'POST') {
    cors(res);
    try {
      const reqObj = readJSON(path.join(ROOT, 'requirement.json'));
      if (!reqObj || !reqObj.requirementId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active requirement' })); return;
      }
      reqObj.approvedByTarun = true;
      reqObj.status = 'in_sprint';
      writeJSON(path.join(ROOT, 'requirement.json'), reqObj);

      // Move non-keerthi agents to wip
      const statusData = readJSON(path.join(ROOT, 'agent-status.json')) || { agents: {} };
      ['arjun','vikram','rasool','kavya','kiran','rohan'].forEach(a => {
        if (statusData.agents[a]) statusData.agents[a].status = 'wip';
      });
      writeJSON(path.join(ROOT, 'agent-status.json'), statusData);

      postToChat('TARUN', 'Product Owner', 'broadcast',
        'SPRINT PLAN APPROVED by Tarun. All agents - sprint is GO. Begin execution now.',
        ['approved', `sprint-${reqObj.sprint}`]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- Static files -----------------------------------------------
  // Serve sprint-board.html (the active Kanban dashboard) at /
  let filePath = (pathname === '/' || pathname === '/index.html') ? '/sprint-board.html' : pathname;

  // Inject SSE client into the sprint-board
  if (filePath === '/sprint-board.html' || filePath === '/sprint-dashboard.html') {
    try {
      // Always serve sprint-board.html (the active one)
      let html = fs.readFileSync(path.join(ROOT, 'sprint-board.html'), 'utf8');
      const liveScript = `<script>
/* ADLC Live Dashboard -- SSE auto-connect injected by dashboard-server.js */
(function(){
  const PORT = ${PORT};
  let src;
  function connect(){
    src = new EventSource('http://localhost:' + PORT + '/events');
    src.addEventListener('init',   e => { window.dispatchEvent(new CustomEvent('panchayat-state', {detail: JSON.parse(e.data)})); showStatus('live'); });
    src.addEventListener('update', e => { window.dispatchEvent(new CustomEvent('panchayat-state', {detail: JSON.parse(e.data)})); flashStatus(); });
    src.onerror = () => { showStatus('error'); setTimeout(connect, 3000); };
  }
  function showStatus(s){
    const el = document.getElementById('sse-status');
    if(!el) return;
    if(s==='live')  { el.textContent='[?] Live';         el.style.color='var(--green,#3fb950)'; }
    if(s==='error') { el.textContent='[?] Reconnecting'; el.style.color='var(--red,#f85149)';   }
  }
  function flashStatus(){
    const el = document.getElementById('sse-status');
    if(!el) return;
    el.textContent='[?] Updated'; el.style.color='var(--yellow,#e3b341)';
    setTimeout(()=>showStatus('live'), 1500);
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
    const mime = MIME[path.extname(abs)] || 'text/plain';
    cors(res);
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(abs).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found: ' + pathname);
  }
});

server.listen(PORT, () => {
  const dashUrl = `http://localhost:${PORT}`;
  console.log('\n============================================================');
  console.log('  ADLC Live Dashboard Server -- Team Panchayat');
  console.log('  Author: Tarun Vangari');
  console.log('============================================================');
  console.log(`\n  Dashboard:     ${dashUrl}   <- OPEN THIS`);
  console.log(`  SSE Events:    ${dashUrl}/events`);
  console.log(`  API State:     GET  ${dashUrl}/api/state`);
  console.log(`  Post Chat:     POST ${dashUrl}/api/chat`);
  console.log(`  New Req:       POST ${dashUrl}/api/requirement`);
  console.log(`  Approve Plan:  POST ${dashUrl}/api/requirement/approve`);
  console.log(`\n  Watching ${WATCHED_FILES.length} files for live updates...`);
  console.log('  Press Ctrl+C to stop\n');

  if (process.env.SKIP_BROWSER !== '1') {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32'  ? `start "" "${dashUrl}"`
              : process.platform === 'darwin' ? `open "${dashUrl}"`
              : `xdg-open "${dashUrl}"`;
    exec(cmd, err => { if (!err) console.log(`  Browser opened at ${dashUrl}\n`); });
  }
});
