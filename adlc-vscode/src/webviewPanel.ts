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

    // Patch fetch() calls to route through VS Code message API
    const patchScript = `
<script>
(function() {
  const vscode = acquireVsCodeApi();
  let _id = 0;
  const _pending = {};
  window.addEventListener('message', e => {
    const msg = e.data;
    if ((msg.type === 'api-response' || msg.type === 'api-error') && _pending[msg.id]) {
      _pending[msg.id](msg);
      delete _pending[msg.id];
    }
  });
  const _fetch = window.fetch.bind(window);
  window.fetch = function(url, opts = {}) {
    if (typeof url === 'string' && url.startsWith('/api')) {
      return new Promise((resolve, reject) => {
        const id = ++_id;
        _pending[id] = msg => {
          if (msg.type === 'api-error') { reject(new Error(msg.error)); return; }
          resolve({ ok: true, status: 200, json: () => Promise.resolve(msg.result) });
        };
        vscode.postMessage({ type: 'api', id, method: opts.method || 'GET', path: url, body: opts.body ? JSON.parse(opts.body) : undefined });
      });
    }
    return _fetch(url, opts);
  };
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
