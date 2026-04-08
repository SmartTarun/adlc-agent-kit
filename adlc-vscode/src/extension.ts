// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import { ProjectManager }      from './projectManager';
import { AgentRunner }         from './agentRunner';
import { SidebarProvider }     from './sidebar';
import { DashboardPanel }      from './webviewPanel';
import { MemoryManager }       from './memoryManager';
import { FileWatcher }         from './fileWatcher';
import { registerChatParticipant } from './chatParticipant';
import { FigmaDesigner }       from './figmaDesigner';
import { TerraformManager }    from './terraformManager';
import { RasoolManager }       from './rasoolManager';
import { KiranManager }        from './kiranManager';

export async function activate(context: vscode.ExtensionContext) {
  const kitPath = resolveKitPath();
  if (!kitPath) {
    vscode.window.showWarningMessage(
      'ADLC: Could not find ADLC-Agent-Kit folder. Set adlc.kitPath in settings.'
    );
    return;
  }

  const projectMgr = new ProjectManager(kitPath);
  const memoryMgr  = new MemoryManager(kitPath);
  const runner     = new AgentRunner(kitPath, projectMgr, memoryMgr);
  runner.setContext(context); // needed for Vikram's arch diagram WebView panel
  const sidebar    = new SidebarProvider(kitPath, projectMgr, runner, memoryMgr, context);
  const watcher    = new FileWatcher(kitPath, () => sidebar.refresh());

  // Register TreeView providers
  vscode.window.registerTreeDataProvider('adlc-project', sidebar.projectProvider);
  vscode.window.registerTreeDataProvider('adlc-agents',  sidebar.agentProvider);
  vscode.window.registerTreeDataProvider('adlc-memory',  sidebar.memoryProvider);

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('adlc.openDashboard', () => {
      DashboardPanel.show(context, kitPath, projectMgr);
    }),

    vscode.commands.registerCommand('adlc.newProject', async () => {
      await newProjectWizard(runner, projectMgr, sidebar);
    }),

    vscode.commands.registerCommand('adlc.launchAgent', async (item?: any) => {
      const agentName = item?.agentName || await pickAgent();
      if (!agentName) { return; }
      await runner.launchAgent(agentName);
    }),

    vscode.commands.registerCommand('adlc.launchAllAgents', async () => {
      const agents = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan'];
      for (const a of agents) { await runner.launchAgent(a); }
    }),

    vscode.commands.registerCommand('adlc.switchProject', async () => {
      const projects = projectMgr.listProjects();
      const items = projects.map(p => ({ label: p.name, description: p.sprint ? `Sprint ${p.sprint}` : '', path: p.path }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select project to switch to' });
      if (!picked) { return; }
      projectMgr.switchProject(picked.path);
      sidebar.refresh();
      vscode.window.showInformationMessage(`Switched to: ${picked.label}`);
    }),

    vscode.commands.registerCommand('adlc.viewMemory', async (item?: any) => {
      const agentName = item?.agentName || await pickAgent();
      if (!agentName) { return; }
      const mem = memoryMgr.readMemory(agentName);
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(mem, null, 2),
        language: 'json',
      });
      vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('adlc.clearMemory', async (item?: any) => {
      const agentName = item?.agentName || await pickAgent();
      if (!agentName) { return; }
      memoryMgr.clearMemory(agentName);
      sidebar.refresh();
      vscode.window.showInformationMessage(`Memory cleared for ${agentName}`);
    }),
  );

  // Terraform Enterprise/Cloud manager (Vikram)
  const terraform = new TerraformManager(kitPath, projectMgr);
  await terraform.loadTFEConfigFromSecrets(context);
  runner.setTerraformManager(terraform); // auto-generate on launchAgent('vikram')

  // Snowflake + DB schema manager (Rasool) — keypair auth only
  const rasool = new RasoolManager(kitPath, projectMgr);
  await rasool.loadSnowflakeConfigFromSecrets(context);
  runner.setRasoolManager(rasool); // auto-generate on launchAgent('rasool')

  // FastAPI generator (Kiran) — coordinates with Arjun + Rasool + Kavya
  const kiran = new KiranManager(kitPath, projectMgr);
  runner.setKiranManager(kiran); // auto-generate on launchAgent('kiran')

  // Register @adlc chat participant (VS Code Copilot Chat panel)
  registerChatParticipant(context, projectMgr, runner, terraform);

  // Register UX feedback commands using Figma
  const figma = new FigmaDesigner(kitPath, projectMgr);

  context.subscriptions.push(
    vscode.commands.registerCommand('adlc.connectTFE', async () => {
      const cfg = await TerraformManager.loginWizard(context);
      if (cfg) {
        await terraform.loadTFEConfigFromSecrets(context);
        sidebar.refresh();
      }
    }),

    vscode.commands.registerCommand('adlc.disconnectTFE', async () => {
      await TerraformManager.logout(context);
      await terraform.loadTFEConfigFromSecrets(context);
      sidebar.refresh();
    }),

    vscode.commands.registerCommand('adlc.connectSnowflake', async () => {
      const cfg = await RasoolManager.loginWizard(context);
      if (cfg) {
        await rasool.loadSnowflakeConfigFromSecrets(context);
        sidebar.refresh();
      }
    }),

    vscode.commands.registerCommand('adlc.disconnectSnowflake', async () => {
      await RasoolManager.logout(context);
      await rasool.loadSnowflakeConfigFromSecrets(context);
      sidebar.refresh();
    }),

    vscode.commands.registerCommand('adlc.uxDesign', async () => {
      const panel = vscode.window.createOutputChannel('ADLC — Kavya UX');
      panel.show();
      // UX flow is driven through @adlc /ux in chat
      vscode.commands.executeCommand('workbench.action.chat.open', '@adlc /ux');
    }),
  );

  watcher.start();
  context.subscriptions.push({ dispose: () => watcher.stop() });

  vscode.window.showInformationMessage(`ADLC Agent Kit ready — ${projectMgr.getActiveProjectName() || 'no active project'}`);
}

export function deactivate() {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveKitPath(): string | undefined {
  const cfg = vscode.workspace.getConfiguration('adlc').get<string>('kitPath');
  if (cfg && cfg.trim()) { return cfg.trim(); }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return undefined; }
  const fs = require('fs');
  for (const f of folders) {
    const p = f.uri.fsPath;
    if (fs.existsSync(require('path').join(p, 'dashboard-server.js'))) { return p; }
  }
  return undefined;
}

async function newProjectWizard(runner: AgentRunner, projectMgr: ProjectManager, sidebar: SidebarProvider) {
  const title = await vscode.window.showInputBox({ prompt: 'Project name', placeHolder: 'e.g. CRE Portfolio Analyser' });
  if (!title) { return; }
  const description = await vscode.window.showInputBox({ prompt: 'Description', placeHolder: 'What are you building?' });
  if (!description) { return; }
  const goal = await vscode.window.showInputBox({ prompt: 'Business goal (optional)', placeHolder: 'Why are you building it?' }) || '';
  const users = await vscode.window.showInputBox({ prompt: 'Target users (optional)' }) || '';

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating project: ${title}…`, cancellable: false },
    async () => {
      projectMgr.createProject({ title, description, businessGoal: goal, targetUsers: users, type: 'new_project', priority: 'high' });
      sidebar.refresh();
      const cfg = vscode.workspace.getConfiguration('adlc');
      if (cfg.get<boolean>('autoLaunchArjun')) {
        await runner.launchAgent('arjun');
      }
    }
  );
  vscode.window.showInformationMessage(`Project "${title}" created! Arjun is starting discovery.`);
}

async function pickAgent(): Promise<string | undefined> {
  const agents = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
  return vscode.window.showQuickPick(agents, { placeHolder: 'Select agent' });
}
