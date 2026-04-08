// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
// Routes VS Code Copilot Chat (@adlc) <-> group-chat.json + agent responses via GitHub Copilot LLM
import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { ProjectManager } from './projectManager';
import { AgentRunner }    from './agentRunner';
import { FigmaDesigner }     from './figmaDesigner';
import { TerraformManager } from './terraformManager';

const AGENT_COLORS: Record<string, string> = {
  arjun:   '🟣', vikram: '🔴', rasool: '🟡',
  kavya:   '🩷', kiran:  '🔵', rohan:  '🔵', keerthi: '🟢',
};

export function registerChatParticipant(
  context:    vscode.ExtensionContext,
  projectMgr: ProjectManager,
  runner:     AgentRunner,
  terraform:  TerraformManager,
) {
  const figma = new FigmaDesigner(
    vscode.workspace.getConfiguration('adlc').get<string>('kitPath') || '',
    projectMgr,
  );

  const participant = vscode.chat.createChatParticipant('adlc.team', async (req, ctx, stream, token) => {
    const userMsg  = req.prompt.trim();
    const command  = req.command;          // e.g. /status /agents /approve /history
    const pr       = projectMgr.getProjectRoot();
    const req_data = projectMgr.getRequirement();

    // ── /history — show last N group chat messages ──────────────────────────
    if (command === 'history') {
      await showChatHistory(stream, pr, 20);
      return;
    }

    // ── /status — show agent dashboard ─────────────────────────────────────
    if (command === 'status') {
      await showAgentStatus(stream, projectMgr);
      return;
    }

    // ── /agents — launch all agents ─────────────────────────────────────────
    if (command === 'agents') {
      stream.markdown('**Launching all agents via GitHub Copilot…**\n\n');
      for (const a of ['arjun','vikram','rasool','kavya','kiran','rohan']) {
        stream.markdown(`- Launching **${a}**…\n`);
        await runner.launchAgent(a);
      }
      stream.markdown('\n✅ All agents launched.');
      return;
    }

    // ── /approve — approve sprint plan ─────────────────────────────────────
    if (command === 'approve') {
      const reqFile = path.join(pr, 'requirement.json');
      const data    = readJSON(reqFile) || {};
      data.approvedByTarun = true;
      data.status          = 'in_sprint';
      fs.writeFileSync(reqFile, JSON.stringify(data, null, 2), 'utf8');
      postToChat(pr, 'TARUN', 'Product Owner', 'broadcast',
        '✅ Sprint plan APPROVED by Tarun. All agents — sprint is GO. Begin execution now.',
        ['approved']);
      stream.markdown('✅ **Sprint plan approved!** Agents will begin execution.\n');
      return;
    }

    // ── /infra — trigger Vikram Terraform flow ─────────────────────────────
    if (command === 'infra') {
      await terraform.runVikramFlow(stream, token);
      return;
    }

    // ── /infra-plan — run terraform plan ───────────────────────────────────
    if (command === 'infra-plan') {
      await terraform.runTerraformPlan(stream);
      return;
    }

    // ── /infra-validate — run terraform validate ───────────────────────────
    if (command === 'infra-validate') {
      await terraform.runTerraformValidate(stream);
      return;
    }

    // ── /infra-modules — list TFE modules ──────────────────────────────────
    if (command === 'infra-modules') {
      if (!terraform.isConnected()) {
        stream.markdown(`⚠️ Not connected to Terraform Enterprise/Cloud.\n\nRun: **ADLC: Connect Terraform Enterprise** to login.\n`);
        return;
      }
      stream.markdown(`### 📦 Fetching modules from ${terraform.getConnectionInfo()}…\n\n`);
      const modules = await terraform.fetchTFEModules();
      if (modules.length === 0) {
        stream.markdown('No modules found in the private registry.\n');
        return;
      }
      stream.markdown(`| Module | Provider | Version | Source |\n|--------|----------|---------|--------|\n`);
      modules.forEach(m => stream.markdown(`| \`${m.name}\` | ${m.provider} | ${m.version} | \`${m.source}\` |\n`));
      return;
    }

    // ── /ux — trigger Kavya UX design via Figma ────────────────────────────
    if (command === 'ux') {
      await figma.runUXFlow(stream, token);
      return;
    }

    // ── /ux-feedback — Tarun reviews Kavya's Figma designs ─────────────────
    if (command === 'ux-feedback') {
      if (!userMsg || userMsg === '') {
        stream.markdown('Please provide feedback, e.g. `@adlc /ux-feedback change primary colour to navy blue`\n');
        return;
      }
      await figma.applyFeedback(userMsg, stream, token);
      return;
    }

    // ── Default: Tarun sends a message → save to group chat + get Arjun reply ──
    postToChat(pr, 'TARUN', 'Product Owner', 'message', userMsg, ['tarun']);

    // Stream recent chat context so Arjun has full picture
    const chatHistory = loadChatMessages(pr, 10);
    const historyText = chatHistory.map(m => `${m.from}: ${m.message}`).join('\n');

    // Select Copilot model
    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });

    if (!model) {
      stream.markdown('⚠️ GitHub Copilot model not available. Make sure Copilot is signed in.');
      return;
    }

    const systemContext = buildArjunContext(req_data, projectMgr.getAgentStatus(), historyText);

    stream.markdown(`**ARJUN** (PM · GitHub Copilot ${modelId})\n\n`);

    const messages = [
      vscode.LanguageModelChatMessage.User(systemContext + '\n\nTarun says: ' + userMsg),
    ];

    try {
      const response = await model.sendRequest(messages, {}, token);
      let arjunReply = '';
      for await (const chunk of response.text) {
        arjunReply += chunk;
        stream.markdown(chunk);
      }

      // Save Arjun's reply back to group chat
      postToChat(pr, 'ARJUN', 'Orchestrator', 'message', arjunReply, ['tarun']);

      // Check if Arjun's reply contains agent unlocks or file writes
      await handleArjunDirectives(arjunReply, pr, req_data, runner, stream);

    } catch (err: any) {
      stream.markdown(`\n\n❌ Error: ${err.message}`);
    }
  });

  // Register slash commands shown in chat
  participant.commandProvider = {
    provideCommands: () => [
      { name: 'history',          description: 'Show last 20 group chat messages' },
      { name: 'status',           description: 'Show all agent statuses and progress' },
      { name: 'agents',           description: 'Launch all agents via GitHub Copilot' },
      { name: 'approve',          description: 'Approve the sprint plan — start the build' },
      { name: 'ux',               description: 'Kavya: UX design flow with Figma' },
      { name: 'ux-feedback',      description: "Kavya: review + iterate on Figma designs" },
      { name: 'infra',            description: 'Vikram: generate Terraform (uses TFE modules if connected)' },
      { name: 'infra-plan',       description: 'Vikram: run terraform plan' },
      { name: 'infra-validate',   description: 'Vikram: run terraform validate' },
      { name: 'infra-modules',    description: 'Vikram: list modules from Terraform Enterprise/Cloud' },
    ],
  };

  participant.iconPath = new vscode.ThemeIcon('organization');
  context.subscriptions.push(participant);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildArjunContext(req: any, agents: any, history: string): string {
  const agentLines = Object.entries(agents)
    .map(([n, s]: any) => `  ${n}: ${s.status} (${s.progress || 0}%) — ${s.task || ''}`)
    .join('\n');

  return [
    `You are ARJUN, PM and Scrum Master for Team Panchayat (ADLC-Agent-Kit).`,
    `You are running inside VS Code via GitHub Copilot. Reply in the group chat.`,
    `Be concise, direct, and use markdown formatting.`,
    ``,
    `=== ACTIVE PROJECT ===`,
    `Title: ${req?.title || 'No project yet'}`,
    `Status: ${req?.status || '—'}`,
    `Discovery complete: ${req?.discoveryComplete || false}`,
    `Approved: ${req?.approvedByTarun || false}`,
    ``,
    `=== AGENT STATUS ===`,
    agentLines,
    ``,
    `=== RECENT GROUP CHAT ===`,
    history || '(no history)',
    ``,
    `=== YOUR ROLE ===`,
    `- If no project: ask Tarun what to build`,
    `- If discovery needed: ask 3-5 domain-specific questions`,
    `- If all agents done: compile sprint plan and ask for approval`,
    `- If approved: confirm agents are building`,
    `- NEVER message agents before discoveryComplete=true`,
  ].join('\n');
}

