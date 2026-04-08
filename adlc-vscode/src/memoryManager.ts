// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as fs   from 'fs';
import * as path from 'path';
import { ProjectManager } from './projectManager';

export class MemoryManager {
  constructor(private readonly kitPath: string) {}

  readMemory(agentName: string): any {
    const pr   = this.getProjectRoot();
    const file = path.join(pr, 'agent-memory', `${agentName}-memory.json`);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }

  updateMemory(agentName: string, patch: Record<string, any>) {
    const pr      = this.getProjectRoot();
    const dir     = path.join(pr, 'agent-memory');
    const file    = path.join(dir, `${agentName}-memory.json`);
    fs.mkdirSync(dir, { recursive: true });
    const existing = this.readMemory(agentName) || { agent: agentName, sessionCount: 0 };
    const updated  = {
      ...existing,
      ...patch,
      agent:        agentName,
      lastActive:   new Date().toISOString(),
      sessionCount: (existing.sessionCount || 0) + (patch.sessionCount === undefined ? 1 : 0),
    };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf8');
  }

  clearMemory(agentName: string) {
    const pr   = this.getProjectRoot();
    const file = path.join(pr, 'agent-memory', `${agentName}-memory.json`);
    if (fs.existsSync(file)) { fs.unlinkSync(file); }
  }

  getAllMemories(): Record<string, any> {
    const pr  = this.getProjectRoot();
    const dir = path.join(pr, 'agent-memory');
    const out: Record<string, any> = {};
    if (!fs.existsSync(dir)) { return out; }
    fs.readdirSync(dir).forEach(f => {
      if (!f.endsWith('-memory.json')) { return; }
      const agent = f.replace('-memory.json', '');
      try { out[agent] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch {}
    });
    return out;
  }

  private getProjectRoot(): string {
    try {
      const ap  = JSON.parse(fs.readFileSync(path.join(this.kitPath, 'active-project.json'), 'utf8'));
      const rel = ap?.current || '.';
      return rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);
    } catch { return this.kitPath; }
  }
}
