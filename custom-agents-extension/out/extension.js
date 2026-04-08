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
exports.activate = activate;
exports.deactivate = deactivate;
// Team Panchayat Custom Agents Extension
// Agent: Custom Agents Extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ── Helpers ──────────────────────────────────────────────────────────────────
function getKitPath() {
    // 1. Explicit user setting (set once globally — persists across all windows)
    const cfg = vscode.workspace.getConfiguration('adlc').get('kitPath');
    if (cfg && cfg.trim() && fs.existsSync(cfg.trim())) {
        return cfg.trim();
    }
    // 2. Open workspace folder that IS the kit
    const folders = vscode.workspace.workspaceFolders || [];
    for (const f of folders) {
        if (fs.existsSync(path.join(f.uri.fsPath, 'dashboard-server.js'))) {
            return f.uri.fsPath;
        }
    }
    // 3. Common install locations — check automatically, no prompt needed
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
        path.join(home, 'Downloads', 'ADLC-Agent-Kit'),
        path.join(home, 'Documents', 'ADLC-Agent-Kit'),
        path.join(home, 'Desktop', 'ADLC-Agent-Kit'),
        path.join(home, 'ADLC-Agent-Kit'),
        'C:\\Users\\admin\\Downloads\\ADLC-Agent-Kit',
        '/Users/admin/Downloads/ADLC-Agent-Kit',
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'dashboard-server.js'))) {
            // Auto-save so it never searches again
            vscode.workspace.getConfiguration('adlc').update('kitPath', c, vscode.ConfigurationTarget.Global);
            return c;
        }
    }
    return '';
}
function readJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function updateAgentStatus(kitPath, agentName, status, progress, task, blocker = '') {
    if (!kitPath) {
        return;
    }
    const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
    const pr = activeProj?.current
        ? (activeProj.current === '.' ? kitPath : path.resolve(kitPath, activeProj.current))
        : kitPath;
    const file = path.join(pr, 'agent-status.json');
    const data = readJSON(file) || {};
    const agents = data.agents || data;
    agents[agentName] = { status, progress, task, blocker, updated: new Date().toISOString() };
    if (data.agents) {
        data.agents = agents;
    }
    else {
        Object.assign(data, agents);
    }
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    }
    catch { }
}
function postToGroupChat(kitPath, from, role, message, tags) {
    if (!kitPath) {
        return;
    }
    const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
    const pr = activeProj?.current
        ? (activeProj.current === '.' ? kitPath : path.resolve(kitPath, activeProj.current))
        : kitPath;
    const file = path.join(pr, 'group-chat.json');
    const chat = readJSON(file) || { channel: 'team-panchayat-general', messages: [] };
    chat.messages.push({
        id: `msg-${Date.now()}`,
        from, role,
        type: 'message',
        message,
        tags,
        timestamp: new Date().toISOString(),
    });
    try {
        fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8');
    }
    catch { }
}
function buildProjectContext(kitPath) {
    if (!kitPath) {
        return '(no ADLC project loaded — set adlc.kitPath in VS Code settings)';
    }
    const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
    const pr = activeProj?.current
        ? (activeProj.current === '.' ? kitPath : path.resolve(kitPath, activeProj.current))
        : kitPath;
    const req = readJSON(path.join(pr, 'requirement.json')) || {};
    const status = readJSON(path.join(pr, 'agent-status.json')) || {};
    const agents = status.agents || status;
    const agentLines = Object.entries(agents)
        .map(([a, v]) => `  ${a}: ${v.status} (${v.progress}%) — ${v.task || ''}`)
        .join('\n') || '  (no agent status yet)';
    return [
        `=== ACTIVE PROJECT ===`,
        `Title       : ${req.title || '(no project)'}`,
        `Description : ${req.description || ''}`,
        `Sprint      : ${req.sprint || activeProj?.sprint || '01'}`,
        `DB Config   : ${JSON.stringify(req.dbConfig || {})}`,
        `Discovery   : ${req.discoveryComplete ? 'complete' : 'in-progress'}`,
        `Approved    : ${req.approvedByTarun || false}`,
        ``,
        `=== AGENT STATUS ===`,
        agentLines,
        ``,
        `=== YOUR ROLE ===`,
    ].join('\n');
}
// ── Copilot LLM call with retry on overload ──────────────────────────────────
// ── Pick best available Copilot model ────────────────────────────────────────
// VS Code exposes different family names depending on Copilot plan/version.
// We try the configured model first, then fall back through known families.
async function selectModel() {
    const configured = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
    // Try families in priority order
    const families = [configured, 'gpt-4o', 'claude-3.5-sonnet', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const seen = new Set();
    for (const family of families) {
        if (seen.has(family)) {
            continue;
        }
        seen.add(family);
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family });
            if (models.length > 0) {
                return models[0];
            }
        }
        catch { }
    }
    // Last resort: pick any available Copilot model
    try {
        const all = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (all.length > 0) {
            return all[0];
        }
    }
    catch { }
    return null;
}
async function callCopilot(persona, context, userMsg, response, token, retries = 3) {
    const model = await selectModel();
    if (!model) {
        response.markdown(`> ⚠️ **No Copilot model available.**\n>\n` +
            `> Make sure:\n` +
            `> 1. **GitHub Copilot** extension is installed and you're signed in\n` +
            `> 2. **GitHub Copilot Chat** extension is installed\n` +
            `> 3. Your Copilot subscription is active\n` +
            `> 4. Try: \`Ctrl+Shift+P\` → *"GitHub Copilot: Sign In"*\n`);
        return '';
    }
    const prompt = [persona, context, '=== USER MESSAGE ===', userMsg].filter(Boolean).join('\n\n');
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const res = await model.sendRequest(messages, {}, token);
            let full = '';
            for await (const chunk of res.text) {
                full += chunk;
                response.markdown(chunk);
            }
            return full;
        }
        catch (err) {
            const msg = err?.message || String(err);
            const isOverloaded = msg.includes('529') || msg.toLowerCase().includes('overload');
            const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');
            const isRetryable = isOverloaded || isRateLimit;
            if (isRetryable && attempt < retries) {
                const wait = (attempt + 1) * 4000;
                response.markdown(`\n> ⏳ Copilot temporarily busy — retrying in ${wait / 1000}s… (attempt ${attempt + 1}/${retries})\n\n`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            if (msg.includes('403') || msg.toLowerCase().includes('unauthorized')) {
                response.markdown(`\n> ❌ **Copilot access denied.** Check your subscription and sign-in status.\n`);
            }
            else {
                response.markdown(`\n> ❌ **Error:** ${msg}\n`);
            }
            return '';
        }
    }
    return '';
}
// ── Ensure kit path is configured — prompt on first use ──────────────────────
async function ensureKitPath() {
    let kitPath = getKitPath();
    if (kitPath) {
        return kitPath;
    }
    const pick = await vscode.window.showWarningMessage('Team Panchayat: ADLC-Agent-Kit folder not found. Set the path to enable project creation.', 'Browse for folder', 'Enter path manually', 'Cancel');
    if (pick === 'Browse for folder') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            title: 'Select your ADLC-Agent-Kit folder',
        });
        if (uris && uris[0]) {
            kitPath = uris[0].fsPath;
            await vscode.workspace.getConfiguration('adlc').update('kitPath', kitPath, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Kit path set to: ${kitPath}`);
        }
    }
    else if (pick === 'Enter path manually') {
        const entered = await vscode.window.showInputBox({
            prompt: 'Enter full path to ADLC-Agent-Kit folder',
            placeHolder: 'C:\\Users\\you\\Downloads\\ADLC-Agent-Kit',
            ignoreFocusOut: true,
        });
        if (entered && fs.existsSync(entered)) {
            kitPath = entered.trim();
            await vscode.workspace.getConfiguration('adlc').update('kitPath', kitPath, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Kit path set to: ${kitPath}`);
        }
        else if (entered) {
            vscode.window.showErrorMessage(`Folder not found: ${entered}`);
        }
    }
    return kitPath;
}
// ── New project wizard ────────────────────────────────────────────────────────
async function runNewProjectWizard() {
    const kitPath = await ensureKitPath();
    if (!kitPath) {
        return;
    }
    const title = await vscode.window.showInputBox({
        prompt: 'Project name',
        placeHolder: 'e.g. Cost Anomaly Detection Platform',
        ignoreFocusOut: true,
        validateInput: v => v.trim().length > 2 ? null : 'Enter at least 3 characters',
    });
    if (!title) {
        return;
    }
    const description = await vscode.window.showInputBox({
        prompt: 'What are you building?',
        placeHolder: 'e.g. A real-time dashboard to detect cloud cost anomalies using ML',
        ignoreFocusOut: true,
        validateInput: v => v.trim().length > 5 ? null : 'Enter a brief description',
    });
    if (!description) {
        return;
    }
    const goal = await vscode.window.showInputBox({
        prompt: 'Business goal (optional — press Enter to skip)',
        placeHolder: 'e.g. Reduce cloud spend by 20% by catching anomalies early',
        ignoreFocusOut: true,
    }) || '';
    const users = await vscode.window.showInputBox({
        prompt: 'Target users (optional — press Enter to skip)',
        placeHolder: 'e.g. DevOps engineers, FinOps teams',
        ignoreFocusOut: true,
    }) || '';
    const dbPick = await vscode.window.showQuickPick([
        { label: '$(database) PostgreSQL', description: 'Relational — OLTP, transactional apps, APIs', value: 'postgresql' },
        { label: '$(cloud) Snowflake', description: 'Data warehouse — analytics, BI, large-scale reporting', value: 'snowflake' },
        { label: '$(server) Both', description: 'PostgreSQL for live data + Snowflake for analytics', value: 'both' },
        { label: '$(question) Other / Not sure yet', description: 'Decide later', value: 'other' },
    ], { placeHolder: 'Which database does this project need?', ignoreFocusOut: true });
    const dbChoice = dbPick?.value || 'postgresql';
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Creating project: ${title}…`, cancellable: false }, async () => {
        try {
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
            const folder = slug + '-' + Date.now();
            const projectsBase = path.join(kitPath, 'projects');
            const absDir = path.join(projectsBase, folder);
            const relPath = 'projects/' + folder;
            fs.mkdirSync(absDir, { recursive: true });
            ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
                fs.mkdirSync(path.join(absDir, d), { recursive: true });
            });
            const dbConfig = {
                primary: dbChoice === 'both' ? 'postgresql' : dbChoice,
                analytics: dbChoice === 'both' || dbChoice === 'snowflake' ? 'snowflake' : 'none',
                existing: false,
                provisionNew: true,
                connectionHint: '',
            };
            const req = {
                requirementId: `REQ-${Date.now()}`,
                postedBy: 'Tarun Vangari',
                postedAt: new Date().toISOString(),
                title, description,
                businessGoal: goal,
                targetUsers: users,
                type: 'new_project',
                priority: 'high',
                sprint: '01',
                status: 'pending_analysis',
                discoveryComplete: false,
                approvedByTarun: false,
                dbConfig,
                agentInputs: Object.fromEntries(['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi']
                    .map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])),
                sprintPlan: '',
            };
            fs.writeFileSync(path.join(absDir, 'requirement.json'), JSON.stringify(req, null, 2), 'utf8');
            fs.writeFileSync(path.join(absDir, 'group-chat.json'), JSON.stringify({
                channel: 'team-panchayat-general', messages: [{
                        id: `msg-${Date.now()}`, from: 'ARJUN', role: 'Project Manager',
                        type: 'message', timestamp: new Date().toISOString(),
                        message: `📋 New project created: "${title}". Starting discovery with Tarun.`,
                        tags: ['arjun', 'tarun', 'discovery'],
                    }],
            }, null, 2), 'utf8');
            const agentStatus = { sprint: '01', agents: Object.fromEntries(['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'].map(a => [
                    a, { status: 'queue', progress: 0, task: 'Awaiting requirement analysis', blocker: '', updated: new Date().toISOString() }
                ])) };
            fs.writeFileSync(path.join(absDir, 'agent-status.json'), JSON.stringify(agentStatus, null, 2), 'utf8');
            // Switch active project
            const ap = { current: relPath, name: title, sprint: '01', status: 'pending_analysis', updatedAt: new Date().toISOString() };
            fs.writeFileSync(path.join(kitPath, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
            return;
        }
    });
    const action = await vscode.window.showInformationMessage(`✅ Project "${title}" created! Talk to @Arjun in Copilot Chat to start discovery.`, 'Open Copilot Chat', 'Open Dashboard');
    if (action === 'Open Copilot Chat') {
        vscode.commands.executeCommand('workbench.action.chat.open', `@Arjun Let's start discovery for "${title}". ${description}`);
    }
    else if (action === 'Open Dashboard') {
        const port = vscode.workspace.getConfiguration('adlc').get('serverPort') || 3000;
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
    }
}
// ── Status bar item showing active agent ─────────────────────────────────────
function createStatusBar() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.text = '$(hubot) Team Panchayat';
    item.tooltip = 'ADLC Agents — @Arjun @Vikram @Kavya @Kiran @Rasool @Rohan @Keerthi';
    item.command = 'teamPanchayat.agents';
    item.show();
    return item;
}
function updateStatusBarProject(item) {
    const kitPath = getKitPath();
    if (!kitPath) {
        item.text = '$(hubot) Team Panchayat — no kit path';
        return;
    }
    const ap = (() => { try {
        return JSON.parse(fs.readFileSync(path.join(kitPath, 'active-project.json'), 'utf8'));
    }
    catch {
        return null;
    } })();
    if (ap?.name) {
        item.text = `$(hubot) ${ap.name}`;
        item.tooltip = `Active: ${ap.name} | Sprint ${ap.sprint || '01'} — click to show agents`;
    }
    else {
        item.text = '$(hubot) Team Panchayat — no project';
    }
}
// ── Activate ──────────────────────────────────────────────────────────────────
async function activate(context) {
    const statusBar = createStatusBar();
    updateStatusBarProject(statusBar);
    context.subscriptions.push(statusBar);
    // Kit path is auto-detected — only show status bar, no prompt needed
    updateStatusBarProject(statusBar);
    // ── ARJUN — PM / Orchestrator ─────────────────────────────────────────────
    const arjun = vscode.chat.createChatParticipant('arjun-pm', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const cmd = request.command;
        // /new — trigger the full project creation wizard
        if (cmd === 'new') {
            response.markdown(`**👔 Arjun — Project Manager**\n\nOpening new project wizard…\n`);
            await runNewProjectWizard();
            updateStatusBarProject(statusBar);
            return;
        }
        const projectCtx = buildProjectContext(kitPath);
        statusBar.text = '$(hubot) Arjun — thinking…';
        updateAgentStatus(kitPath, 'arjun', 'wip', 20, 'Responding in chat');
        response.markdown(`**👔 Arjun — Project Manager**\n\n`);
        const persona = [
            `You are Arjun, the PM and Scrum Master for Team Panchayat.`,
            `You coordinate Vikram (infra), Rasool (DB), Kiran (backend), Kavya (UX), Rohan (frontend), Keerthi (QA).`,
            `Always reference the active project context below when answering.`,
            `Keep answers concise and actionable. Suggest next steps aligned to the sprint.`,
            projectCtx,
            cmd === 'plan' ? 'Focus on: sprint planning, story breakdown, priorities, acceptance criteria.' : '',
            cmd === 'status' ? 'Focus on: summarising agent statuses from the context above, identifying blockers.' : '',
            cmd === 'risks' ? 'Focus on: identifying risks in the current requirement and agent progress.' : '',
            cmd === 'approve' ? 'Focus on: confirming sprint plan approval and instructing agents to proceed.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || `Hello, what should the team work on for "${buildProjectContext(kitPath).split('\n')[1]}"?`, response, token);
        if (reply) {
            postToGroupChat(kitPath, 'ARJUN', 'Project Manager', reply.slice(0, 400), ['arjun', 'tarun']);
            updateAgentStatus(kitPath, 'arjun', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    arjun.iconPath = new vscode.ThemeIcon('person');
    // ── VIKRAM — Cloud Architect ──────────────────────────────────────────────
    const vikram = vscode.chat.createChatParticipant('vikram-architect', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Vikram — thinking…';
        updateAgentStatus(kitPath, 'vikram', 'wip', 20, 'Responding in chat');
        response.markdown(`**🏗️ Vikram — Cloud Architect**\n\n`);
        const persona = [
            `You are Vikram, Cloud Architect for Team Panchayat.`,
            `You design AWS infrastructure, write Terraform, and own /infra/modules/.`,
            `Always reference the active project. Use ADLC standards: Terraform >= 1.7, AWS provider >= 5.0, S3+DynamoDB backend, no hardcoded creds, tag all resources with Environment/Owner/CostCenter/Project.`,
            projectCtx,
            cmd === 'terraform' ? 'Provide complete, runnable Terraform code blocks for the active project.' : '',
            cmd === 'design' ? 'Provide a detailed AWS architecture recommendation with rationale.' : '',
            cmd === 'security' ? 'Provide a security assessment covering IAM, networking, encryption, and compliance.' : '',
            cmd === 'diagrams' ? 'Describe the architecture diagram in Mermaid graph TD syntax for the active project.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What infrastructure does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'VIKRAM', 'Cloud Architect', reply.slice(0, 400), ['vikram', 'arjun']);
            updateAgentStatus(kitPath, 'vikram', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    vikram.iconPath = new vscode.ThemeIcon('cloud');
    // ── KAVYA — UX Designer ───────────────────────────────────────────────────
    const kavya = vscode.chat.createChatParticipant('kavya-ux', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Kavya — thinking…';
        updateAgentStatus(kitPath, 'kavya', 'wip', 20, 'Responding in chat');
        response.markdown(`**🎨 Kavya — UX Designer**\n\n`);
        const persona = [
            `You are Kavya, UX Designer for Team Panchayat.`,
            `You own /frontend/src/tokens/ and /docs/component-spec.md.`,
            `Always reference the active project context. Design with dark mode first, CSS variables only, no hardcoded colours.`,
            `When designing, output: wireframe as ASCII art, component spec, and design tokens as CSS variables.`,
            projectCtx,
            cmd === 'design' ? 'Create wireframes and component specs for the active project screens.' : '',
            cmd === 'research' ? 'Analyse target users from the requirement and suggest a UX research plan.' : '',
            cmd === 'prototype' ? 'Describe a clickable prototype flow for the key user journey.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What UX design does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'KAVYA', 'UX Designer', reply.slice(0, 400), ['kavya', 'arjun', 'rohan']);
            updateAgentStatus(kitPath, 'kavya', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    kavya.iconPath = new vscode.ThemeIcon('paintcan');
    // ── KIRAN — Backend Engineer ──────────────────────────────────────────────
    const kiran = vscode.chat.createChatParticipant('kiran-backend', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Kiran — thinking…';
        updateAgentStatus(kitPath, 'kiran', 'wip', 20, 'Responding in chat');
        response.markdown(`**⚙️ Kiran — Backend Engineer**\n\n`);
        const persona = [
            `You are Kiran, Backend Engineer for Team Panchayat.`,
            `You own /backend/app/routers/, /backend/app/schemas/, /backend/tests/.`,
            `Always use: Python 3.11+, FastAPI with Pydantic v2, SQLAlchemy 2.x async, pytest >= 80% coverage.`,
            `All endpoints must have OpenAPI docstrings. No TODOs, no debug prints.`,
            `Coordinate with Rasool's DB models and Kavya's component spec — your API shapes must match both.`,
            projectCtx,
            cmd === 'api' ? 'Generate complete FastAPI router code for the active project endpoints.' : '',
            cmd === 'database' ? 'Design SQLAlchemy models coordinated with Rasool for the active project.' : '',
            cmd === 'security' ? 'Implement JWT auth, RBAC, and input validation for the active project.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What backend APIs does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'KIRAN', 'Backend Engineer', reply.slice(0, 400), ['kiran', 'arjun', 'rasool']);
            updateAgentStatus(kitPath, 'kiran', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    kiran.iconPath = new vscode.ThemeIcon('server');
    // ── RASOOL — Database Architect ───────────────────────────────────────────
    const rasool = vscode.chat.createChatParticipant('rasool-database', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Rasool — thinking…';
        updateAgentStatus(kitPath, 'rasool', 'wip', 20, 'Responding in chat');
        response.markdown(`**🗄️ Rasool — Database Architect**\n\n`);
        // Read dbConfig from requirement
        const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
        const pr = activeProj?.current === '.' ? kitPath : path.resolve(kitPath, activeProj?.current || '.');
        const req = readJSON(path.join(pr, 'requirement.json')) || {};
        const dbCfg = req.dbConfig || {};
        const persona = [
            `You are Rasool, Database Architect for Team Panchayat.`,
            `You own /backend/migrations/ and /docs/db-schema.md.`,
            `DB config for this project: primary=${dbCfg.primary || 'postgresql'}, analytics=${dbCfg.analytics || 'none'}, existing=${dbCfg.existing || false}.`,
            `For PostgreSQL: use SQLAlchemy 2.x, Alembic migrations, Pydantic v2 schemas.`,
            `For Snowflake: KEYPAIR AUTHENTICATION ONLY — never username/password. Use authenticator="snowflake_jwt".`,
            `Always give Kiran the exact field names from your schema so the API stays in sync.`,
            projectCtx,
            cmd === 'schema' ? 'Generate complete SQLAlchemy models and Alembic migration for the active project.' : '',
            cmd === 'optimize' ? 'Suggest indexing, partitioning, and query optimisation for the active project schema.' : '',
            cmd === 'migrate' ? 'Provide an Alembic migration plan for the active project data changes.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What database schema does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'RASOOL', 'Database Architect', reply.slice(0, 400), ['rasool', 'arjun', 'kiran']);
            updateAgentStatus(kitPath, 'rasool', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    rasool.iconPath = new vscode.ThemeIcon('database');
    // ── ROHAN — Frontend Engineer ─────────────────────────────────────────────
    const rohan = vscode.chat.createChatParticipant('rohan-frontend', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Rohan — thinking…';
        updateAgentStatus(kitPath, 'rohan', 'wip', 20, 'Responding in chat');
        response.markdown(`**💻 Rohan — Frontend Engineer**\n\n`);
        const persona = [
            `You are Rohan, Frontend Engineer for Team Panchayat.`,
            `You own /frontend/src/components/.`,
            `Always use: React 18 + TypeScript, Recharts only for charts, CSS variables from Kavya's design tokens, dark mode first, no hardcoded colours.`,
            `Components must match Kavya's component-spec.md and consume Kiran's API shapes exactly.`,
            projectCtx,
            cmd === 'component' ? 'Generate complete, typed React component(s) for the active project with proper props and CSS var usage.' : '',
            cmd === 'ui' ? 'Design the React component tree and routing structure for the active project.' : '',
            cmd === 'responsive' ? 'Add responsive breakpoints to the active project components using CSS variables.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What React components does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'ROHAN', 'Frontend Engineer', reply.slice(0, 400), ['rohan', 'arjun', 'kavya']);
            updateAgentStatus(kitPath, 'rohan', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    rohan.iconPath = new vscode.ThemeIcon('browser');
    // ── KEERTHI — QA Engineer ─────────────────────────────────────────────────
    const keerthi = vscode.chat.createChatParticipant('keerthi-qa', async (request, _ctx, response, token) => {
        const kitPath = getKitPath();
        const projectCtx = buildProjectContext(kitPath);
        const cmd = request.command;
        statusBar.text = '$(hubot) Keerthi — thinking…';
        updateAgentStatus(kitPath, 'keerthi', 'wip', 20, 'Responding in chat');
        response.markdown(`**🧪 Keerthi — QA Engineer**\n\n`);
        const persona = [
            `You are Keerthi, QA Engineer for Team Panchayat.`,
            `You are READ-ONLY across all code folders. You only write to /docs/qa-report.md.`,
            `You activate ONLY when Arjun confirms all 5 agents are DONE.`,
            `Use pytest, minimum 80% coverage. Test all FastAPI endpoints with TestClient. Test all React components.`,
            `Focus on: edge cases, security checks, accessibility, performance regression.`,
            projectCtx,
            cmd === 'test' ? 'Generate a complete pytest test plan for the active project backend endpoints.' : '',
            cmd === 'automate' ? 'Provide a test automation framework recommendation for the active project stack.' : '',
            cmd === 'quality' ? 'Assess the current agent statuses and identify quality risks for the active project.' : '',
        ].filter(Boolean).join('\n');
        const reply = await callCopilot(persona, '', request.prompt || 'What tests does this project need?', response, token);
        if (reply) {
            postToGroupChat(kitPath, 'KEERTHI', 'QA Engineer', reply.slice(0, 400), ['keerthi', 'arjun']);
            updateAgentStatus(kitPath, 'keerthi', 'done', 100, 'Chat response delivered');
        }
        statusBar.text = '$(hubot) Team Panchayat';
    });
    keerthi.iconPath = new vscode.ThemeIcon('beaker');
    // ── Commands ──────────────────────────────────────────────────────────────
    context.subscriptions.push(
    // New project — full wizard
    vscode.commands.registerCommand('teamPanchayat.newProject', async () => {
        await runNewProjectWizard();
        updateStatusBarProject(statusBar);
    }), 
    // Switch project
    vscode.commands.registerCommand('teamPanchayat.switchProject', async () => {
        const kp = await ensureKitPath();
        if (!kp) {
            return;
        }
        const projectsDir = path.join(kp, 'projects');
        if (!fs.existsSync(projectsDir)) {
            vscode.window.showInformationMessage('No projects found. Create one first with "Team Panchayat: New Project".');
            return;
        }
        const projects = fs.readdirSync(projectsDir)
            .filter(f => fs.existsSync(path.join(projectsDir, f, 'requirement.json')))
            .map(f => {
            const req = (() => { try {
                return JSON.parse(fs.readFileSync(path.join(projectsDir, f, 'requirement.json'), 'utf8'));
            }
            catch {
                return {};
            } })();
            return { label: req.title || f, description: `Sprint ${req.sprint || '01'} — ${req.status || ''}`, relPath: 'projects/' + f };
        });
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects found. Create one first.');
            return;
        }
        const picked = await vscode.window.showQuickPick(projects, { placeHolder: 'Select project to switch to' });
        if (!picked) {
            return;
        }
        const abs = path.resolve(kp, picked.relPath);
        const req = (() => { try {
            return JSON.parse(fs.readFileSync(path.join(abs, 'requirement.json'), 'utf8'));
        }
        catch {
            return {};
        } })();
        const ap = { current: picked.relPath, name: req.title || picked.relPath, sprint: req.sprint || '01', status: req.status || 'pending_analysis', updatedAt: new Date().toISOString() };
        fs.writeFileSync(path.join(kp, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
        updateStatusBarProject(statusBar);
        vscode.window.showInformationMessage(`✅ Switched to: ${picked.label}`);
    }), 
    // Open dashboard in browser (server must be running)
    vscode.commands.registerCommand('teamPanchayat.openDashboard', () => {
        const port = vscode.workspace.getConfiguration('adlc').get('serverPort') || 3000;
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
    }), 
    // Set kit path
    vscode.commands.registerCommand('teamPanchayat.setKitPath', async () => {
        await ensureKitPath();
        updateStatusBarProject(statusBar);
    }), 
    // Show agents list
    vscode.commands.registerCommand('teamPanchayat.agents', () => {
        vscode.window.showInformationMessage('Team Panchayat — use in Copilot Chat:  @Arjun /new  @Arjun /status  @Vikram /terraform  @Kavya /design  @Kiran /api  @Rasool /schema  @Rohan /component  @Keerthi /test', 'New Project', 'Open Dashboard').then(sel => {
            if (sel === 'New Project') {
                vscode.commands.executeCommand('teamPanchayat.newProject');
            }
            if (sel === 'Open Dashboard') {
                vscode.commands.executeCommand('teamPanchayat.openDashboard');
            }
        });
    }), arjun, vikram, kavya, kiran, rasool, rohan, keerthi);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map