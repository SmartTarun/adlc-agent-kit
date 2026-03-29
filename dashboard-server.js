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
 *   POST /api/chat                   -- post a message to group chat (supports file attachments)
 *   POST /api/requirement            -- post a new requirement (from wizard)
 *   POST /api/requirement/approve    -- Tarun approves the sprint plan
 *   GET  /events                     -- SSE stream
 *   GET  /uploads/<filename>         -- serve uploaded chat attachment files
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { spawn } = require('child_process');

const ROOT        = __dirname;
const PORT        = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? parseInt(process.argv[i+1]) : 3000; })();
const AGENTS      = ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'];
const UPLOADS_DIR = path.join(ROOT, 'chat-uploads');
const LOGS_DIR    = path.join(ROOT, 'agent-logs');

// Ensure required directories exist on startup
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR))    fs.mkdirSync(LOGS_DIR,    { recursive: true });

// -- Agent process tracking --------------------------------------------------
const agentProcesses = {}; // { agentName: { proc, pid, startedAt } }

function getAgentModel(agentName) {
  try {
    const prompt = fs.readFileSync(path.join(ROOT, 'prompts', `${agentName}-prompt.txt`), 'utf8');
    const m = prompt.match(/# Model:\s*(\S+)/);
    return m ? m[1] : 'claude-sonnet-4-6';
  } catch { return 'claude-sonnet-4-6'; }
}

function launchAgent(agentName) {
  const existing = agentProcesses[agentName];
  if (existing && existing.proc && existing.proc.exitCode === null) {
    return { ok: false, error: 'already running' };
  }
  const promptFile = path.join(ROOT, 'prompts', `${agentName}-prompt.txt`);
  if (!fs.existsSync(promptFile)) return { ok: false, error: 'no prompt file' };

  const promptContent = fs.readFileSync(promptFile, 'utf8');
  const model   = getAgentModel(agentName);
  const logPath = path.join(LOGS_DIR, `${agentName}.log`);

  const proc = spawn('claude', [
    '--print',
    '--model', model,
    '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch',
  ], { cwd: ROOT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdin.write(promptContent);
  proc.stdin.end();

  agentProcesses[agentName] = { proc, pid: proc.pid, startedAt: new Date().toISOString() };

  // Mark agent as wip immediately — write flat format so getFullState() normalises cleanly
  const pr = getProjectRoot();
  const statusData = readJSON(path.join(pr, 'agent-status.json')) || {};
  const agentsMap = statusData.agents || statusData;
  agentsMap[agentName] = { status: 'wip', progress: 5, task: 'Agent starting…', blocker: '', updated: new Date().toISOString() };
  if (statusData.agents) statusData.agents = agentsMap; else Object.assign(statusData, agentsMap);
  writeJSON(path.join(pr, 'agent-status.json'), statusData);

  proc.stdout.on('data', chunk => {
    fs.appendFileSync(logPath, chunk.toString());
    broadcast('agent-log', { agent: agentName, text: chunk.toString() });
  });
  proc.stderr.on('data', chunk => {
    fs.appendFileSync(logPath, '[ERR] ' + chunk.toString());
  });
  proc.on('exit', code => {
    const pr2 = getProjectRoot();
    const sd = readJSON(path.join(pr2, 'agent-status.json')) || {};
    const am = sd.agents || sd;
    if (am[agentName]) {
      am[agentName].status  = code === 0 ? 'done' : 'blocked';
      am[agentName].blocker = code !== 0 ? `Exited with code ${code}` : '';
      am[agentName].updated = new Date().toISOString();
    }
    if (sd.agents) sd.agents = am; else Object.assign(sd, am);
    writeJSON(path.join(pr2, 'agent-status.json'), sd);
    broadcast('update', getFullState());
    postToChat('SYSTEM', 'System', 'system',
      `Agent ${agentName.toUpperCase()} ${code === 0 ? 'completed ✅' : `exited with code ${code} ❌`}`,
      [agentName]);
  });

  return { ok: true, pid: proc.pid };
}

function stopAllAgents() {
  let stopped = 0;
  for (const [, info] of Object.entries(agentProcesses)) {
    if (info.proc && info.proc.exitCode === null) {
      try { info.proc.kill(); stopped++; } catch {}
    }
  }
  return stopped;
}

// -- Multi-project support -----------------------------------------------

// Returns absolute path to the currently active project folder.
// Reads active-project.json on every call so switching projects is instant.
function getProjectRoot() {
  try {
    const ap = JSON.parse(fs.readFileSync(path.join(ROOT, 'active-project.json'), 'utf8'));
    const rel = ap.current || '.';
    return rel === '.' ? ROOT : path.resolve(ROOT, rel);
  } catch {
    return ROOT;
  }
}

// Lists all projects from the local projects/ folder.
// Reads requirement.json if present, falls back to PROJECT-MEMORY.md,
// then bare folder name — so every project directory is always shown.
function getProjects() {
  const projects  = [];
  const activeRoot = getProjectRoot();

  // Parse PROJECT-MEMORY.md for name/sprint/status when requirement.json is absent
  function parseMemory(folderAbs) {
    try {
      const md = fs.readFileSync(path.join(folderAbs, 'PROJECT-MEMORY.md'), 'utf8');
      const nameMatch   = md.match(/^#\s+Project Memory\s*[—-]\s*(.+)$/m);
      const sprintMatch = md.match(/\*\*Sprint\*\*:\s*(\S+)/);
      const statusMatch = md.match(/\*\*Status\*\*:\s*(\S+)/);
      return {
        name:   nameMatch   ? nameMatch[1].trim()   : null,
        sprint: sprintMatch ? sprintMatch[1].trim() : '',
        status: statusMatch ? statusMatch[1].trim() : 'pending',
      };
    } catch { return null; }
  }

  const projectsDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projectsDir)) {
    fs.readdirSync(projectsDir).sort().forEach(folder => {
      const folderAbs  = path.join(projectsDir, folder);
      try { if (!fs.statSync(folderAbs).isDirectory()) return; } catch { return; }

      const req    = readJSON(path.join(folderAbs, 'requirement.json'));
      const memory = parseMemory(folderAbs);

      const id     = (req && req.requirementId) || folder;
      const name   = (req && req.title) || (memory && memory.name) || folder;
      const sprint = (req && req.sprint) || (memory && memory.sprint) || '';
      const status = (req && req.status) || (memory && memory.status) || 'pending';

      // Read agent-status from project folder if it exists, else root
      const agentStatusPath = fs.existsSync(path.join(folderAbs, 'agent-status.json'))
        ? path.join(folderAbs, 'agent-status.json')
        : path.join(ROOT, 'agent-status.json');
      const agentStatus = readJSON(agentStatusPath) || {};
      const agentsMap   = agentStatus.agents || agentStatus;

      projects.push({
        id,
        name,
        sprint,
        status,
        path:      'projects/' + folder,
        isActive:  activeRoot === folderAbs,
        agents:    agentsMap,
        createdAt: req ? req.postedAt : null,
      });
    });
  }
  return projects;
}

// Switch the active project and broadcast the new state.
function switchActiveProject(relPath, meta) {
  const ap = { current: relPath, updatedAt: new Date().toISOString(), ...meta };
  fs.writeFileSync(path.join(ROOT, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
  projectsCache = null; // bust cache on switch
  // Re-init watchers for the new project root
  startWatching();
  broadcast('project-switch', { activeProject: ap, state: getFullState() });
  console.log(`[${new Date().toLocaleTimeString()}] Project switched -> ${relPath}`);
}

// -- File watchers (dynamic, reset on project switch) --------------------
let watchers = [];
let fileCache = {};

function startWatching() {
  // Tear down existing watchers
  watchers.forEach(w => { try { w.close(); } catch {} });
  watchers = [];
  fileCache = {};

  const pr = getProjectRoot();
  const targets = ['agent-status.json', 'group-chat.json', 'requirement.json'];
  const memDir  = path.join(pr, 'agent-memory');
  if (fs.existsSync(memDir)) {
    try { fs.readdirSync(memDir).forEach(f => targets.push('agent-memory/' + f)); } catch {}
  }

  // Watch files in the active project folder
  targets.forEach(rel => {
    const abs = path.join(pr, rel);
    if (!fs.existsSync(abs)) return;
    try {
      const debounceMs = rel === 'group-chat.json' ? 50 : 300;
      const w = fs.watch(abs, () => {
        setTimeout(() => {
          try {
            const content = fs.readFileSync(abs, 'utf8');
            if (content !== fileCache[abs]) {
              fileCache[abs] = content;
              broadcast('update', getFullState());
              console.log(`[${new Date().toLocaleTimeString()}] Changed: ${rel} -> pushed to ${clients.length} client(s)`);
            }
          } catch {}
        }, debounceMs);
      });
      watchers.push(w);
    } catch {}
  });

  // Also watch ROOT agent-status.json and group-chat.json when project is in a subfolder
  // — agents write to ROOT (their cwd), so we must watch there too
  if (pr !== ROOT) {
    ['agent-status.json', 'group-chat.json'].forEach(rel => {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) return;
      try {
        const debounceMs = rel === 'group-chat.json' ? 50 : 300;
        const w = fs.watch(abs, () => {
          setTimeout(() => {
            try {
              const content = fs.readFileSync(abs, 'utf8');
              if (content !== fileCache[abs]) {
                fileCache[abs] = content;
                broadcast('update', getFullState());
                console.log(`[${new Date().toLocaleTimeString()}] ROOT Changed: ${rel} -> pushed to ${clients.length} client(s)`);
              }
            } catch {}
          }, debounceMs);
        });
        watchers.push(w);
      } catch {}
    });
  }
}

// Connected SSE clients
let clients = [];

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

// Enterprise: only send last N messages to dashboard (avoids huge SSE payloads)
const CHAT_DASHBOARD_WINDOW = 50;

function getFullState() {
  const pr         = getProjectRoot();

  // Merge agent status from both project folder AND root.
  // Agents write to ROOT (their cwd), dashboard reads from project folder.
  // We merge both, preferring the entry with the more recent `updated` timestamp.
  const projectStatus = readJSON(path.join(pr, 'agent-status.json')) || {};
  const rootStatus    = pr !== ROOT ? (readJSON(path.join(ROOT, 'agent-status.json')) || {}) : {};
  const projectAgents = projectStatus.agents || projectStatus;
  const rootAgents    = rootStatus.agents    || rootStatus;
  const agents = { ...projectAgents };
  for (const [name, rootEntry] of Object.entries(rootAgents)) {
    const projEntry = agents[name];
    if (!projEntry) { agents[name] = rootEntry; continue; }
    const rootTime = rootEntry.updated ? new Date(rootEntry.updated).getTime() : 0;
    const projTime = projEntry.updated ? new Date(projEntry.updated).getTime() : 0;
    if (rootTime > projTime) agents[name] = rootEntry;
  }
  const rawChat    = readJSON(path.join(pr, 'group-chat.json'))   || { channel: 'team-panchayat-general', messages: [] };
  const req        = readJSON(path.join(pr, 'requirement.json'))  || {};
  const memory     = {};
  try {
    fs.readdirSync(path.join(pr, 'agent-memory')).forEach(f => {
      const agent = f.replace('-memory.json', '');
      memory[agent] = readJSON(path.join(pr, 'agent-memory', f));
    });
  } catch {}
  const activeProject = readJSON(path.join(ROOT, 'active-project.json')) || { current: '.', name: 'Default' };
  const projects = getProjectsCached();

  // Windowed chat: send last CHAT_DASHBOARD_WINDOW messages + totalCount for UI
  const allMessages = rawChat.messages || [];
  const chat = {
    channel:    rawChat.channel || 'team-panchayat-general',
    totalCount: allMessages.length,
    messages:   allMessages.slice(-CHAT_DASHBOARD_WINDOW),
  };

  return { agents, chat, req, memory, activeProject, projects, timestamp: new Date().toISOString() };
}

function postToChat(from, role, type, message, tags) {
  const chatFile = path.join(getProjectRoot(), 'group-chat.json');
  const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
  if (!chat.messages) chat.messages = [];
  const msg = {
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    from, role, type, message,
    tags:      tags || [],
    timestamp: new Date().toISOString(),
  };
  chat.messages.push(msg);
  writeJSON(chatFile, chat);
  // Push just the new message instantly — no file-watcher delay
  broadcast('chat-message', msg);
}

// Cache sprint-board.html at startup so it is not re-read on every request
let cachedHtml = null;
let cachedHtmlMtime = 0;
function getHtml() {
  const htmlPath = path.join(ROOT, 'sprint-board.html');
  try {
    const mtime = fs.statSync(htmlPath).mtimeMs;
    if (!cachedHtml || mtime !== cachedHtmlMtime) {
      cachedHtml = fs.readFileSync(htmlPath, 'utf8');
      cachedHtmlMtime = mtime;
    }
  } catch {}
  return cachedHtml || '';
}
// Warm the cache on startup
getHtml();

// Cache getProjects() — only invalidates on project switch or every 10s
let projectsCache = null;
let projectsCacheAt = 0;
const PROJECTS_CACHE_TTL = 10000;
function getProjectsCached() {
  const now = Date.now();
  if (!projectsCache || now - projectsCacheAt > PROJECTS_CACHE_TTL) {
    projectsCache = getProjects();
    projectsCacheAt = now;
  }
  return projectsCache;
}

// Start watching files for the active project
startWatching();

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

  // -- Static file server: /uploads/<filename> -------------------
  if (pathname.startsWith('/uploads/')) {
    const filename  = path.basename(decodeURIComponent(pathname.slice('/uploads/'.length)));
    const filePath  = path.join(UPLOADS_DIR, filename);
    if (!filePath.startsWith(UPLOADS_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
      webp:'image/webp', svg:'image/svg+xml', pdf:'application/pdf',
      json:'application/json', txt:'text/plain', md:'text/markdown',
      js:'text/javascript', py:'text/plain', tf:'text/plain', hcl:'text/plain',
      yml:'text/plain', yaml:'text/plain', sh:'text/plain', ps1:'text/plain',
      zip:'application/zip', gz:'application/gzip',
    };
    res.writeHead(200, {
      'Content-Type':        mimeTypes[ext] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control':       'public, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // -- API: MCP config (GET + POST) --------------------------------
  if (pathname === '/api/mcp/config') {
    cors(res);
    const CONN_FILE    = path.join(ROOT, 'connections.json');
    const CLAUDE_DIR   = path.join(ROOT, '.claude');
    const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

    if (req.method === 'GET') {
      const cfg = readJSON(CONN_FILE) || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        db:       cfg.database?.url      || '',
        dbType:   cfg.database?.type     || 'postgres',
        gh:       cfg.github?.token      || '',
        ghOwner:  cfg.github?.owner      || '',
        aws:      cfg.aws?.region        || '',
        mysql:    cfg.mysql?.url         || '',
        oracle:   cfg.oracle?.url        || '',
        sqlite:   cfg.sqlite?.path       || '',
        custom:   cfg.custom?.mcpUrl     || '',
      }));
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const existing = readJSON(CONN_FILE) || {};

        // Save raw credentials
        if (body.db !== undefined)     { existing.database = { ...existing.database, url: body.db, type: body.dbType || 'postgres' }; }
        if (body.gh !== undefined)     { existing.github   = { ...existing.github,   token: body.gh, owner: body.ghOwner || '' }; }
        if (body.aws !== undefined)    { existing.aws      = { ...existing.aws,      region: body.aws }; }
        if (body.mysql !== undefined)  { existing.mysql    = { ...existing.mysql,    url: body.mysql }; }
        if (body.oracle !== undefined) { existing.oracle   = { ...existing.oracle,   url: body.oracle }; }
        if (body.sqlite !== undefined) { existing.sqlite   = { ...existing.sqlite,   path: body.sqlite }; }
        if (body.custom !== undefined) { existing.custom   = { ...existing.custom,   mcpUrl: body.custom }; }
        writeJSON(CONN_FILE, existing);

        // Build mcpServers block for .claude/settings.json
        const settings  = readJSON(SETTINGS_FILE) || {};
        const mcpServers = settings.mcpServers || {};

        // PostgreSQL
        if (existing.database?.url) {
          mcpServers['postgres'] = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', existing.database.url] };
        } else { delete mcpServers['postgres']; }

        // MySQL
        if (existing.mysql?.url) {
          mcpServers['mysql'] = { command: 'npx', args: ['-y', 'mcp-server-mysql', '--url', existing.mysql.url] };
        } else { delete mcpServers['mysql']; }

        // Oracle
        if (existing.oracle?.url) {
          mcpServers['oracle'] = { command: 'npx', args: ['-y', 'mcp-server-oracle', '--url', existing.oracle.url] };
        } else { delete mcpServers['oracle']; }

        // SQLite
        if (existing.sqlite?.path) {
          mcpServers['sqlite'] = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', existing.sqlite.path] };
        } else { delete mcpServers['sqlite']; }

        // GitHub
        if (existing.github?.token) {
          mcpServers['github'] = {
            command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: existing.github.token }
          };
        } else { delete mcpServers['github']; }

        // Custom MCP
        if (existing.custom?.mcpUrl) {
          mcpServers['custom'] = { command: 'npx', args: ['-y', 'mcp-remote', existing.custom.mcpUrl] };
        } else { delete mcpServers['custom']; }

        settings.mcpServers = mcpServers;
        if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
        writeJSON(SETTINGS_FILE, settings);

        const activeCount = Object.keys(mcpServers).length;
        console.log(`[${new Date().toLocaleTimeString()}] MCP config saved — ${activeCount} server(s) active`);
        postToChat('SYSTEM', 'System', 'system',
          `🔌 MCP config updated — ${activeCount} server(s) active: ${Object.keys(mcpServers).join(', ') || 'none'}. Agents will use these on next launch.`,
          ['all-agents']);
        broadcast('update', getFullState());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, active: Object.keys(mcpServers) }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
  }

  // -- API: context file upload ------------------------------------
  if (pathname === '/api/project/upload-context' && req.method === 'POST') {
    cors(res);
    try {
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) { res.writeHead(400); res.end('Missing boundary'); return; }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);

      // Parse multipart: extract projectId and files
      const parts = raw.toString('binary').split('--' + boundary);
      let projectId = '';
      const savedFiles = [];

      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd < 0) continue;
        const header  = part.slice(0, headerEnd);
        const bodyRaw = part.slice(headerEnd + 4, part.endsWith('\r\n') ? -2 : undefined);

        const nameMatch = header.match(/name="([^"]+)"/);
        const fileMatch = header.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;

        if (nameMatch[1] === 'projectId' && !fileMatch) {
          projectId = bodyRaw.replace(/\r?\n$/, '');
          continue;
        }

        if (fileMatch) {
          const fname   = fileMatch[1].replace(/[^a-zA-Z0-9._-]/g, '_');
          const projDir = projectId
            ? path.join(ROOT, 'projects', projectId, 'context')
            : path.join(ROOT, 'chat-uploads', 'context');
          if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });
          const savePath = path.join(projDir, fname);
          fs.writeFileSync(savePath, Buffer.from(bodyRaw, 'binary'));
          savedFiles.push(fname);
          console.log(`[${new Date().toLocaleTimeString()}] Context file saved: ${savePath}`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, saved: savedFiles }));
    } catch (e) {
      console.error('[upload-context]', e);
      res.writeHead(500); res.end('Upload failed');
    }
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

      // Save file attachments to chat-uploads/ and replace base64 data with URLs
      if (Array.isArray(msg.attachments) && msg.attachments.length) {
        msg.attachments = msg.attachments.map((att, idx) => {
          if (!att.data) return att;  // already a URL reference
          try {
            // Parse dataURL: "data:<mime>;base64,<data>"
            const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) return att;
            const mimeType = match[1];
            const b64Data  = match[2];
            const buf      = Buffer.from(b64Data, 'base64');

            // Build safe filename: timestamp-index-originalname
            const safeName = `${msg.id}-${idx}-${att.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const savePath = path.join(UPLOADS_DIR, safeName);
            fs.writeFileSync(savePath, buf);

            // Return attachment without raw base64 -- just the URL
            return { name: att.name, mimeType: mimeType || att.mimeType, size: att.size, url: `/uploads/${safeName}` };
          } catch (e) {
            console.error('[upload] Failed to save attachment:', att.name, e.message);
            return { name: att.name, mimeType: att.mimeType, size: att.size, error: 'save failed' };
          }
        });
        console.log(`[${new Date().toLocaleTimeString()}] Saved ${msg.attachments.length} attachment(s) for message ${msg.id}`);
      }

      const chatFile = path.join(getProjectRoot(), 'group-chat.json');
      const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
      if (!chat.messages) chat.messages = [];
      chat.messages.push(msg);
      writeJSON(chatFile, chat);
      // Push to all clients instantly
      broadcast('chat-message', msg);

      // Auto-relaunch any agent mentioned by name in Tarun's message
      if (msg.from === 'TARUN' && msg.message) {
        const mentioned = AGENTS.filter(a => a !== 'keerthi' &&
          new RegExp(`\\b${a}\\b`, 'i').test(msg.message));
        for (const agentName of mentioned) {
          const pr = getProjectRoot();
          const sd = readJSON(path.join(pr, 'agent-status.json')) || {};
          const am = sd.agents || sd;
          // Only relaunch if agent is done or not running
          const isRunning = agentProcesses[agentName] &&
            agentProcesses[agentName].proc &&
            agentProcesses[agentName].proc.exitCode === null;
          if (!isRunning) {
            // Extract first sentence of task from message
            const taskHint = msg.message.split(/[.\n]/)[0].trim().substring(0, 100);
            am[agentName] = { status: 'wip', progress: 5, task: taskHint, blocker: '', updated: new Date().toISOString() };
            if (sd.agents) sd.agents = am; else Object.assign(sd, am);
            writeJSON(path.join(pr, 'agent-status.json'), sd);
            broadcast('update', getFullState());
            postToChat('SYSTEM', 'System', 'system',
              `🚀 Auto-launching ${agentName.toUpperCase()} — new task detected in Tarun's message.`,
              [agentName]);
            launchAgent(agentName);
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: get permissions (tool-permissions.json + .claude/settings.json) --
  if (pathname === '/api/permissions' && req.method === 'GET') {
    cors(res);
    const toolPerms    = readJSON(path.join(ROOT, 'tool-permissions.json')) || {};
    const claudeSettings = readJSON(path.join(ROOT, '.claude', 'settings.json')) || { permissions: { allow: [], deny: [] } };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ toolPerms, claudeSettings }));
    return;
  }

  // -- API: save permissions -----------------------------------------------
  if (pathname === '/api/permissions' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);

      // Save tool-permissions.json if provided
      if (data.toolPerms) {
        data.toolPerms._author    = 'Tarun Vangari (tarun.vangari@gmail.com)';
        data.toolPerms.global     = data.toolPerms.global || {};
        data.toolPerms.global.lastUpdated = new Date().toISOString();
        writeJSON(path.join(ROOT, 'tool-permissions.json'), data.toolPerms);
        console.log(`[${new Date().toLocaleTimeString()}] tool-permissions.json updated`);
      }

      // Save .claude/settings.json if provided
      if (data.claudeSettings) {
        const claudeDir = path.join(ROOT, '.claude');
        if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir);
        writeJSON(path.join(claudeDir, 'settings.json'), data.claudeSettings);
        console.log(`[${new Date().toLocaleTimeString()}] .claude/settings.json updated`);
      }

      // Notify agents of permission change via group chat
      postToChat('TARUN', 'Product Owner', 'broadcast',
        'Agent permissions updated by Tarun. Re-read .claude/settings.json if you are in an active session.',
        ['permissions', 'all-agents']);

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
        discoveryComplete: false,
        discoveryPhase:  { currentRound: 0, roundStatus: 'not_started', fastTrack: false, startedAt: '' },
        discoveryAnswers: { round1: {}, round2: {}, round3: {} },
        productBrief:    {},
        agentInputs:     Object.fromEntries(
          AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])
        ),
        sprintPlan:      '',
        approvedByTarun: false,
      };
      const pr = getProjectRoot();
      writeJSON(path.join(pr, 'requirement.json'), reqObj);

      // Reset agent statuses
      const statusData = readJSON(path.join(pr, 'agent-status.json')) || { agents: {} };
      statusData.sprint = data.sprint || statusData.sprint || '';
      AGENTS.forEach(a => {
        statusData.agents[a] = {
          status: 'queue', progress: 0,
          task: 'Awaiting requirement analysis',
          blocker: '', updated: new Date().toISOString(),
        };
      });
      writeJSON(path.join(pr, 'agent-status.json'), statusData);

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
      postToChat('ARJUN', 'Orchestrator', 'system',
        `🚀 Analysis started for "${reqObj.title}"! I'm spinning up the discovery phase now — Vikram, Rasool, Kiran, Kavya, Rohan: please review requirement.json and report your estimates back here. Keerthi stands by for QA once all agents are done.`,
        ['analysis-started', 'all-agents']);

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
      const pr     = getProjectRoot();
      const reqObj = readJSON(path.join(pr, 'requirement.json'));
      if (!reqObj || !reqObj.requirementId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active requirement' })); return;
      }
      reqObj.approvedByTarun = true;
      reqObj.status = 'in_sprint';
      writeJSON(path.join(pr, 'requirement.json'), reqObj);

      // Move non-keerthi agents to wip
      const statusData = readJSON(path.join(pr, 'agent-status.json')) || { agents: {} };
      ['arjun','vikram','rasool','kavya','kiran','rohan'].forEach(a => {
        if (statusData.agents[a]) statusData.agents[a].status = 'wip';
      });
      writeJSON(path.join(pr, 'agent-status.json'), statusData);

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

  // -- API: list all projects -------------------------------------
  if (pathname === '/api/projects' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ projects: getProjects() }));
    return;
  }

  // -- API: switch active project ---------------------------------
  if (pathname === '/api/switch-project' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!data.path) { res.writeHead(400); res.end(JSON.stringify({ error: 'path required' })); return; }
      const absTarget = data.path === '.' ? ROOT : path.resolve(ROOT, data.path);
      if (!fs.existsSync(path.join(absTarget, 'requirement.json'))) {
        res.writeHead(404); res.end(JSON.stringify({ error: 'No requirement.json at that path' })); return;
      }
      const req2 = readJSON(path.join(absTarget, 'requirement.json'));
      switchActiveProject(data.path, {
        id:          req2.requirementId || '',
        name:        req2.title         || data.path,
        sprint:      req2.sprint        || '',
        status:      req2.status        || 'pending',
        description: req2.description   || '',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, active: data.path }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: scaffold + switch to next project --------------------
  // POST /api/next-project  { title, sprint, description, priority }
  if (pathname === '/api/next-project' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const reqId  = 'REQ-' + Date.now();
      const slug   = (data.title || 'new-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const folder = reqId + '-' + slug;
      const absDir = path.join(ROOT, 'projects', folder);

      fs.mkdirSync(absDir, { recursive: true });
      ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
        fs.mkdirSync(path.join(absDir, d), { recursive: true });
      });

      const newReq = {
        requirementId:   reqId,
        postedBy:        'Tarun Vangari',
        postedAt:        new Date().toISOString(),
        sprint:          data.sprint      || '02',
        type:            data.type        || 'new_feature',
        title:           data.title       || 'New Project',
        description:     data.description || '',
        businessGoal:    data.businessGoal|| '',
        targetUsers:     data.targetUsers || '',
        techConstraints: data.techConstraints || [],
        deadline:        data.deadline    || '',
        priority:        data.priority    || 'medium',
        status:          'pending_analysis',
        discoveryComplete: false,
        discoveryPhase:   { currentRound: 0, roundStatus: 'not_started', fastTrack: false, startedAt: '' },
        discoveryAnswers: { round1: {}, round2: {}, round3: {} },
        productBrief:    {},
        agentInputs:     Object.fromEntries(AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])),
        sprintPlan:      '',
        approvedByTarun: false,
      };
      writeJSON(path.join(absDir, 'requirement.json'), newReq);

      const newStatus = {
        sprint: newReq.sprint,
        lastSync: new Date().toISOString(),
        agents: Object.fromEntries(AGENTS.map(a => [a, { status: 'queue', progress: 0, task: 'Awaiting requirement', blocker: '', updated: new Date().toISOString() }])),
      };
      writeJSON(path.join(absDir, 'agent-status.json'), newStatus);
      writeJSON(path.join(absDir, 'group-chat.json'), { channel: 'team-panchayat-general', messages: [] });

      const relPath = 'projects/' + folder;
      switchActiveProject(relPath, { id: reqId, name: newReq.title, sprint: newReq.sprint, status: 'pending_analysis', description: newReq.description });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, projectPath: relPath, requirementId: reqId }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: launch agents ------------------------------------------
  if (pathname === '/api/launch-agents' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const targets = Array.isArray(data.agents) ? data.agents : AGENTS.filter(a => a !== 'keerthi');
      const results = {};
      for (const a of targets) results[a] = launchAgent(a);
      postToChat('SYSTEM', 'System', 'broadcast',
        `🚀 Launching agents: ${targets.join(', ')} — check the agent cards for live progress.`,
        ['system', 'all-agents']);
      broadcast('update', getFullState());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: stop agents --------------------------------------------
  if (pathname === '/api/stop-agents' && req.method === 'POST') {
    cors(res);
    const stopped = stopAllAgents();
    postToChat('SYSTEM', 'System', 'broadcast',
      `⏹ ${stopped} agent process(es) stopped by Tarun.`, ['system']);
    broadcast('update', getFullState());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, stopped }));
    return;
  }

  // -- API: activate Keerthi QA ------------------------------------
  if (pathname === '/api/agent/keerthi/activate' && req.method === 'POST') {
    cors(res);
    const pr = getProjectRoot();
    const statusData = readJSON(path.join(pr, 'agent-status.json')) || {};
    const agentsMap = statusData.agents || statusData;
    agentsMap['keerthi'] = {
      status: 'wip',
      progress: 5,
      task: 'QA gates starting — reviewing all agent outputs',
      blocker: '',
      updated: new Date().toISOString()
    };
    if (statusData.agents) statusData.agents = agentsMap; else Object.assign(statusData, agentsMap);
    writeJSON(path.join(pr, 'agent-status.json'), statusData);
    broadcast('update', getFullState());
    postToChat('KEERTHI', 'QA Engineer', 'broadcast',
      '🟢 Keerthi QA activated — running quality gates across all agent outputs.', ['all-agents']);
    const launch = launchAgent('keerthi');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, launch }));
    return;
  }

  // -- API: agent process status -----------------------------------
  if (pathname === '/api/agent-processes' && req.method === 'GET') {
    cors(res);
    const status = {};
    for (const [name, info] of Object.entries(agentProcesses)) {
      status[name] = {
        running:    info.proc && info.proc.exitCode === null,
        pid:        info.pid,
        startedAt:  info.startedAt,
        exitCode:   info.proc ? info.proc.exitCode : null,
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  // -- Static files -----------------------------------------------
  // Serve sprint-board.html (the active Kanban dashboard) at /
  let filePath = (pathname === '/' || pathname === '/index.html') ? '/sprint-board.html' : pathname;

  // Inject SSE client into the sprint-board
  if (filePath === '/sprint-board.html' || filePath === '/sprint-dashboard.html') {
    try {
      let html = getHtml();
      const liveScript = `<script>
/* ADLC Live Dashboard -- SSE auto-connect injected by dashboard-server.js */
(function(){
  const PORT = ${PORT};
  let src;
  function connect(){
    src = new EventSource('http://localhost:' + PORT + '/events');
    src.addEventListener('init',         e => { window.dispatchEvent(new CustomEvent('panchayat-state',   {detail: JSON.parse(e.data)})); showStatus('live'); });
    src.addEventListener('update',       e => { window.dispatchEvent(new CustomEvent('panchayat-state',   {detail: JSON.parse(e.data)})); flashStatus(); });
    src.addEventListener('chat-message', e => { window.dispatchEvent(new CustomEvent('panchayat-chat-msg',{detail: JSON.parse(e.data)})); flashStatus(); });
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
  console.log(`  Projects:      GET  ${dashUrl}/api/projects`);
  console.log(`  Switch Proj:   POST ${dashUrl}/api/switch-project`);
  console.log(`  Next Project:  POST ${dashUrl}/api/next-project`);
  console.log(`\n  Active project: ${getProjectRoot()}`);
  console.log(`  Watching project files for live updates...`);
  console.log('  Press Ctrl+C to stop\n');

  if (process.env.SKIP_BROWSER !== '1') {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32'  ? `start "" "${dashUrl}"`
              : process.platform === 'darwin' ? `open "${dashUrl}"`
              : `xdg-open "${dashUrl}"`;
    exec(cmd, err => { if (!err) console.log(`  Browser opened at ${dashUrl}\n`); });
  }
});
