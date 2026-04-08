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
exports.TerraformManager = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
// Vikram — Terraform Enterprise/Cloud integration + local module generation via GitHub Copilot
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
// ── Terraform Manager ─────────────────────────────────────────────────────────
class TerraformManager {
    constructor(kitPath, projectMgr) {
        this.kitPath = kitPath;
        this.projectMgr = projectMgr;
        this.tfeConfig = null;
        this.cachedModules = [];
        this.loadTFEConfig();
    }
    // ── ENTRY POINT: generate arch diagram → get approval → then generate TF ──
    async generateAndApproveArchitecture(context, outputChannel, cancelToken) {
        const req = this.projectMgr.getRequirement();
        const pr = this.projectMgr.getProjectRoot();
        const infra = this.inferInfraNeeds(req);
        outputChannel.appendLine(`[VIKRAM] Generating architecture diagram for: ${req.title}`);
        outputChannel.appendLine(`[VIKRAM] Resources: ${infra.resources.join(', ')}`);
        outputChannel.appendLine('─'.repeat(60));
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            outputChannel.appendLine('[ERROR] GitHub Copilot model not available.');
            vscode.window.showErrorMessage('ADLC Vikram: GitHub Copilot not found.');
            return;
        }
        this.setAgentStatus('wip', 10, 'Generating architecture diagram…');
        // ── Generate Mermaid + draw.io in parallel ──────────────────────────────
        outputChannel.appendLine('\n[VIKRAM] Calling Copilot to generate architecture diagram…\n');
        let mermaidCode = '';
        let drawioXml = '';
        try {
            [mermaidCode, drawioXml] = await Promise.all([
                this.generateMermaidDiagram(model, req, infra, cancelToken),
                this.generateDrawIOXML(model, req, infra, cancelToken),
            ]);
        }
        catch (err) {
            outputChannel.appendLine(`[ERROR] Diagram generation failed: ${err.message}`);
            this.setAgentStatus('blocked', 0, 'Diagram generation failed');
            return;
        }
        // ── Save diagram files ──────────────────────────────────────────────────
        const docsDir = path.join(pr, 'docs');
        fs.mkdirSync(docsDir, { recursive: true });
        fs.writeFileSync(path.join(docsDir, 'architecture.mmd'), mermaidCode, 'utf8');
        outputChannel.appendLine('[VIKRAM] Saved: docs/architecture.mmd');
        if (drawioXml) {
            fs.writeFileSync(path.join(docsDir, 'architecture.drawio'), drawioXml, 'utf8');
            outputChannel.appendLine('[VIKRAM] Saved: docs/architecture.drawio  (open in draw.io extension)');
        }
        this.setAgentStatus('wip', 30, 'Architecture diagram ready — awaiting approval');
        // ── Show WebView panel and wait for Tarun's decision ────────────────────
        outputChannel.appendLine('\n[VIKRAM] Opening architecture diagram for approval…');
        const decision = await this.showArchDiagramPanel(context, req, infra, mermaidCode, drawioXml, pr);
        if (decision === 'regenerate') {
            outputChannel.appendLine('\n[VIKRAM] Regenerating architecture diagram…');
            await this.generateAndApproveArchitecture(context, outputChannel, cancelToken);
            return;
        }
        if (decision !== 'approved') {
            outputChannel.appendLine('[VIKRAM] Diagram approval cancelled — Terraform generation skipped.');
            this.setAgentStatus('blocked', 30, 'Pending architecture approval');
            return;
        }
        outputChannel.appendLine('\n[VIKRAM] Architecture APPROVED — generating Terraform code…\n');
        this.setAgentStatus('wip', 40, 'Approved — generating Terraform…');
        await this.autoGenerate(outputChannel, cancelToken);
    }
    // ── Generate Mermaid architecture diagram via Copilot ────────────────────
    async generateMermaidDiagram(model, req, infra, cancelToken) {
        const prompt = [
            `You are Vikram, Cloud Architect. Generate a Mermaid architecture diagram for this AWS infrastructure.`,
            ``,
            `Project: "${req.title}" — ${req.description}`,
            `AWS Region: ${infra.region}`,
            ``,
            `Resources to diagram:`,
            ...infra.resources.map(r => `  - ${r}`),
            ``,
            `RULES:`,
            `- Use Mermaid graph TD (top-down) syntax`,
            `- Group resources in subgraphs: VPC, Compute, Data, CDN, Security, Monitoring`,
            `- Show data flow arrows between services (user → ALB → ECS → RDS, etc.)`,
            `- Label every arrow with the protocol (HTTPS, SQL, Redis, SQS, etc.)`,
            `- Use icons in node labels: 🌐 Internet, ⚡ Lambda/ECS, 🗄️ RDS, 📦 S3, 🔐 Cognito, 📊 CloudWatch`,
            `- Include Tarun (developer) as the entry point at the top`,
            `- Keep it concise — max 30 nodes`,
            ``,
            `Output ONLY the raw Mermaid code starting with "graph TD" — no markdown fences, no explanation.`,
        ].join('\n');
        const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, cancelToken);
        let text = '';
        for await (const chunk of response.text) {
            text += chunk;
        }
        // Strip markdown fences if Copilot included them
        return text.replace(/^```(?:mermaid)?\n?/m, '').replace(/\n?```$/m, '').trim();
    }
    // ── Generate draw.io XML via Copilot ─────────────────────────────────────
    async generateDrawIOXML(model, req, infra, cancelToken) {
        const prompt = [
            `You are Vikram, Cloud Architect. Generate a draw.io XML architecture diagram for this AWS infrastructure.`,
            ``,
            `Project: "${req.title}"`,
            `AWS Region: ${infra.region}`,
            `Resources: ${infra.resources.join(', ')}`,
            ``,
            `RULES:`,
            `- Output valid draw.io XML starting with <mxfile> and ending with </mxfile>`,
            `- Use AWS shape stencils (shape=mxgraph.aws4.*) for AWS services`,
            `- Group services in swim lanes: VPC boundary, Compute, Data Layer, CDN/Edge, Security`,
            `- Connect services with labeled edges showing data flow`,
            `- Position services logically: internet entry at top, data at bottom`,
            `- Use standard draw.io colors: blue=#dae8fc, green=#d5e8d4, orange=#ffe6cc for layers`,
            ``,
            `Output ONLY the raw XML starting with <mxfile — no explanation, no code fences.`,
        ].join('\n');
        try {
            const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, cancelToken);
            let text = '';
            for await (const chunk of response.text) {
                text += chunk;
            }
            // Extract XML if wrapped in code fences
            const match = text.match(/<mxfile[\s\S]*<\/mxfile>/);
            return match ? match[0] : text.trim();
        }
        catch {
            return ''; // draw.io is optional — don't fail the whole flow
        }
    }
    // ── WebView panel: shows diagram + Approve / Regenerate buttons ───────────
    showArchDiagramPanel(context, req, infra, mermaid, drawioXml, pr) {
        return new Promise(resolve => {
            const panel = vscode.window.createWebviewPanel('vikramArchDiagram', `Vikram — Architecture: ${req.title}`, vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });
            panel.webview.html = this.buildDiagramHtml(req, infra, mermaid, drawioXml);
            // Listen for messages from WebView buttons
            panel.webview.onDidReceiveMessage((msg) => {
                if (msg.command === 'approve') {
                    // Save approval notes to group chat
                    const notes = msg.notes?.trim() || '';
                    this.postToGroupChat(pr, `✅ Architecture diagram APPROVED by Tarun for "${req.title}".\n` +
                        (notes ? `Notes: ${notes}\n` : '') +
                        `Proceeding with Terraform generation.`, ['arjun', 'kiran', 'rasool']);
                    panel.dispose();
                    resolve('approved');
                }
                else if (msg.command === 'regenerate') {
                    panel.dispose();
                    resolve('regenerate');
                }
                else if (msg.command === 'downloadDrawio') {
                    // Write draw.io file and open it
                    const drawioPath = path.join(pr, 'docs', 'architecture.drawio');
                    if (fs.existsSync(drawioPath)) {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(drawioPath));
                    }
                }
            }, undefined, context.subscriptions);
            panel.onDidDispose(() => resolve('cancelled'), undefined, context.subscriptions);
        });
    }
    // ── Build WebView HTML with Mermaid.js rendered diagram ───────────────────
    buildDiagramHtml(req, infra, mermaid, drawioXml) {
        const resourceList = infra.resources
            .map(r => `<li>${r}</li>`)
            .join('\n');
        const escapedMermaid = mermaid
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const hasDrawio = drawioXml.trim().length > 0;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vikram Architecture Diagram</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1e1e1e; color: #d4d4d4;
      padding: 20px; min-height: 100vh;
    }
    .header {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 20px; padding-bottom: 16px;
      border-bottom: 1px solid #3e3e3e;
    }
    .header h1 { font-size: 18px; color: #569cd6; }
    .header .badge {
      background: #264f78; color: #9cdcfe;
      padding: 2px 10px; border-radius: 12px; font-size: 12px;
    }
    .layout { display: grid; grid-template-columns: 1fr 280px; gap: 20px; }
    .diagram-panel {
      background: #252526; border: 1px solid #3e3e3e;
      border-radius: 8px; padding: 20px; overflow: auto;
    }
    .diagram-panel h2 { font-size: 13px; color: #9d9d9d; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }
    .mermaid { background: #fff; border-radius: 6px; padding: 16px; min-height: 400px; }
    .sidebar { display: flex; flex-direction: column; gap: 16px; }
    .card {
      background: #252526; border: 1px solid #3e3e3e;
      border-radius: 8px; padding: 16px;
    }
    .card h3 { font-size: 13px; color: #9d9d9d; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .resource-list { list-style: none; }
    .resource-list li {
      padding: 6px 0; font-size: 12px; color: #d4d4d4;
      border-bottom: 1px solid #2d2d2d;
      display: flex; align-items: center; gap: 8px;
    }
    .resource-list li::before { content: '✓'; color: #4ec9b0; }
    textarea {
      width: 100%; height: 80px; background: #1e1e1e;
      border: 1px solid #3e3e3e; color: #d4d4d4;
      border-radius: 4px; padding: 8px; font-size: 12px;
      resize: vertical; font-family: inherit;
    }
    textarea::placeholder { color: #6d6d6d; }
    .btn {
      width: 100%; padding: 10px; border: none;
      border-radius: 6px; cursor: pointer; font-size: 13px;
      font-weight: 600; transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-approve  { background: #4caf50; color: #fff; }
    .btn-regen    { background: #264f78; color: #9cdcfe; margin-top: 8px; }
    .btn-drawio   { background: #2d2d2d; color: #9d9d9d; border: 1px solid #3e3e3e; margin-top: 8px; font-size: 11px; }
    .approval-label { font-size: 11px; color: #9d9d9d; margin-bottom: 6px; }
    .region-tag {
      display: inline-flex; align-items: center; gap: 6px;
      background: #264f78; color: #9cdcfe; padding: 3px 10px;
      border-radius: 12px; font-size: 11px; margin-bottom: 12px;
    }
    .mermaid-src {
      margin-top: 16px; background: #1e1e1e; border: 1px solid #3e3e3e;
      border-radius: 6px; padding: 12px; font-family: monospace;
      font-size: 11px; color: #9d9d9d; white-space: pre-wrap;
      max-height: 200px; overflow: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Vikram — Infrastructure Architecture</h1>
    <span class="badge">Awaiting Approval</span>
  </div>

  <div class="layout">
    <div class="diagram-panel">
      <h2>Architecture Diagram</h2>
      <div class="region-tag">🌍 AWS Region: ${infra.region}</div>
      <div class="mermaid">${escapedMermaid}</div>
      <details style="margin-top:16px">
        <summary style="cursor:pointer; color:#9d9d9d; font-size:12px">View Mermaid source</summary>
        <div class="mermaid-src">${escapedMermaid}</div>
      </details>
    </div>

    <div class="sidebar">
      <div class="card">
        <h3>Project</h3>
        <div style="font-size:13px; color:#9cdcfe; margin-bottom:8px">${req.title}</div>
        <div style="font-size:11px; color:#9d9d9d">${req.description || ''}</div>
      </div>

      <div class="card">
        <h3>Infrastructure Resources</h3>
        <ul class="resource-list">
          ${resourceList}
        </ul>
      </div>

      <div class="card">
        <h3>Approval</h3>
        <div class="approval-label">Notes for Vikram (optional)</div>
        <textarea id="notes" placeholder="e.g. Use us-west-2 instead, add Redis for caching…"></textarea>
        <button class="btn btn-approve" onclick="approve()">
          ✅ Approve &amp; Generate Terraform
        </button>
        <button class="btn btn-regen" onclick="regenerate()">
          🔄 Regenerate Diagram
        </button>
        ${hasDrawio ? `<button class="btn btn-drawio" onclick="openDrawio()">
          📐 Open in draw.io
        </button>` : ''}
      </div>
    </div>
  </div>

  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
    });

    const vscode = acquireVsCodeApi();

    function approve() {
      const notes = document.getElementById('notes').value;
      vscode.postMessage({ command: 'approve', notes });
    }

    function regenerate() {
      vscode.postMessage({ command: 'regenerate' });
    }

    function openDrawio() {
      vscode.postMessage({ command: 'downloadDrawio' });
    }
  </script>
</body>
</html>`;
    }
    // ── AUTO: called by agentRunner when Vikram is launched ─────────────────
    // Reads requirement.json, infers the full infra needed, generates TF code.
    // No questions asked — fully automatic.
    async autoGenerate(outputChannel, cancelToken) {
        const req = this.projectMgr.getRequirement();
        const pr = this.projectMgr.getProjectRoot();
        outputChannel.appendLine(`[VIKRAM] Auto-generating Terraform from requirement.json`);
        outputChannel.appendLine(`[VIKRAM] Project: ${req.title}`);
        outputChannel.appendLine(`[VIKRAM] Tech constraints: ${(req.techConstraints || []).join(', ') || 'none specified'}`);
        outputChannel.appendLine('─'.repeat(60));
        const infra = this.inferInfraNeeds(req);
        outputChannel.appendLine(`[VIKRAM] Inferred resources needed:`);
        infra.resources.forEach((r) => outputChannel.appendLine(`  ✓ ${r}`));
        outputChannel.appendLine('');
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            outputChannel.appendLine(`[ERROR] GitHub Copilot model "${modelId}" not available.`);
            this.setAgentStatus('blocked', 0, 'Copilot not available');
            return;
        }
        this.setAgentStatus('wip', 20, 'Inferring infrastructure from requirements…');
        // If TFE connected — fetch registry modules and reuse them
        let registryModules = [];
        if (this.tfeConfig) {
            outputChannel.appendLine(`[VIKRAM] TFE connected — fetching registry modules from ${this.tfeConfig.hostname}…`);
            try {
                registryModules = await this.fetchTFEModules();
                outputChannel.appendLine(`[VIKRAM] Found ${registryModules.length} modules in private registry`);
                registryModules.forEach(m => outputChannel.appendLine(`  📦 ${m.name} (${m.provider} v${m.version})`));
            }
            catch (e) {
                outputChannel.appendLine(`[WARN] TFE fetch failed: ${e.message} — using standalone generation`);
            }
        }
        this.setAgentStatus('wip', 40, 'Generating Terraform with GitHub Copilot…');
        const prompt = this.buildAutoPrompt(req, infra, registryModules);
        outputChannel.appendLine(`\n[VIKRAM] Calling GitHub Copilot (${modelId})…\n`);
        let fullResponse = '';
        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await model.sendRequest(messages, {}, cancelToken);
            for await (const chunk of response.text) {
                fullResponse += chunk;
                outputChannel.append(chunk);
            }
        }
        catch (err) {
            outputChannel.appendLine(`\n[ERROR] Copilot error: ${err.message}`);
            this.setAgentStatus('blocked', 0, `Copilot error: ${err.message}`);
            return;
        }
        outputChannel.appendLine('\n' + '─'.repeat(60));
        this.setAgentStatus('wip', 80, 'Writing Terraform files…');
        const written = this.writeFilesFromResponse(fullResponse, pr);
        outputChannel.appendLine(`\n[VIKRAM] Files written (${written.length}):`);
        written.forEach(f => outputChannel.appendLine(`  ✓ ${f}`));
        if (written.length > 0) {
            this.setAgentStatus('done', 100, `${written.length} Terraform files generated`);
            this.postToGroupChat(pr, `✅ Terraform infrastructure auto-generated for "${req.title}".\n` +
                `${written.length} files written to infra/.\n` +
                `Resources: ${infra.resources.join(', ')}.\n` +
                `Run \`terraform init && terraform plan\` to preview. Kiran can now deploy the backend.`, ['arjun', 'kiran', 'tarun']);
            vscode.window.showInformationMessage(`ADLC: Vikram wrote ${written.length} Terraform files for "${req.title}"`);
        }
        else {
            this.setAgentStatus('blocked', 50, 'No files parsed from Copilot response');
            outputChannel.appendLine(`[WARN] Could not parse file blocks from response. Check the output above.`);
        }
    }
    // ── Called from chat /infra or manually ──────────────────────────────────
    async runVikramFlow(stream, token) {
        const req = this.projectMgr.getRequirement();
        stream.markdown(`## 🏗️ Vikram — Cloud Architecture & Terraform\n\n`);
        stream.markdown(`**Project:** ${req.title || 'Untitled'}\n\n`);
        if (this.tfeConfig) {
            await this.runWithTFE(stream, token, req);
        }
        else {
            await this.runStandalone(stream, token, req);
        }
    }
    // ── Infer what AWS resources this project needs from requirement.json ─────
    inferInfraNeeds(req) {
        const desc = `${req.description || ''} ${req.businessGoal || ''} ${req.targetUsers || ''}`.toLowerCase();
        const constraints = (req.techConstraints || []).map((c) => c.toLowerCase());
        const domain = (req.projectDomain || '').toLowerCase();
        const domCtx = req.domainContext || {};
        const has = (...terms) => terms.some(t => desc.includes(t) || constraints.some((c) => c.includes(t)));
        const needsDB = has('postgres', 'postgresql', 'mysql', 'database', 'db', 'rds', 'sqlite', 'data', 'store', 'record', 'lease', 'tenant', 'property', 'portfolio');
        const needsBackend = has('api', 'fastapi', 'backend', 'server', 'endpoint', 'rest', 'graphql', 'lambda', 'ecs', 'fargate');
        const needsFrontend = has('react', 'frontend', 'dashboard', 'ui', 'chart', 'web', 'browser', 'portal');
        const needsAuth = has('auth', 'login', 'user', 'cognito', 'oauth', 'jwt', 'session', 'account');
        const needsStorage = has('upload', 'file', 's3', 'document', 'pdf', 'excel', 'attachment', 'export', 'report');
        const needsQueue = has('queue', 'sqs', 'async', 'email', 'notification', 'alert', 'trigger', 'event');
        const needsCache = has('cache', 'redis', 'elasticache', 'session', 'performance');
        const region = (domCtx.region || constraints.find((c) => c.startsWith('us-') || c.startsWith('eu-') || c.startsWith('ap-')) || 'us-east-1');
        const resources = ['VPC + subnets + security groups (networking)'];
        if (needsDB) {
            resources.push('RDS PostgreSQL (database)');
        }
        if (needsBackend) {
            resources.push('ECS Fargate (backend API container)');
        }
        if (needsFrontend) {
            resources.push('S3 + CloudFront (React frontend CDN)');
        }
        if (needsStorage) {
            resources.push('S3 bucket (file uploads / exports)');
        }
        if (needsAuth) {
            resources.push('Cognito User Pool (authentication)');
        }
        if (needsQueue) {
            resources.push('SQS queue (async notifications/alerts)');
        }
        if (needsCache) {
            resources.push('ElastiCache Redis (caching/sessions)');
        }
        resources.push('IAM roles + policies (least privilege)');
        resources.push('CloudWatch + alarms (monitoring)');
        resources.push('S3 + DynamoDB (Terraform remote state)');
        return { resources, needsDB, needsBackend, needsFrontend, needsAuth, needsStorage, region };
    }
    // ── Build the auto-generation prompt ─────────────────────────────────────
    buildAutoPrompt(req, infra, registryModules) {
        const moduleSection = registryModules.length > 0
            ? [
                `Available modules from our Terraform Enterprise private registry (REUSE THESE — do not recreate):`,
                ...registryModules.map(m => `  - ${m.name} (${m.provider} v${m.version}) — source: "${m.source}"`),
                ``,
                `For any resource NOT covered by the registry, write a new module from scratch.`,
            ].join('\n')
            : `No private registry modules available — generate all modules from scratch.`;
        return [
            `You are Vikram, Cloud Architect for Team Panchayat (ADLC-Agent-Kit).`,
            `Auto-generate complete, production-ready Terraform infrastructure based on this project requirement.`,
            ``,
            `=== PROJECT REQUIREMENT ===`,
            `Title:            ${req.title}`,
            `Description:      ${req.description}`,
            `Business Goal:    ${req.businessGoal || ''}`,
            `Target Users:     ${req.targetUsers || ''}`,
            `Tech Constraints: ${(req.techConstraints || []).join(', ') || 'none'}`,
            `Domain:           ${req.projectDomain || 'general'}`,
            ``,
            `=== INFERRED INFRASTRUCTURE ===`,
            `AWS Region: ${infra.region}`,
            `Resources needed:`,
            ...infra.resources.map(r => `  - ${r}`),
            ``,
            `=== TERRAFORM ENTERPRISE REGISTRY ===`,
            moduleSection,
            ``,
            `=== OUTPUT FORMAT (STRICT) ===`,
            `Write every file using EXACTLY this format — one block per file, no extra text between blocks:`,
            ``,
            `// FILE: infra/backend.tf`,
            `<terraform code here>`,
            ``,
            `// FILE: infra/variables.tf`,
            `<terraform code here>`,
            ``,
            `// FILE: infra/main.tf`,
            `<terraform code here>`,
            ``,
            `// FILE: infra/modules/networking/main.tf`,
            `<terraform code here>`,
            ``,
            `(continue for all modules)`,
            ``,
            `=== REQUIRED FILES ===`,
            `infra/backend.tf         — S3 state bucket + DynamoDB lock table`,
            `infra/variables.tf       — environment, region, project_name, all module inputs`,
            `infra/outputs.tf         — api_url, frontend_url, db_endpoint, bucket_name`,
            `infra/main.tf            — root module calling all sub-modules`,
            ...(infra.needsBackend ? ['infra/modules/ecs/main.tf + variables.tf + outputs.tf'] : []),
            ...(infra.needsDB ? ['infra/modules/rds/main.tf + variables.tf + outputs.tf'] : []),
            ...(infra.needsFrontend ? ['infra/modules/cloudfront/main.tf + variables.tf + outputs.tf'] : []),
            ...(infra.needsAuth ? ['infra/modules/cognito/main.tf + variables.tf + outputs.tf'] : []),
            ...(infra.needsStorage ? ['infra/modules/s3/main.tf + variables.tf + outputs.tf'] : []),
            'infra/modules/networking/main.tf + variables.tf + outputs.tf',
            'infra/modules/monitoring/main.tf + variables.tf + outputs.tf',
            ``,
            `=== ADLC STANDARDS (MANDATORY) ===`,
            `- Terraform >= 1.7, AWS provider >= 5.0`,
            `- Every resource tagged: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project="${req.title}"`,
            `- No hardcoded credentials — use SSM Parameter Store for secrets`,
            `- No company-specific names (CBRE, client names etc) in resource names — use project slug`,
            `- All modules must have: main.tf, variables.tf, outputs.tf`,
            `- Use generic resource naming: var.project_name + "-" + var.environment`,
        ].join('\n');
    }
    // ── TFE/TFC connected mode ────────────────────────────────────────────────
    async runWithTFE(stream, token, req) {
        stream.markdown(`✅ **Connected to Terraform ${this.tfeConfig.hostname === 'app.terraform.io' ? 'Cloud' : 'Enterprise'}**\n`);
        stream.markdown(`- Org: \`${this.tfeConfig.organization}\`\n`);
        stream.markdown(`- Host: \`${this.tfeConfig.hostname}\`\n\n`);
        stream.markdown(`🔍 Fetching available modules from private registry…\n\n`);
        try {
            const modules = await this.fetchTFEModules();
            this.cachedModules = modules;
            if (modules.length === 0) {
                stream.markdown(`⚠️ No modules found in the private registry. Generating from scratch.\n\n`);
                await this.generateModulesWithCopilot(stream, token, req, []);
                return;
            }
            stream.markdown(`### 📦 Available Modules in \`${this.tfeConfig.organization}\`\n\n`);
            stream.markdown(`| Module | Provider | Version | Description |\n|--------|----------|---------|-------------|\n`);
            modules.forEach(m => {
                stream.markdown(`| \`${m.name}\` | ${m.provider} | ${m.version} | ${m.description || '—'} |\n`);
            });
            stream.markdown(`\n🤖 **Analysing project requirements and matching modules via GitHub Copilot…**\n\n`);
            await this.matchAndGenerateWithTFE(stream, token, req, modules);
        }
        catch (err) {
            stream.markdown(`❌ TFE API error: ${err.message}\n\n`);
            stream.markdown(`Falling back to standalone module generation.\n\n`);
            await this.runStandalone(stream, token, req);
        }
    }
    // ── Match project requirements to TFE modules + generate wrapper ──────────
    async matchAndGenerateWithTFE(stream, token, req, modules) {
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            stream.markdown('⚠️ Copilot not available.');
            return;
        }
        const moduleList = modules.map(m => `- ${m.name} (${m.provider} v${m.version}): ${m.description} — source: ${m.source}`).join('\n');
        const prompt = [
            `You are Vikram, Cloud Architect for Team Panchayat.`,
            ``,
            `Project: "${req.title}" — ${req.description}`,
            `Tech constraints: ${(req.techConstraints || []).join(', ') || 'none'}`,
            ``,
            `Available Terraform modules from our private registry:`,
            moduleList,
            ``,
            `Instructions:`,
            `1. Select which modules from the registry to reuse (prefer reuse over recreating)`,
            `2. For anything not covered by the registry, generate new module code`,
            `3. Write a complete infra/modules/ directory structure using the format:`,
            `   // FILE: infra/modules/<name>/main.tf`,
            `   <terraform code>`,
            `4. Write infra/main.tf that calls all modules with correct source references`,
            `5. Apply AWS tags: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project=${req.title}`,
            `6. No hardcoded credentials — use SSM Parameter Store or Secrets Manager`,
            ``,
            `ADLC Quality Gates:`,
            `- Terraform >= 1.7, AWS provider >= 5.0`,
            `- S3 + DynamoDB backend for state`,
            `- All modules must have: main.tf, variables.tf, outputs.tf`,
        ].join('\n');
        stream.markdown(`---\n\n**Vikram is generating Terraform using matched modules:**\n\n`);
        await this.streamCopilotAndWrite(prompt, stream, token, model);
    }
    // ── Standalone mode — no TFE connection ───────────────────────────────────
    async runStandalone(stream, token, req) {
        stream.markdown(`ℹ️ **No Terraform Enterprise/Cloud connection configured.**\n\n`);
        stream.markdown(`Generating VS Code-specific Terraform modules via GitHub Copilot.\n\n`);
        stream.markdown(`> 💡 To connect Terraform Enterprise/Cloud, run: \`ADLC: Connect Terraform Enterprise\`\n\n`);
        stream.markdown(`---\n\n`);
        await this.generateModulesWithCopilot(stream, token, req, []);
    }
    async generateModulesWithCopilot(stream, token, req, existingModules) {
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            stream.markdown('⚠️ GitHub Copilot not available. Make sure Copilot is signed in.');
            return;
        }
        const prompt = [
            `You are Vikram, Cloud Architect for Team Panchayat.`,
            ``,
            `Project: "${req.title}" — ${req.description}`,
            `Business goal: ${req.businessGoal || ''}`,
            `Target users: ${req.targetUsers || ''}`,
            `Tech constraints: ${(req.techConstraints || []).join(', ') || 'AWS, PostgreSQL, React'}`,
            ``,
            `Generate a complete, production-ready Terraform infrastructure for this project.`,
            ``,
            `Write each file using this exact format:`,
            `// FILE: infra/modules/<module-name>/main.tf`,
            `<terraform code>`,
            ``,
            `Required modules to create (based on the project requirements):`,
            `- VPC + subnets + security groups (networking)`,
            `- RDS PostgreSQL (if DB needed)`,
            `- S3 bucket (for uploads/static assets)`,
            `- ECS Fargate or Lambda (for backend API)`,
            `- CloudFront + S3 (for React frontend)`,
            `- CloudWatch + alarms (monitoring)`,
            `- IAM roles + policies (least privilege)`,
            `- infra/main.tf (root module calling all above)`,
            `- infra/variables.tf (environment, region, project_name)`,
            `- infra/outputs.tf (api_url, frontend_url, db_endpoint)`,
            `- infra/backend.tf (S3 state + DynamoDB lock)`,
            ``,
            `ADLC Standards:`,
            `- Terraform >= 1.7, AWS provider >= 5.0`,
            `- All resources tagged: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project=${req.title}`,
            `- No hardcoded credentials — SSM Parameter Store for secrets`,
            `- Use generic names — no company names in resource names`,
        ].join('\n');
        stream.markdown(`**Vikram is generating Terraform modules via GitHub Copilot (${modelId})…**\n\n`);
        await this.streamCopilotAndWrite(prompt, stream, token, model);
    }
    // ── Stream Copilot response + parse FILE: blocks → write to disk ──────────
    async streamCopilotAndWrite(prompt, stream, token, model) {
        const pr = this.projectMgr.getProjectRoot();
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        let fullResponse = '';
        try {
            const response = await model.sendRequest(messages, {}, token);
            for await (const chunk of response.text) {
                fullResponse += chunk;
                stream.markdown(chunk);
            }
        }
        catch (err) {
            stream.markdown(`\n\n❌ Copilot error: ${err.message}\n`);
            return;
        }
        // Parse and write files
        const written = this.writeFilesFromResponse(fullResponse, pr);
        if (written.length > 0) {
            stream.markdown(`\n\n---\n\n✅ **${written.length} Terraform file(s) written:**\n\n`);
            written.forEach(f => stream.markdown(`- \`${f}\`\n`));
            // Update agent status
            this.setAgentStatus('done', 100, `${written.length} Terraform modules generated`);
            // Post to group chat
            this.postToGroupChat(pr, `✅ Terraform infrastructure ready. ${written.length} files written to infra/. ` +
                `Run \`terraform init && terraform plan\` to preview. Kiran and Rohan can now deploy.`, ['arjun', 'kiran']);
            // Show terraform plan option
            stream.markdown(`\n💡 **Next steps:**\n\n`);
            stream.markdown(`- Run \`@adlc /infra-plan\` to preview the Terraform plan\n`);
            stream.markdown(`- Run \`@adlc /infra-validate\` to validate the Terraform syntax\n`);
        }
    }
    // ── TFE API calls ─────────────────────────────────────────────────────────
    async fetchTFEModules() {
        if (!this.tfeConfig) {
            return [];
        }
        const { hostname, token, organization } = this.tfeConfig;
        const data = await this.tfeRequest(hostname, token, `/api/registry/v1/modules/${organization}?limit=100`);
        const items = data?.modules || data?.data || [];
        return items.map((m) => ({
            id: m.id || m.attributes?.full_name || '',
            name: m.name || m.attributes?.name || '',
            provider: m.provider || m.attributes?.provider || '',
            namespace: m.namespace || organization,
            version: m['current-version']?.version || m.attributes?.['version-statuses']?.[0]?.version || 'latest',
            description: m.description || m.attributes?.description || '',
            source: `${hostname}/${organization}/${m.name || ''}/${m.provider || ''}`,
        }));
    }
    async fetchWorkspaceVars() {
        if (!this.tfeConfig?.workspace) {
            return {};
        }
        const { hostname, token, organization, workspace } = this.tfeConfig;
        const data = await this.tfeRequest(hostname, token, `/api/v2/vars?filter[organization][name]=${organization}&filter[workspace][name]=${workspace}`);
        const vars = {};
        (data?.data || []).forEach((v) => {
            vars[v.attributes?.key] = v.attributes?.value || '';
        });
        return vars;
    }
    tfeRequest(hostname, token, apiPath) {
        const isCloud = hostname === 'app.terraform.io';
        const lib = isCloud ? https : (hostname.startsWith('https') ? https : http);
        return new Promise((resolve, reject) => {
            const options = {
                hostname: hostname.replace(/^https?:\/\//, ''),
                path: apiPath,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/vnd.api+json',
                },
            };
            const req = lib.request(options, res => {
                let body = '';
                res.on('data', c => { body += c; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch {
                        reject(new Error(`TFE response parse error: ${body.slice(0, 100)}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }
    // ── Terraform plan/validate (runs local terraform CLI) ────────────────────
    async runTerraformPlan(stream) {
        const pr = this.projectMgr.getProjectRoot();
        const infraDir = path.join(pr, 'infra');
        if (!fs.existsSync(infraDir)) {
            stream.markdown(`❌ No infra/ directory found. Run \`@adlc /infra\` first to generate Terraform.\n`);
            return;
        }
        stream.markdown(`### 🔍 Terraform Plan\n\n`);
        stream.markdown('```\n');
        const { spawn } = require('child_process');
        const init = spawn('terraform', ['init', '-no-color'], { cwd: infraDir });
        await new Promise(resolve => {
            init.stdout.on('data', (d) => stream.markdown(d.toString()));
            init.stderr.on('data', (d) => stream.markdown(d.toString()));
            init.on('close', resolve);
        });
        const plan = spawn('terraform', ['plan', '-no-color'], { cwd: infraDir });
        await new Promise(resolve => {
            plan.stdout.on('data', (d) => stream.markdown(d.toString()));
            plan.stderr.on('data', (d) => stream.markdown(d.toString()));
            plan.on('close', resolve);
        });
        stream.markdown('\n```\n');
    }
    async runTerraformValidate(stream) {
        const pr = this.projectMgr.getProjectRoot();
        const infraDir = path.join(pr, 'infra');
        if (!fs.existsSync(infraDir)) {
            stream.markdown(`❌ No infra/ directory. Run \`@adlc /infra\` first.\n`);
            return;
        }
        stream.markdown(`### ✅ Terraform Validate\n\n\`\`\`\n`);
        const { spawn } = require('child_process');
        const proc = spawn('terraform', ['validate', '-no-color'], { cwd: infraDir });
        await new Promise(resolve => {
            proc.stdout.on('data', (d) => stream.markdown(d.toString()));
            proc.stderr.on('data', (d) => stream.markdown(d.toString()));
            proc.on('close', resolve);
        });
        stream.markdown(`\n\`\`\`\n`);
    }
    // ── TFE Login wizard ──────────────────────────────────────────────────────
    static async loginWizard(context) {
        const hostType = await vscode.window.showQuickPick([
            { label: '☁️  Terraform Cloud', description: 'app.terraform.io', value: 'app.terraform.io' },
            { label: '🏢 Terraform Enterprise', description: 'Self-hosted TFE', value: 'custom' },
        ], { placeHolder: 'Select your Terraform platform' });
        if (!hostType) {
            return null;
        }
        let hostname = hostType.value;
        if (hostname === 'custom') {
            const custom = await vscode.window.showInputBox({
                prompt: 'Enter your Terraform Enterprise hostname',
                placeHolder: 'tfe.yourcompany.com',
                validateInput: v => v.includes('.') ? null : 'Enter a valid hostname',
            });
            if (!custom) {
                return null;
            }
            hostname = custom.trim().replace(/^https?:\/\//, '');
        }
        const token = await vscode.window.showInputBox({
            prompt: `Enter your ${hostname === 'app.terraform.io' ? 'Terraform Cloud' : 'TFE'} API token`,
            placeHolder: 'Get from: Settings → Tokens → Create an API token',
            password: true,
            validateInput: v => v.length > 10 ? null : 'Token looks too short',
        });
        if (!token) {
            return null;
        }
        const organization = await vscode.window.showInputBox({
            prompt: 'Enter your organization name',
            placeHolder: 'e.g. team-panchayat',
            validateInput: v => v.length > 0 ? null : 'Organization name required',
        });
        if (!organization) {
            return null;
        }
        const workspace = await vscode.window.showInputBox({
            prompt: 'Workspace name (optional — press Enter to skip)',
            placeHolder: 'e.g. production',
        });
        const cfg = { hostname, token, organization, workspace: workspace || undefined };
        // Save to VS Code secrets storage
        await context.secrets.store('adlc.tfe.token', token);
        await context.secrets.store('adlc.tfe.hostname', hostname);
        await context.secrets.store('adlc.tfe.organization', organization);
        if (workspace) {
            await context.secrets.store('adlc.tfe.workspace', workspace);
        }
        vscode.window.showInformationMessage(`✅ Connected to ${hostname === 'app.terraform.io' ? 'Terraform Cloud' : 'Terraform Enterprise'} — org: ${organization}`);
        return cfg;
    }
    static async logout(context) {
        await context.secrets.delete('adlc.tfe.token');
        await context.secrets.delete('adlc.tfe.hostname');
        await context.secrets.delete('adlc.tfe.organization');
        await context.secrets.delete('adlc.tfe.workspace');
        vscode.window.showInformationMessage('ADLC: Disconnected from Terraform Enterprise/Cloud.');
    }
    async loadTFEConfigFromSecrets(context) {
        const token = await context.secrets.get('adlc.tfe.token');
        const hostname = await context.secrets.get('adlc.tfe.hostname');
        const organization = await context.secrets.get('adlc.tfe.organization');
        const workspace = await context.secrets.get('adlc.tfe.workspace');
        if (token && hostname && organization) {
            this.tfeConfig = { token, hostname, organization, workspace };
        }
    }
    isConnected() { return this.tfeConfig !== null; }
    getConnectionInfo() {
        if (!this.tfeConfig) {
            return 'Not connected';
        }
        return `${this.tfeConfig.hostname} / ${this.tfeConfig.organization}`;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    loadTFEConfig() {
        // Loaded from secrets on activate (async) — see loadTFEConfigFromSecrets
    }
    writeFilesFromResponse(response, pr) {
        const re = /\/\/ FILE: ([^\n]+)\n([\s\S]*?)(?=\/\/ FILE: |\n```|$)/g;
        const written = [];
        let match;
        while ((match = re.exec(response)) !== null) {
            const relPath = match[1].trim();
            const content = match[2].trimEnd();
            if (!relPath || !content.trim()) {
                continue;
            }
            const absPath = relPath.startsWith('/') ? relPath : path.join(pr, relPath);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, content + '\n', 'utf8');
            written.push(relPath);
        }
        return written;
    }
    setAgentStatus(status, progress, task) {
        const pr = this.projectMgr.getProjectRoot();
        const file = path.join(pr, 'agent-status.json');
        const data = this.readJSON(file) || { agents: {} };
        (data.agents || data).vikram = { status, progress, task, blocker: '', updated: new Date().toISOString() };
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    }
    postToGroupChat(pr, message, tags) {
        const file = path.join(pr, 'group-chat.json');
        const chat = this.readJSON(file) || { channel: 'team-panchayat-general', messages: [] };
        chat.messages.push({
            id: `msg-${Date.now()}`, from: 'VIKRAM', role: 'Cloud Architect',
            type: 'message', message, tags, timestamp: new Date().toISOString(),
        });
        fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8');
    }
    readJSON(file) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        catch {
            return null;
        }
    }
}
exports.TerraformManager = TerraformManager;
//# sourceMappingURL=terraformManager.js.map