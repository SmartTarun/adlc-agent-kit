// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as fs   from 'fs';
import * as path from 'path';

export interface ProjectInfo {
  name:   string;
  sprint: string;
  status: string;
  path:   string;
}

export class ProjectManager {
  constructor(private readonly kitPath: string) {}

  getProjectRoot(): string {
    const ap = this.readActiveProject();
    const rel = ap?.current || '.';
    return rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);
  }

  getActiveProjectName(): string {
    return this.readActiveProject()?.name || '';
  }

  getActiveProject(): any {
    return this.readActiveProject() || {};
  }

  getRequirement(): any {
    return this.readJSON(path.join(this.getProjectRoot(), 'requirement.json')) || {};
  }

  getAgentStatus(): any {
    const data = this.readJSON(path.join(this.getProjectRoot(), 'agent-status.json')) || {};
    return data.agents || data;
  }

  listProjects(): ProjectInfo[] {
    const projectsDir = path.join(this.kitPath, 'projects');
    if (!fs.existsSync(projectsDir)) { return []; }
    return fs.readdirSync(projectsDir)
      .map(folder => {
        const abs = path.join(projectsDir, folder);
        try { if (!fs.statSync(abs).isDirectory()) { return null; } } catch { return null; }
        const req = this.readJSON(path.join(abs, 'requirement.json'));
        if (!req?.requirementId) { return null; }
        return { name: req.title || folder, sprint: req.sprint || '01', status: req.status || 'pending', path: 'projects/' + folder } as ProjectInfo;
      })
      .filter((p): p is ProjectInfo => p !== null);
  }

  switchProject(relPath: string) {
    const abs = path.resolve(this.kitPath, relPath);
    const req = this.readJSON(path.join(abs, 'requirement.json')) || {};
    const ap  = {
      current:   relPath,
      name:      req.title || relPath,
      sprint:    req.sprint || '01',
      status:    req.status || 'pending_analysis',
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(this.kitPath, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
  }

  createProject(data: { title: string; description: string; businessGoal?: string; targetUsers?: string; type?: string; priority?: string }) {
    const slug      = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
    const folder    = slug + '-' + Date.now();
    const absDir    = path.join(this.kitPath, 'projects', folder);
    const relPath   = 'projects/' + folder;

    fs.mkdirSync(absDir, { recursive: true });
    ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
      fs.mkdirSync(path.join(absDir, d), { recursive: true });
    });

    const req = {
      requirementId:    `REQ-${Date.now()}`,
      postedBy:         'Tarun Vangari',
      postedAt:         new Date().toISOString(),
      title:            data.title,
      description:      data.description,
      businessGoal:     data.businessGoal || '',
      targetUsers:      data.targetUsers  || '',
      type:             data.type         || 'new_project',
      priority:         data.priority     || 'high',
      sprint:           '01',
      status:           'pending_analysis',
      discoveryComplete: false,
      approvedByTarun:  false,
      agentInputs:      Object.fromEntries(
        ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'].map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])
      ),
      sprintPlan: '',
    };

    fs.writeFileSync(path.join(absDir, 'requirement.json'), JSON.stringify(req, null, 2), 'utf8');
    fs.writeFileSync(path.join(absDir, 'group-chat.json'), JSON.stringify({ channel: 'team-panchayat-general', messages: [] }, null, 2), 'utf8');

    const status = { sprint: '01', agents: Object.fromEntries(
      ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'].map(a => [a, { status: 'queue', progress: 0, task: 'Awaiting requirement analysis', blocker: '', updated: new Date().toISOString() }])
    )};
    fs.writeFileSync(path.join(absDir, 'agent-status.json'), JSON.stringify(status, null, 2), 'utf8');

    this.switchProject(relPath);
    return relPath;
  }

  private readActiveProject(): any {
    return this.readJSON(path.join(this.kitPath, 'active-project.json'));
  }

  private readJSON(file: string): any {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
}
