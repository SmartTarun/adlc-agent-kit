// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { ProjectManager } from './projectManager';

export class DashboardPanel {
  private static current: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly kitPath: string;

  static show(context: vscode.ExtensionContext, kitPath: string, projectMgr: ProjectManager) {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'adlcDashboard',
      'ADLC Sprint Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts:          true,
        retainContextWhenHidden: true,
        localResourceRoots:     [vscode.Uri.file(kitPath)],
      }
    );
    DashboardPanel.current = new DashboardPanel(panel, kitPath, projectMgr);
    panel.onDidDispose(() => { DashboardPanel.current = undefined; });
  }

  private liveTimer: NodeJS.Timeout | undefined;

  private constructor(panel: vscode.WebviewPanel, kitPath: string, projectMgr: ProjectManager) {
    this.panel   = panel;
    this.kitPath = kitPath;
    this.panel.webview.html = this.buildHTML();

    // Forward messages from WebView to the kit's dashboard-server
    this.panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'api') {
        try {
          const result = await this.proxyToServer(msg.method, msg.path, msg.body);
          this.panel.webview.postMessage({ type: 'api-response', id: msg.id, result });
        } catch (e: any) {
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

  private startLiveWatcher() {
    const pr = require('path').join(
      this.kitPath,
      (() => {
        try {
          const a = JSON.parse(require('fs').readFileSync(require('path').join(this.kitPath, 'active-project.json'), 'utf8'));
          return a.current === '.' ? '' : (a.current || '');
        } catch { return ''; }
      })(),
    );

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
            try { return JSON.parse(require('fs').readFileSync(f, 'utf8')); } catch {}
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
      } catch {}
    }, 2000);
  }

  private stopLiveWatcher() {
    if (this.liveTimer) { clearInterval(this.liveTimer); }
  }

  private buildHTML(): string {
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

    return html.replace('<head>', '<head>' + patchScript);
  }

  private async proxyToServer(method: string, apiPath: string, body?: any): Promise<any> {
    const http = require('http');
    const port = vscode.workspace.getConfiguration('adlc').get<number>('serverPort') || 3000;
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const opts = {
        hostname: '127.0.0.1', port, path: apiPath, method: method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      };
      const req = http.request(opts, (res: any) => {
        let data = '';
        res.on('data', (c: any) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      });
      req.on('error', reject);
      if (payload) { req.write(payload); }
      req.end();
    });
  }
}