async function showChatHistory(stream: vscode.ChatResponseStream, pr: string, limit: number) {
  const messages = loadChatMessages(pr, limit);
  if (messages.length === 0) {
    stream.markdown('*No messages yet. Start by describing what you want to build.*\n');
    return;
  }
  stream.markdown(`### Group Chat — Last ${messages.length} messages\n\n`);
  for (const m of messages) {
    const icon = AGENT_COLORS[m.from?.toLowerCase()] || '⚪';
    stream.markdown(`${icon} **${m.from}** *(${m.type})* — ${new Date(m.timestamp).toLocaleTimeString()}\n\n${m.message}\n\n---\n\n`);
  }
}

async function showAgentStatus(stream: vscode.ChatResponseStream, projectMgr: ProjectManager) {
  const agents  = projectMgr.getAgentStatus();
  const req     = projectMgr.getRequirement();
  const STATUS_ICON: Record<string, string> = { done: '✅', wip: '⚙️', blocked: '🚫', queue: '⏳' };

  stream.markdown(`### Agent Status — *${req?.title || 'No active project'}*\n\n`);
  stream.markdown('| Agent | Status | Progress | Task |\n|-------|--------|----------|------|\n');
  for (const name of ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi']) {
    const s    = agents[name] || { status: 'queue', progress: 0, task: '—' };
    const icon = STATUS_ICON[s.status] || '❓';
    stream.markdown(`| ${icon} ${name} | ${s.status} | ${s.progress || 0}% | ${s.task || '—'} |\n`);
  }
}

async function handleArjunDirectives(reply: string, pr: string, req: any, runner: AgentRunner, stream: vscode.ChatResponseStream) {
  // If Arjun says discovery is complete and mentions unlocking agents
  if (reply.toLowerCase().includes('discoveryComplete: true') || reply.toLowerCase().includes('discovery complete')) {
    const reqFile = path.join(pr, 'requirement.json');
    const data    = readJSON(reqFile) || {};
    if (!data.discoveryComplete) {
      data.discoveryComplete = true;
      fs.writeFileSync(reqFile, JSON.stringify(data, null, 2), 'utf8');
      stream.markdown('\n\n✅ *Discovery marked complete. Agents are now unlocked.*\n');
    }
  }
}

function postToChat(pr: string, from: string, role: string, type: string, message: string, tags: string[]) {
  const file = path.join(pr, 'group-chat.json');
  const chat = readJSON(file) || { channel: 'team-panchayat-general', messages: [] };
  chat.messages.push({
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    from, role, type, message, tags,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8');
}

function loadChatMessages(pr: string, limit: number) {
  const file = path.join(pr, 'group-chat.json');
  const chat = readJSON(file) || { messages: [] };
  return (chat.messages || []).slice(-limit);
}

function readJSON(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
