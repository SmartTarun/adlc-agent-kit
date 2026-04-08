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
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
const projectManager_1 = require("./projectManager");
const agentRunner_1 = require("./agentRunner");
const sidebar_1 = require("./sidebar");
const webviewPanel_1 = require("./webviewPanel");
const memoryManager_1 = require("./memoryManager");
const fileWatcher_1 = require("./fileWatcher");
const chatParticipant_1 = require("./chatParticipant");
const figmaDesigner_1 = require("./figmaDesigner");
const terraformManager_1 = require("./terraformManager");
const rasoolManager_1 = require("./rasoolManager");
const kiranManager_1 = require("./kiranManager");
async function activate(context) {
    const kitPath = resolveKitPath();
    if (!kitPath) {
        vscode.window.showWarningMessage('ADLC: Could not find ADLC-Agent-Kit folder. Set adlc.kitPath in settings.');
        return;
    }
    const projectMgr = new projectManager_1.ProjectManager(kitPath);
    const memoryMgr = new memoryManager_1.MemoryManager(kitPath);
    const runner = new agentRunner_1.AgentRunner(kitPath, projectMgr, memoryMgr);
    runner.setContext(context); // needed for Vikram's arch diagram WebView panel
    const sidebar = new sidebar_1.SidebarProvider(kitPath, projectMgr, runner, memoryMgr, context);
    const watcher = new fileWatcher_1.FileWatcher(kitPath, () => sidebar.refresh());
    // Register TreeView providers
    vscode.window.registerTreeDataProvider('adlc-project', sidebar.projectProvider);
    vscode.window.registerTreeDataProvider('adlc-agents', sidebar.agentProvider);
    vscode.window.registerTreeDataProvider('adlc-memory', sidebar.memoryProvider);
    // ── Commands ──────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('adlc.openDashboard', () => {
        webviewPanel_1.DashboardPanel.show(context, kitPath, projectMgr);
    }), vscode.commands.registerCommand('adlc.newProject', async () => {
        await newProjectWizard(runner, projectMgr, sidebar);
    }), vscode.commands.registerCommand('adlc.launchAgent', async (item) => {
        const agentName = item?.agentName || await pickAgent();
        if (!agentName) {
            return;
        }
        await runner.launchAgent(agentName);
    }), vscode.commands.registerCommand('adlc.launchAllAgents', async () => {
        const agents = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan'];
        for (const a of agents) {
            await runner.launchAgent(a);
        }
    }), vscode.commands.registerCommand('adlc.switchProject', async () => {
        const projects = projectMgr.listProjects();
        const items = projects.map(p => ({ label: p.name, description: p.sprint ? `Sprint ${p.sprint}` : '', path: p.path }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select project to switch to' });
        if (!picked) {
            return;
        }
        projectMgr.switchProject(picked.path);
        sidebar.refresh();
        vscode.window.showInformationMessage(`Switched to: ${picked.label}`);
    }), vscode.commands.registerCommand('adlc.viewMemory', async (item) => {
        const agentName = item?.agentName || await pickAgent();
        if (!agentName) {
            return;
        }
        const mem = memoryMgr.readMemory(agentName);
        const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(mem, null, 2),
            language: 'json',
        });
        vscode.window.showTextDocument(doc);
    }), vscode.commands.registerCommand('adlc.clearMemory', async (item) => {
        const agentName = item?.agentName || await pickAgent();
        if (!agentName) {
            return;
        }
        memoryMgr.clearMemory(agentName);
        sidebar.refresh();
        vscode.window.showInformationMessage(`Memory cleared for ${agentName}`);
    }));
    // Terraform Enterprise/Cloud manager (Vikram)
    const terraform = new terraformManager_1.TerraformManager(kitPath, projectMgr);
    await terraform.loadTFEConfigFromSecrets(context);
    runner.setTerraformManager(terraform); // auto-generate on launchAgent('vikram')
    // Snowflake + DB schema manager (Rasool) — keypair auth only
    const rasool = new rasoolManager_1.RasoolManager(kitPath, projectMgr);
    await rasool.loadSnowflakeConfigFromSecrets(context);
    runner.setRasoolManager(rasool); // auto-generate on launchAgent('rasool')
    // FastAPI generator (Kiran) — coordinates with Arjun + Rasool + Kavya
    const kiran = new kiranManager_1.KiranManager(kitPath, projectMgr);
    runner.setKiranManager(kiran); // auto-generate on launchAgent('kiran')
    // Register @adlc chat participant (VS Code Copilot Chat panel)
    (0, chatParticipant_1.registerChatParticipant)(context, projectMgr, runner, terraform);
    // Register UX feedback commands using Figma
    const figma = new figmaDesigner_1.FigmaDesigner(kitPath, projectMgr);
    context.subscriptions.push(vscode.commands.registerCommand('adlc.connectTFE', async () => {
        const cfg = await terraformManager_1.TerraformManager.loginWizard(context);
        if (cfg) {
            await terraform.loadTFEConfigFromSecrets(context);
            sidebar.refresh();
        }
    }), vscode.commands.registerCommand('adlc.disconnectTFE', async () => {
        await terraformManager_1.TerraformManager.logout(context);
        await terraform.loadTFEConfigFromSecrets(context);
        sidebar.refresh();
    }), vscode.commands.registerCommand('adlc.connectSnowflake', async () => {
        const cfg = await rasoolManager_1.RasoolManager.loginWizard(context);
        if (cfg) {
            await rasool.loadSnowflakeConfigFromSecrets(context);
            sidebar.refresh();
        }
    }), vscode.commands.registerCommand('adlc.disconnectSnowflake', async () => {
        await rasoolManager_1.RasoolManager.logout(context);
        await rasool.loadSnowflakeConfigFromSecrets(context);
        sidebar.refresh();
    }), vscode.commands.registerCommand('adlc.uxDesign', async () => {
        const panel = vscode.window.createOutputChannel('ADLC — Kavya UX');
        panel.show();
        // UX flow is driven through @adlc /ux in chat
        vscode.commands.executeCommand('workbench.action.chat.open', '@adlc /ux');
    }));
    watcher.start();
    context.subscriptions.push({ dispose: () => watcher.stop() });
    vscode.window.showInformationMessage(`ADLC Agent Kit ready — ${projectMgr.getActiveProjectName() || 'no active project'}`);
}
function deactivate() { }
// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveKitPath() {
    const cfg = vscode.workspace.getConfiguration('adlc').get('kitPath');
    if (cfg && cfg.trim()) {
        return cfg.trim();
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        return undefined;
    }
    const fs = require('fs');
    for (const f of folders) {
        const p = f.uri.fsPath;
        if (fs.existsSync(require('path').join(p, 'dashboard-server.js'))) {
            return p;
        }
    }
    return undefined;
}
async function newProjectWizard(runner, projectMgr, sidebar) {
    const title = await vscode.window.showInputBox({ prompt: 'Project name', placeHolder: 'e.g. CRE Portfolio Analyser' });
    if (!title) {
        return;
    }
    const description = await vscode.window.showInputBox({ prompt: 'Description', placeHolder: 'What are you building?' });
    if (!description) {
        return;
    }
    const goal = await vscode.window.showInputBox({ prompt: 'Business goal (optional)', placeHolder: 'Why are you building it?' }) || '';
    const users = await vscode.window.showInputBox({ prompt: 'Target users (optional)' }) || '';
    try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Creating project: ${title}…`, cancellable: false }, async () => {
            const projectPath = projectMgr.createProject({ title, description, businessGoal: goal, targetUsers: users, type: 'new_project', priority: 'high' });
            sidebar.refresh();
            const cfg = vscode.workspace.getConfiguration('adlc');
            if (cfg.get('autoLaunchArjun')) {
                await runner.launchAgent('arjun');
            }
            return projectPath;
        });
        vscode.window.showInformationMessage(`✅ Project "${title}" created! Agents are ready.`);
    }
    catch (err) {
        vscode.window.showErrorMessage(`❌ Failed to create project: ${err.message}`);
        console.error('[ADLC] Project creation error:', err);
    }
}
async function pickAgent() {
    const agents = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
    return vscode.window.showQuickPick(agents, { placeHolder: 'Select agent' });
}
//# sourceMappingURL=extension.js.map