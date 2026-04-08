// Team Panchayat Custom Agents Extension
// Agent: Custom Agents Extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getKitPath(): string {
  const cfg = vscode.workspace.getConfiguration('adlc').get<string>('kitPath') as string;
  if (cfg && cfg.trim()) { return cfg.trim(); }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return ''; }
  for (const f of folders) {
    const p = f.uri.fsPath;
    if (fs.existsSync(path.join(p, 'dashboard-server.js'))) { return p; }
  }
  return folders[0]?.uri.fsPath || '';
}

function readJSON(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function updateAgentStatus(kitPath: string, agentName: string, status: 'wip' | 'done' | 'blocked', progress: number, task: string, blocker = '') {
  if (!kitPath) { return; }
  const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
  const pr = activeProj?.current
    ? (activeProj.current === '.' ? kitPath : path.resolve(kitPath, activeProj.current))
    : kitPath;
  const file = path.join(pr, 'agent-status.json');
  const data = readJSON(file) || {};
  const agents = data.agents || data;
  agents[agentName] = { status, progress, task, blocker, updated: new Date().toISOString() };
  if (data.agents) { data.agents = agents; } else { Object.assign(data, agents); }
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

function postToGroupChat(kitPath: string, from: string, role: string, message: string, tags: string[]) {
  if (!kitPath) { return; }
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
  try { fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8'); } catch {}
}

function buildProjectContext(kitPath: string): string {
  if (!kitPath) { return '(no ADLC project loaded — set adlc.kitPath in VS Code settings)'; }
  const activeProj = readJSON(path.join(kitPath, 'active-project.json'));
  const pr = activeProj?.current
    ? (activeProj.current === '.' ? kitPath : path.resolve(kitPath, activeProj.current))
    : kitPath;
  const req    = readJSON(path.join(pr, 'requirement.json')) || {};
  const status = readJSON(path.join(pr, 'agent-status.json')) || {};
  const agents = status.agents || status;

  const agentLines = Object.entries(agents)
    .map(([a, v]: [string, any]) => `  ${a}: ${v.status} (${v.progress}%) — ${v.task || ''}`)
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

async function callCopilot(
  persona:  string,
  context:  string,
  userMsg:  string,
  response: vscode.ChatResponseStream,
  token:    vscode.CancellationToken,
  retries = 2,
): Promise<string> {
  const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
  const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });

  if (!model) {
    const msg = `GitHub Copilot (${modelId}) not available. Make sure Copilot is installed and signed in.`;
    response.markdown(`> ⚠️ ${msg}`);
    return '';
  }

  const prompt = `${persona}\n\n${context}\n\n=== USER MESSAGE ===\n${userMsg}`;

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
    } catch (err: any) {
      const isOverloaded = err?.message?.includes('529') || err?.message?.toLowerCase().includes('overload');
      if (isOverloaded && attempt < retries) {
        const wait = (attempt + 1) * 3000;
        response.markdown(`\n> ⏳ Model temporarily overloaded — retrying in ${wait / 1000}s…\n\n`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      response.markdown(`\n> ❌ Error: ${err?.message || err}\n`);
      return '';
    }
  }
  return '';
}

// ── Status bar item showing active agent ─────────────────────────────────────

function createStatusBar(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = '$(hubot) Team Panchayat';
  item.tooltip = 'ADLC Agents — @Arjun @Vikram @Kavya @Kiran @Rasool @Rohan @Keerthi';
  item.command = 'teamPanchayat.agents';
  item.show();
  return item;
}

// ── Activate ──────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext) {
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // ── ARJUN — PM / Orchestrator ─────────────────────────────────────────────
  const arjun = vscode.chat.createChatParticipant('arjun-pm', async (request, _ctx, response, token) => {
    const kitPath = getKitPath();
    const projectCtx = buildProjectContext(kitPath);
    const cmd = request.command;

    statusBar.text = '$(hubot) Arjun — thinking…';
    updateAgentStatus(kitPath, 'arjun', 'wip', 20, 'Responding in chat');
    response.markdown(`**👔 Arjun — Project Manager**\n\n`);

    const persona = [
      `You are Arjun, the PM and Scrum Master for Team Panchayat.`,
      `You coordinate Vikram (infra), Rasool (DB), Kiran (backend), Kavya (UX), Rohan (frontend), Keerthi (QA).`,
      `Always reference the active project context below when answering.`,
      `Keep answers concise and actionable. Suggest next steps aligned to the sprint.`,
      projectCtx,
      cmd === 'plan'     ? 'Focus on: sprint planning, story breakdown, priorities, acceptance criteria.' : '',
      cmd === 'status'   ? 'Focus on: summarising agent statuses from the context above, identifying blockers.' : '',
      cmd === 'risks'    ? 'Focus on: identifying risks in the current requirement and agent progress.' : '',
      cmd === 'approve'  ? 'Focus on: confirming sprint plan approval and instructing agents to proceed.' : '',
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
      cmd === 'terraform'  ? 'Provide complete, runnable Terraform code blocks for the active project.' : '',
      cmd === 'design'     ? 'Provide a detailed AWS architecture recommendation with rationale.' : '',
      cmd === 'security'   ? 'Provide a security assessment covering IAM, networking, encryption, and compliance.' : '',
      cmd === 'diagrams'   ? 'Describe the architecture diagram in Mermaid graph TD syntax for the active project.' : '',
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
      cmd === 'design'     ? 'Create wireframes and component specs for the active project screens.' : '',
      cmd === 'research'   ? 'Analyse target users from the requirement and suggest a UX research plan.' : '',
      cmd === 'prototype'  ? 'Describe a clickable prototype flow for the key user journey.' : '',
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
      cmd === 'api'       ? 'Generate complete FastAPI router code for the active project endpoints.' : '',
      cmd === 'database'  ? 'Design SQLAlchemy models coordinated with Rasool for the active project.' : '',
      cmd === 'security'  ? 'Implement JWT auth, RBAC, and input validation for the active project.' : '',
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
      cmd === 'schema'    ? 'Generate complete SQLAlchemy models and Alembic migration for the active project.' : '',
      cmd === 'optimize'  ? 'Suggest indexing, partitioning, and query optimisation for the active project schema.' : '',
      cmd === 'migrate'   ? 'Provide an Alembic migration plan for the active project data changes.' : '',
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
      cmd === 'component'  ? 'Generate complete, typed React component(s) for the active project with proper props and CSS var usage.' : '',
      cmd === 'ui'         ? 'Design the React component tree and routing structure for the active project.' : '',
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
      cmd === 'test'      ? 'Generate a complete pytest test plan for the active project backend endpoints.' : '',
      cmd === 'automate'  ? 'Provide a test automation framework recommendation for the active project stack.' : '',
      cmd === 'quality'   ? 'Assess the current agent statuses and identify quality risks for the active project.' : '',
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
    vscode.commands.registerCommand('teamPanchayat.agents', () => {
      vscode.window.showInformationMessage(
        'Team Panchayat Agents — use in Copilot Chat:\n' +
        '@Arjun (PM)  @Vikram (Infra)  @Kavya (UX)\n' +
        '@Kiran (API) @Rasool (DB)     @Rohan (Frontend) @Keerthi (QA)',
        'Open Dashboard',
      ).then(sel => {
        if (sel === 'Open Dashboard') {
          vscode.commands.executeCommand('adlc.openDashboard');
        }
      });
    }),

    vscode.commands.registerCommand('teamPanchayat.openDashboard', () => {
      const port = vscode.workspace.getConfiguration('adlc').get<number>('serverPort') || 3000;
      vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
    }),

    arjun, vikram, kavya, kiran, rasool, rohan, keerthi,
  );
}

export function deactivate() {}
