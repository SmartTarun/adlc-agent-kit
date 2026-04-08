// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { ProjectManager }  from './projectManager';
import { MemoryManager }   from './memoryManager';
import { TerraformManager } from './terraformManager';
import { RasoolManager }    from './rasoolManager';
import { KiranManager }     from './kiranManager';

const AGENT_ROLES: Record<string, string> = {
  arjun:   'PM / Orchestrator',
  vikram:  'Cloud Architect / Terraform',
  rasool:  'Database Agent / PostgreSQL + Snowflake',
  kavya:   'UX Designer / Design Tokens',
  kiran:   'Backend Engineer / FastAPI',
  rohan:   'Frontend Engineer / React',
  keerthi: 'QA Agent',
};

export class AgentRunner {
  private terraform: TerraformManager | null = null;
  private rasool:    RasoolManager    | null = null;
  private kiran:     KiranManager     | null = null;

  constructor(
    private readonly kitPath: string,
    private readonly projectMgr: ProjectManager,
    private readonly memoryMgr: MemoryManager,
  ) {}

  setTerraformManager(terraform: TerraformManager) {
    this.terraform = terraform;
  }

  setRasoolManager(rasool: RasoolManager) {
    this.rasool = rasool;
  }

  setKiranManager(kiran: KiranManager) {
    this.kiran = kiran;
  }

