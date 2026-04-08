// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as fs   from 'fs';
import * as path from 'path';

export class FileWatcher {
  private watchers: fs.FSWatcher[] = [];

  constructor(
    private readonly kitPath: string,
    private readonly onChanged: () => void,
  ) {}

  start() {
    const watch = (file: string) => {
      if (!fs.existsSync(file)) { return; }
      const w = fs.watch(file, { persistent: false }, () => this.onChanged());
      this.watchers.push(w);
    };

    // Watch kit-level files
    watch(path.join(this.kitPath, 'active-project.json'));

    // Watch active project files — re-attach when project switches
    this.watchProjectFiles();

    // Re-watch project files every 5s (handles project switches)
    const interval = setInterval(() => this.watchProjectFiles(), 5000);
    this.watchers.push({ close: () => clearInterval(interval) } as any);
  }

  stop() {
    this.watchers.forEach(w => { try { w.close(); } catch {} });
    this.watchers = [];
  }

  private watchProjectFiles() {
    try {
      const ap  = JSON.parse(fs.readFileSync(path.join(this.kitPath, 'active-project.json'), 'utf8'));
      const rel = ap?.current || '.';
      const pr  = rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);

      for (const file of ['agent-status.json', 'group-chat.json', 'requirement.json']) {
        const full = path.join(pr, file);
        if (fs.existsSync(full)) {
          try {
            const w = fs.watch(full, { persistent: false }, () => this.onChanged());
            this.watchers.push(w);
          } catch {}
        }
      }
    } catch {}
  }
}
