// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { AgentRunner }    from './agentRunner';
import { MemoryManager }  from './memoryManager';

const STATUS_ICON: Record<string, string> = {
  done:    '✅',
  wip:     '⚙️',
  blocked: '🚫',
  queue:   '⏳',
  standby: '💤',
};

// ── Project Provider ──────────────────────────────────────────────────────────

class ProjectTreeItem extends vscode.TreeItem {
  constructor(label: string, description: string, icon: string, collapsible = vscode.TreeItemCollapsibleState.None) {
    super(label, collapsible);
    this.description = description;
    this.iconPath    = new vscode.ThemeIcon(icon);
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly projectMgr: ProjectManager) {}

  refresh() { this._onDidChange.fire(undefined); }

  getTreeItem(el: vscode.TreeItem) { return el; }

  getChildren(): vscode.TreeItem[] {
    const ap  = this.projectMgr.getActiveProject();
    const req = this.projectMgr.getRequirement();
    if (!ap?.name && !req?.title) {
      return [new ProjectTreeItem('No active project', 'Create one with ADLC: New Project', 'info')];
    }
    return [
      new ProjectTreeItem(req.title || ap.name || '—',         `Sprint ${ap.sprint || '01'}`,        'folder-active'),
      new ProjectTreeItem('Status',     req.status || '—',                                             'circle-outline'),
      new ProjectTreeItem('Discovery',  req.discoveryComplete ? 'Complete' : 'In progress',            req.discoveryComplete ? 'pass' : 'loading~spin'),
      new ProjectTreeItem('Approved',   req.approvedByTarun   ? 'Yes ✅'   : 'Pending',               req.approvedByTarun   ? 'pass' : 'clock'),
      new ProjectTreeItem('Priority',   req.priority || '—',                                           'flame'),
      new ProjectTreeItem('Deadline',   req.deadline || '—',                                           'calendar'),
    ];
  }
}

// ── Agent Provider ────────────────────────────────────────────────────────────

export class AgentTreeItem extends vscode.TreeItem {
  constructor(public readonly agentName: string, status: any) {
    const icon  = STATUS_ICON[status?.status] || '❓';
    const pct   = status?.progress ?? 0;
    super(`${icon} ${agentName}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${pct}% — ${status?.task || 'idle'}`;
    this.contextValue = 'agent';
    this.tooltip      = status?.blocker ? `Blocker: ${status.blocker}` : status?.task || '';
    this.iconPath     = new vscode.ThemeIcon(
      status?.status === 'done'    ? 'pass-filled' :
      status?.status === 'wip'     ? 'loading~spin' :
      status?.status === 'blocked' ? 'error' : 'circle-outline'
    );
    this.command = {
      command:   'adlc.launchAgent',
      title:     'Launch Agent',
      arguments: [this],
    };
  }
}

export class AgentTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly projectMgr: ProjectManager) {}

  refresh() { this._onDidChange.fire(undefined); }

  getTreeItem(el: vscode.TreeItem) { return el; }

  getChildren(): vscode.TreeItem[] {
    const agents = this.projectMgr.getAgentStatus();
    const order  = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
    return order.map(name => new AgentTreeItem(name, agents[name] || { status: 'queue', progress: 0, task: 'Waiting' }));
  }
}

// ── Memory Provider ───────────────────────────────────────────────────────────

export class MemoryTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly memoryMgr: MemoryManager) {}

  refresh() { this._onDidChange.fire(undefined); }

  getTreeItem(el: vscode.TreeItem) { return el; }

  getChildren(el?: vscode.TreeItem): vscode.TreeItem[] {
    if (!el) {
      const memories = this.memoryMgr.getAllMemories();
      if (Object.keys(memories).length === 0) {
        const item = new vscode.TreeItem('No memory files yet', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }
      return Object.entries(memories).map(([agent, mem]) => {
        const item       = new vscode.TreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = mem?.currentTask?.status || '';
        item.iconPath    = new vscode.ThemeIcon('database');
        (item as any).agentName = agent;
        return item;
      });
    }

    const agentName = (el as any).agentName;
    if (!agentName) { return []; }
    const mem = this.memoryMgr.readMemory(agentName);
    if (!mem) { return []; }
    return [
      this.memItem('Sessions',      String(mem.sessionCount || 0)),
      this.memItem('Last active',   mem.lastActive ? new Date(mem.lastActive).toLocaleString() : '—'),
      this.memItem('Last step',     mem.currentTask?.lastStepCompleted || '—'),
      this.memItem('Progress',      `${mem.currentTask?.progressPercent || 0}%`),
      this.memItem('Files created', (mem.filesCreated || []).length + ' files'),
      this.memItem('Pending steps', (mem.pendingNextSteps || []).length + ' steps'),
    ];
  }

  private memItem(label: string, value: string): vscode.TreeItem {
    const item       = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = value;
    item.iconPath    = new vscode.ThemeIcon('symbol-field');
    return item;
  }
}

// ── Facade ────────────────────────────────────────────────────────────────────

export class SidebarProvider {
  readonly projectProvider: ProjectTreeProvider;
  readonly agentProvider:   AgentTreeProvider;
  readonly memoryProvider:  MemoryTreeProvider;

  constructor(
    kitPath:    string,
    projectMgr: ProjectManager,
    runner:     AgentRunner,
    memoryMgr:  MemoryManager,
    context:    vscode.ExtensionContext,
  ) {
    this.projectProvider = new ProjectTreeProvider(projectMgr);
    this.agentProvider   = new AgentTreeProvider(projectMgr);
    this.memoryProvider  = new MemoryTreeProvider(memoryMgr);
  }

  refresh() {
    this.projectProvider.refresh();
    this.agentProvider.refresh();
    this.memoryProvider.refresh();
  }
}