  async launchAgent(agentName: string): Promise<void> {
    // ── Vikram: auto-generate Terraform from requirement — no prompt needed ──
    if (agentName === 'vikram' && this.terraform) {
      const outputChannel = vscode.window.createOutputChannel('ADLC — VIKRAM (Terraform)');
      outputChannel.show(true);
      outputChannel.appendLine('[ADLC] Vikram auto-generating Terraform from requirement.json…');
      const tokenSource = new vscode.CancellationTokenSource();
      await this.terraform.autoGenerate(outputChannel, tokenSource.token);
      this.memoryMgr.updateMemory('vikram', { lastStepCompleted: 'Auto-generated Terraform from requirement' });
      return;
    }

    // ── Kiran: auto-generate FastAPI coordinated with Arjun + Rasool + Kavya ──
    if (agentName === 'kiran' && this.kiran) {
      const outputChannel = vscode.window.createOutputChannel('ADLC — KIRAN (FastAPI)');
      outputChannel.show(true);
      outputChannel.appendLine('[ADLC] Kiran reading requirement.json + DB models + component spec…');
      const tokenSource = new vscode.CancellationTokenSource();
      await this.kiran.autoGenerate(outputChannel, tokenSource.token);
      this.memoryMgr.updateMemory('kiran', { lastStepCompleted: 'Auto-generated FastAPI from requirement + DB + UI spec' });
      return;
    }

    // ── Rasool: auto-generate DB schema/migrations from dbConfig ─────────────
    if (agentName === 'rasool' && this.rasool) {
      const outputChannel = vscode.window.createOutputChannel('ADLC — RASOOL (Database)');
      outputChannel.show(true);
      outputChannel.appendLine('[ADLC] Rasool auto-generating DB schema from requirement.json dbConfig…');
      const tokenSource = new vscode.CancellationTokenSource();
      await this.rasool.autoGenerate(outputChannel, tokenSource.token);
      this.memoryMgr.updateMemory('rasool', { lastStepCompleted: 'Auto-generated DB schema from requirement' });
      return;
    }

    // Select GitHub Copilot model
    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });

    if (!model) {
      vscode.window.showErrorMessage(
        `GitHub Copilot model "${modelId}" not available. Make sure GitHub Copilot is installed and signed in.`
      );
      return;
    }

    const pr          = this.projectMgr.getProjectRoot();
    const requirement = this.readJSON(path.join(pr, 'requirement.json')) || {};
    const memory      = this.memoryMgr.readMemory(agentName);
    const promptFile  = path.join(this.kitPath, 'prompts', `${agentName}-prompt.txt`);

    if (!fs.existsSync(promptFile)) {
      vscode.window.showErrorMessage(`Prompt file not found: prompts/${agentName}-prompt.txt`);
      return;
    }

    const basePrompt    = fs.readFileSync(promptFile, 'utf8');
    const contextBlock  = this.buildContextBlock(agentName, pr, requirement, memory);
    const fullPrompt    = contextBlock + '\n\n' + basePrompt;

    this.setAgentStatus(agentName, 'wip', 10, 'Running via GitHub Copilot…');
    this.appendLog(agentName, `[ADLC VSCode] Launching ${agentName} via GitHub Copilot (${modelId})\n`);

    const outputChannel = vscode.window.createOutputChannel(`ADLC — ${agentName.toUpperCase()}`);
    outputChannel.show(true);
    outputChannel.appendLine(`[ADLC] Launching ${agentName.toUpperCase()} (${AGENT_ROLES[agentName]}) via GitHub Copilot ${modelId}`);
    outputChannel.appendLine('─'.repeat(60));

    try {
      const messages = [
        vscode.LanguageModelChatMessage.User(fullPrompt),
      ];

      const tokenSource = new vscode.CancellationTokenSource();
      const response    = await model.sendRequest(messages, {}, tokenSource.token);

      let fullResponse = '';
      for await (const chunk of response.text) {
        fullResponse += chunk;
        outputChannel.append(chunk);
      }

      outputChannel.appendLine('\n' + '─'.repeat(60));
      outputChannel.appendLine('[ADLC] Agent completed.');

      // Parse and apply file writes from agent response
      await this.applyAgentOutput(agentName, pr, fullResponse, outputChannel);

      // Update memory
      this.memoryMgr.updateMemory(agentName, {
        lastActive:        new Date().toISOString(),
        lastStepCompleted: `Completed run via GitHub Copilot ${modelId}`,
      });

      this.setAgentStatus(agentName, 'done', 100, 'Completed via GitHub Copilot');
      this.appendLog(agentName, `[DONE] ${agentName} completed successfully\n`);

    } catch (err: any) {
      const msg = err?.message || String(err);
      outputChannel.appendLine(`\n[ERROR] ${msg}`);
      this.setAgentStatus(agentName, 'blocked', 0, `Error: ${msg}`, msg);
      this.appendLog(agentName, `[ERROR] ${msg}\n`);
      vscode.window.showErrorMessage(`ADLC: ${agentName} failed — ${msg}`);
    }
  }

  // ── Context block injected at the top of every agent prompt ──────────────

  private buildContextBlock(agentName: string, pr: string, req: any, memory: any): string {
    const activeProj = this.readJSON(path.join(this.kitPath, 'active-project.json')) || {};
    return [
      '=== RUNTIME CONTEXT (injected by ADLC VS Code Extension) ===',
      `AGENT_NAME        : ${agentName}`,
      `ROLE              : ${AGENT_ROLES[agentName] || agentName}`,
      `LLM               : GitHub Copilot (vscode.lm API)`,
      `PROJECT_ROOT      : ${pr}`,
      `REQUIREMENT_FILE  : ${path.join(pr, 'requirement.json')}`,
      `AGENT_STATUS_FILE : ${path.join(pr, 'agent-status.json')}`,
      `GROUP_CHAT_FILE   : ${path.join(pr, 'group-chat.json')}`,
      `MEMORY_FILE       : ${path.join(pr, 'agent-memory', agentName + '-memory.json')}`,
      `active-project    : ${path.join(this.kitPath, 'active-project.json')}`,
      '',
      '=== CURRENT REQUIREMENT SNAPSHOT ===',
      `title             : ${req.title || '(none)'}`,
      `description       : ${req.description || '(none)'}`,
      `businessGoal      : ${req.businessGoal || ''}`,
      `targetUsers       : ${req.targetUsers || ''}`,
      `sprint            : ${req.sprint || activeProj.sprint || '01'}`,
      `status            : ${req.status || 'pending_analysis'}`,
      `discoveryComplete : ${req.discoveryComplete || false}`,
      `approvedByTarun   : ${req.approvedByTarun || false}`,
      '',
      '=== AGENT MEMORY SNAPSHOT ===',
      memory ? JSON.stringify(memory, null, 2) : '(no memory yet)',
      '',
      '=== IMPORTANT ===',
      'You are running inside VS Code via the GitHub Copilot Language Model API.',
      'Write all files using absolute paths shown in RUNTIME CONTEXT above.',
      'Do NOT use /workspace/ aliases — use the PROJECT_ROOT path directly.',
      '=== END CONTEXT ===',
    ].join('\n');
  }

  // ── Parse ```filename ... ``` blocks and write files ─────────────────────

  private async applyAgentOutput(agentName: string, pr: string, response: string, out: vscode.OutputChannel) {
    const fileBlockRe = /```(?:[\w./\-]+)?\s*\n\/\/ FILE: ([^\n]+)\n([\s\S]*?)```/g;
    const altBlockRe  = /### FILE: ([^\n]+)\n```[\w]*\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;
    const written: string[] = [];

    for (const re of [fileBlockRe, altBlockRe]) {
      while ((match = re.exec(response)) !== null) {
        const relPath = match[1].trim();
        const content = match[2];
        const absPath = relPath.startsWith('/') ? relPath : path.join(pr, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
        written.push(relPath);
        out.appendLine(`[FILE WRITTEN] ${relPath}`);
      }
    }

    // Also apply JSON patches to requirement.json / agent-status.json / group-chat.json
    this.applyJSONPatches(agentName, pr, response);

    if (written.length > 0) {
      vscode.window.showInformationMessage(`ADLC: ${agentName} wrote ${written.length} file(s)`);
    }
  }

  private applyJSONPatches(agentName: string, pr: string, response: string) {
    // Group chat messages
    const chatRe = /```json\s*\n\{[^}]*"from"\s*:\s*"[^"]*"[^}]*"message"\s*:[^}]*\}/gs;
    const chatFile = path.join(pr, 'group-chat.json');
    const chat = this.readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
    let chatUpdated = false;
    let m: RegExpExecArray | null;
    while ((m = chatRe.exec(response)) !== null) {
      try {
        const msg = JSON.parse(m[0].replace(/^```json\s*\n/, '').replace(/\n?```$/, ''));
        if (msg.from && msg.message) {
          chat.messages.push({ id: `msg-${Date.now()}-vsc`, timestamp: new Date().toISOString(), ...msg });
          chatUpdated = true;
        }
      } catch {}
    }
    if (chatUpdated) { fs.writeFileSync(chatFile, JSON.stringify(chat, null, 2), 'utf8'); }

    // Agent status update
    const statusRe = /"status"\s*:\s*"(wip|done|blocked|queue)".*?"progress"\s*:\s*(\d+)/s;
    const sm = response.match(statusRe);
    if (sm) { this.setAgentStatus(agentName, sm[1], parseInt(sm[2]), 'Updated by agent'); }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setAgentStatus(agentName: string, status: string, progress: number, task: string, blocker = '') {
    const pr       = this.projectMgr.getProjectRoot();
    const file     = path.join(pr, 'agent-status.json');
    const data     = this.readJSON(file) || { agents: {} };
    const agents   = data.agents || data;
    agents[agentName] = { status, progress, task, blocker, updated: new Date().toISOString() };
    if (data.agents) { data.agents = agents; } else { Object.assign(data, agents); }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  private appendLog(agentName: string, text: string) {
    const logPath = path.join(this.kitPath, 'agent-logs', `${agentName}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, text, 'utf8');
  }

  private readJSON(file: string): any {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
}
