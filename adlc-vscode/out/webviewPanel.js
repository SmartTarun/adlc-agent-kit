"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class DashboardPanel {
    static show(context, kitPath, projectMgr) {
        if (DashboardPanel.current) {
            DashboardPanel.current.panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel('adlcDashboard', 'ADLC Sprint Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(kitPath)],
        });
        DashboardPanel.current = new DashboardPanel(panel, kitPath, projectMgr);
        panel.onDidDispose(() => { DashboardPanel.current = undefined; });
    }
    constructor(panel, kitPath, projectMgr) {
        this.panel = panel;
        this.kitPath = kitPath;
        this.panel.webview.html = this.buildHTML();
        // Forward messages from WebView to the kit's dashboard-server
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'api') {
                try {
                    const result = await this.proxyToServer(msg.method, msg.path, msg.body);
                    this.panel.webview.postMessage({ type: 'api-response', id: msg.id, result });
                }
                catch (e) {
                    this.panel.webview.postMessage({ type: 'api-error', id: msg.id, error: e.message });
                }
            }
        });
        // ── Host-side liveness: watch agent-status.json + group-chat.json
        // and push state updates into the WebView every time files change.
        // This means even non-server agent writes (VS Code agents) show live.
        this.startLiveWatcher();
        panel.onDidDispose(() => this.stopLiveWatcher());
    }
    startLiveWatcher() {
        const pr = require('path').join(this.kitPath, (() => {
            try {
                const a = JSON.parse(require('fs').readFileSync(require('path').join(this.kitPath, 'active-project.json'), 'utf8'));
                return a.current === '.' ? '' : (a.current || '');
            }
            catch {
                return '';
            }
        })());
        const watched = [
            require('path').join(pr, 'agent-status.json'),
            require('path').join(pr, 'group-chat.json'),
            require('path').join(this.kitPath, 'agent-status.json'),
            require('path').join(this.kitPath, 'group-chat.json'),
        ];
        let lastJson = '';
        this.liveTimer = setInterval(() => {
            try {
                // Read fresh state directly from files
                const agentStatusRaw = (() => {
                    for (const f of watched.filter(w => w.endsWith('agent-status.json'))) {
                        try {
                            return JSON.parse(require('fs').readFileSync(f, 'utf8'));
                        }
                        catch { }
                    }
                    return {};
                })();
                const json = JSON.stringify(agentStatusRaw);
                if (json !== lastJson) {
                    lastJson = json;
                    const agents = agentStatusRaw.agents || agentStatusRaw;
                    // Push as sse-event so WebView FakeEventSource fires its 'update' listeners
                    this.panel.webview.postMessage({
                        type: 'sse-event', event: 'agent-status', data: agents,
                    });
                }
            }
            catch { }
        }, 2000);
    }
    stopLiveWatcher() {
        if (this.liveTimer) {
            clearInterval(this.liveTimer);
        }
    }
    buildHTML() {
        const htmlFile = path.join(this.kitPath, 'sprint-board.html');
        if (!fs.existsSync(htmlFile)) {
            return `<html><body style="color:white;background:#1e1e1e;padding:40px;font-family:monospace">
        <h2>sprint-board.html not found</h2>
        <p>Expected at: ${htmlFile}</p>
        <p>Make sure adlc.kitPath points to your ADLC-Agent-Kit folder.</p>
      </body></html>`;
        }
        let html = fs.readFileSync(htmlFile, 'utf8');
        // Patch:
        //  1. fetch('/api/*')  → vscode.postMessage proxy
        //  2. new EventSource('/events') → replaced with 3s polling via /api/state
        //     (VS Code WebView cannot connect to localhost SSE directly)
        const patchScript = `
<script>
(function() {
  const vscode = acquireVsCodeApi();
  let _id = 0;
  const _pending = {};

  // ── message bus: receives api-response / api-error / sse-event from host ──
  window.addEventListener('message', e => {
    const msg = e.data;
    if ((msg.type === 'api-response' || msg.type === 'api-error') && _pending[msg.id]) {
      _pending[msg.id](msg);
      delete _pending[msg.id];
    }
    // Forward SSE events injected by the polling loop below
    if (msg.type === 'sse-event') {
      window.dispatchEvent(new CustomEvent('adlc-sse', { detail: msg }));
    }
  });

  // ── patch fetch('/api/*') → postMessage ──────────────────────────────────
  const _fetch = window.fetch.bind(window);
  window.fetch = function(url, opts = {}) {
    if (typeof url === 'string' && url.startsWith('/api')) {
      return new Promise((resolve, reject) => {
        const id = ++_id;
        _pending[id] = msg => {
          if (msg.type === 'api-error') { reject(new Error(msg.error)); return; }
          resolve({
            ok: true, status: 200,
            json: () => Promise.resolve(msg.result),
            text: () => Promise.resolve(typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result)),
          });
        };
        let parsedBody;
        try { parsedBody = opts.body ? JSON.parse(opts.body) : undefined; } catch { parsedBody = opts.body; }
        vscode.postMessage({ type: 'api', id, method: opts.method || 'GET', path: url, body: parsedBody });
      });
    }
    return _fetch(url, opts);
  };

  // ── replace EventSource('/events') with polling via /api/state ───────────
  // The dashboard uses:  const es = new EventSource('/events');
  //                      es.addEventListener('update', handler);
  //                      es.addEventListener('init',   handler);
  // We simulate both events by polling /api/state every 3 seconds.
  let _lastStateJson = '';
  const _sseListeners = {};     // event → [fn, ...]
  let   _pollTimer = null;

  function _pollState() {
    window.fetch('/api/state')
      .then(r => r.json())
      .then(state => {
        const stateJson = JSON.stringify(state);
        // Fire 'init' once, then 'update' only on change
        if (_lastStateJson === '') {
          _fire('init', state);
        } else if (stateJson !== _lastStateJson) {
          _fire('update', state);
        }
        _lastStateJson = stateJson;
      })
      .catch(() => {});         // server not running yet — silently retry
  }

  function _fire(event, data) {
    (_sseListeners[event] || []).forEach(fn => {
      try { fn({ data: JSON.stringify(data), type: event }); } catch {}
    });
    (_sseListeners['message'] || []).forEach(fn => {
      try { fn({ data: JSON.stringify(data), type: event }); } catch {}
    });
  }

  // Fake EventSource class that the dashboard's new EventSource('/events') gets
  class FakeEventSource {
    constructor(url) {
      this.readyState = 1; // OPEN
      // start polling immediately and every 3 seconds
      _pollState();
      _pollTimer = setInterval(_pollState, 3000);
    }
    addEventListener(event, fn) {
      if (!_sseListeners[event]) { _sseListeners[event] = []; }
      _sseListeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (_sseListeners[event]) {
        _sseListeners[event] = _sseListeners[event].filter(f => f !== fn);
      }
    }
    close() { clearInterval(_pollTimer); }
    set onmessage(fn) { this.addEventListener('message', fn); }
    set onerror(fn)   { /* ignore */ }
  }
  window.EventSource = FakeEventSource;

})();
</script>`;
        // ── VS Code DOM patches (applied after load via inline script) ────────────
        // These run AFTER DOMContentLoaded so they can safely query and modify DOM:
        //  • Remove chat input row, attach button, file input
        //  • Replace chat panel header with "Agent Activity" + @agent buttons
        //  • Remove UX and Arch chat input areas
        //  • Add openVSCodeAgent() deep-link function
        const vscodePatchScript = `
<script>
(function applyVSCodePatches() {
  // Run after DOM is ready
  function patch() {

    // ── 1. openVSCodeAgent: deep-link to Copilot Chat ──────────────────────
    window.openVSCodeAgent = function(agentName) {
      const uri = 'vscode://GitHub.copilot-chat/chat?query=' + encodeURIComponent('@' + agentName + ' ');
      window.open(uri, '_self');
    };

    // ── 2. Replace chat header label + strip input row ─────────────────────
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
      chatHeader.innerHTML =
        '<span style="font-weight:700;font-size:13px;color:#fff">📡 Agent Activity</span>' +
        '<small id="chat-msg-count" style="color:rgba(255,255,255,.7);font-size:11px;margin-left:8px">0 messages</small>' +
        '<div style="margin-left:auto;display:flex;gap:5px;align-items:center;flex-wrap:wrap;">' +
          '<span style="font-size:10px;color:rgba(255,255,255,.55)">Chat in VS Code:</span>' +
          ['Arjun','Vikram','Kavya','Kiran','Rasool','Rohan','Keerthi'].map(a =>
            '<button onclick="openVSCodeAgent(\\''+a+'\\')" style="font-size:10px;padding:2px 8px;border-radius:10px;border:none;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;white-space:nowrap">@'+a+'</button>'
          ).join('') +
        '</div>';
    }

    // ── 3. Hide chat input row, attach button, file input ─────────────────
    ['chat-input-row','chat-attach-btn','chat-file-input','chat-input',
     'chat-send','attach-preview','chat-toggle','chat-attach-count'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; }
    });

    // ── 4. Expand chat-messages to fill freed space ────────────────────────
    const msgs = document.getElementById('chat-messages');
    if (msgs) {
      msgs.style.flex = '1';
      msgs.style.overflowY = 'auto';
    }

    // ── 5. Replace UX chat input with VS Code button ───────────────────────
    const uxInput = document.getElementById('ux-chat-input-area');
    if (uxInput) {
      uxInput.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;font-size:12px;color:#7c3aed;">' +
          '<span>💬 Chat with Kavya directly in VS Code:</span>' +
          '<button onclick="openVSCodeAgent(\\'Kavya\\')" style="padding:5px 14px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;font-weight:600">@Kavya in Copilot Chat →</button>' +
        '</div>';
      uxInput.style.padding = '10px 14px';
    }

    // ── 6. Replace Arch chat input with VS Code button ─────────────────────
    const archInput = document.getElementById('arch-chat-input-area');
    if (archInput) {
      archInput.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;font-size:12px;color:#1d4ed8;">' +
          '<span>💬 Chat with Vikram directly in VS Code:</span>' +
          '<button onclick="openVSCodeAgent(\\'Vikram\\')" style="padding:5px 14px;border-radius:8px;border:none;background:#1d4ed8;color:#fff;cursor:pointer;font-size:12px;font-weight:600">@Vikram in Copilot Chat →</button>' +
        '</div>';
      archInput.style.padding = '10px 14px';
    }

    // ── 7. Stub out send functions so no errors if called ─────────────────
    window.sendChat        = function() {};
    window.chatKey         = function() {};
    window.sendUXFeedback  = function() { openVSCodeAgent('Kavya');  };
    window.sendArchFeedback= function() { openVSCodeAgent('Vikram'); };
    window.toggleChat      = function() {};

    // ── 8. Add VS Code banner above kanban ────────────────────────────────
    const kanban = document.getElementById('kanban');
    if (kanban && !document.getElementById('vsc-banner')) {
      const banner = document.createElement('div');
      banner.id = 'vsc-banner';
      banner.style.cssText = 'background:linear-gradient(90deg,#1e1e2e,#264f78);border-radius:8px;padding:8px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;font-size:12px;color:#9cdcfe;';
      banner.innerHTML =
        '<span style="font-size:16px">$(vscode-logo)</span>' +
        '<span style="flex:1">Chat with agents in <strong style="color:#fff">VS Code Copilot Chat</strong> — activity appears here live</span>' +
        ['Arjun','Vikram','Kavya','Kiran'].map(a =>
          '<button onclick="openVSCodeAgent(\\''+a+'\\')" style="padding:3px 10px;border-radius:8px;border:1px solid rgba(156,220,254,.3);background:transparent;color:#9cdcfe;cursor:pointer;font-size:11px">@'+a+'</button>'
        ).join('');
      kanban.parentNode.insertBefore(banner, kanban);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patch);
  } else {
    patch();
  }
})();
</script>`;
        return html
            .replace('<head>', '<head>' + patchScript)
            .replace('</body>', vscodePatchScript + '</body>');
    }
    async proxyToServer(method, apiPath, body) {
        const http = require('http');
        const port = vscode.workspace.getConfiguration('adlc').get('serverPort') || 3000;
        return new Promise((resolve, reject) => {
            const payload = body ? JSON.stringify(body) : undefined;
            const opts = {
                hostname: '127.0.0.1', port, path: apiPath, method: method || 'GET',
                headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
            };
            const req = http.request(opts, (res) => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => { try {
                    resolve(JSON.parse(data));
                }
                catch {
                    resolve(data);
                } });
            });
            req.on('error', reject);
            if (payload) {
                req.write(payload);
            }
            req.end();
        });
    }
}
exports.DashboardPanel = DashboardPanel;
//# sourceMappingURL=webviewPanel.js.map