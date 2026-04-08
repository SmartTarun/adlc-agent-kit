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
exports.SidebarProvider = exports.MemoryTreeProvider = exports.AgentTreeProvider = exports.AgentTreeItem = exports.ProjectTreeProvider = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
const STATUS_ICON = {
    done: '✅',
    wip: '⚙️',
    blocked: '🚫',
    queue: '⏳',
    standby: '💤',
};
// ── Project Provider ──────────────────────────────────────────────────────────
class ProjectTreeItem extends vscode.TreeItem {
    constructor(label, description, icon, collapsible = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsible);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}
class ProjectTreeProvider {
    constructor(projectMgr) {
        this.projectMgr = projectMgr;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(undefined); }
    getTreeItem(el) { return el; }
    getChildren() {
        const ap = this.projectMgr.getActiveProject();
        const req = this.projectMgr.getRequirement();
        if (!ap?.name && !req?.title) {
            return [new ProjectTreeItem('No active project', 'Create one with ADLC: New Project', 'info')];
        }
        return [
            new ProjectTreeItem(req.title || ap.name || '—', `Sprint ${ap.sprint || '01'}`, 'folder-active'),
            new ProjectTreeItem('Status', req.status || '—', 'circle-outline'),
            new ProjectTreeItem('Discovery', req.discoveryComplete ? 'Complete' : 'In progress', req.discoveryComplete ? 'pass' : 'loading~spin'),
            new ProjectTreeItem('Approved', req.approvedByTarun ? 'Yes ✅' : 'Pending', req.approvedByTarun ? 'pass' : 'clock'),
            new ProjectTreeItem('Priority', req.priority || '—', 'flame'),
            new ProjectTreeItem('Deadline', req.deadline || '—', 'calendar'),
        ];
    }
}
exports.ProjectTreeProvider = ProjectTreeProvider;
// ── Agent Provider ────────────────────────────────────────────────────────────
class AgentTreeItem extends vscode.TreeItem {
    constructor(agentName, status) {
        const icon = STATUS_ICON[status?.status] || '❓';
        const pct = status?.progress ?? 0;
        super(`${icon} ${agentName}`, vscode.TreeItemCollapsibleState.None);
        this.agentName = agentName;
        this.description = `${pct}% — ${status?.task || 'idle'}`;
        this.contextValue = 'agent';
        this.tooltip = status?.blocker ? `Blocker: ${status.blocker}` : status?.task || '';
        this.iconPath = new vscode.ThemeIcon(status?.status === 'done' ? 'pass-filled' :
            status?.status === 'wip' ? 'loading~spin' :
                status?.status === 'blocked' ? 'error' : 'circle-outline');
        this.command = {
            command: 'adlc.launchAgent',
            title: 'Launch Agent',
            arguments: [this],
        };
    }
}
exports.AgentTreeItem = AgentTreeItem;
class AgentTreeProvider {
    constructor(projectMgr) {
        this.projectMgr = projectMgr;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(undefined); }
    getTreeItem(el) { return el; }
    getChildren() {
        const agents = this.projectMgr.getAgentStatus();
        const order = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
        return order.map(name => new AgentTreeItem(name, agents[name] || { status: 'queue', progress: 0, task: 'Waiting' }));
    }
}
exports.AgentTreeProvider = AgentTreeProvider;
// ── Memory Provider ───────────────────────────────────────────────────────────
class MemoryTreeProvider {
    constructor(memoryMgr) {
        this.memoryMgr = memoryMgr;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    refresh() { this._onDidChange.fire(undefined); }
    getTreeItem(el) { return el; }
    getChildren(el) {
        if (!el) {
            const memories = this.memoryMgr.getAllMemories();
            if (Object.keys(memories).length === 0) {
                const item = new vscode.TreeItem('No memory files yet', vscode.TreeItemCollapsibleState.None);
                item.iconPath = new vscode.ThemeIcon('info');
                return [item];
            }
            return Object.entries(memories).map(([agent, mem]) => {
                const item = new vscode.TreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
                item.description = mem?.currentTask?.status || '';
                item.iconPath = new vscode.ThemeIcon('database');
                item.agentName = agent;
                return item;
            });
        }
        const agentName = el.agentName;
        if (!agentName) {
            return [];
        }
        const mem = this.memoryMgr.readMemory(agentName);
        if (!mem) {
            return [];
        }
        return [
            this.memItem('Sessions', String(mem.sessionCount || 0)),
            this.memItem('Last active', mem.lastActive ? new Date(mem.lastActive).toLocaleString() : '—'),
            this.memItem('Last step', mem.currentTask?.lastStepCompleted || '—'),
            this.memItem('Progress', `${mem.currentTask?.progressPercent || 0}%`),
            this.memItem('Files created', (mem.filesCreated || []).length + ' files'),
            this.memItem('Pending steps', (mem.pendingNextSteps || []).length + ' steps'),
        ];
    }
    memItem(label, value) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = value;
        item.iconPath = new vscode.ThemeIcon('symbol-field');
        return item;
    }
}
exports.MemoryTreeProvider = MemoryTreeProvider;
// ── Facade ────────────────────────────────────────────────────────────────────
class SidebarProvider {
    constructor(kitPath, projectMgr, runner, memoryMgr, context) {
        this.projectProvider = new ProjectTreeProvider(projectMgr);
        this.agentProvider = new AgentTreeProvider(projectMgr);
        this.memoryProvider = new MemoryTreeProvider(memoryMgr);
    }
    refresh() {
        this.projectProvider.refresh();
        this.agentProvider.refresh();
        this.memoryProvider.refresh();
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=sidebar.js.map