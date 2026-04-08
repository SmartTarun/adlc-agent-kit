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
exports.FileWatcher = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FileWatcher {
    constructor(kitPath, onChanged) {
        this.kitPath = kitPath;
        this.onChanged = onChanged;
        this.watchers = [];
    }
    start() {
        const watch = (file) => {
            if (!fs.existsSync(file)) {
                return;
            }
            const w = fs.watch(file, { persistent: false }, () => this.onChanged());
            this.watchers.push(w);
        };
        // Watch kit-level files
        watch(path.join(this.kitPath, 'active-project.json'));
        // Watch active project files — re-attach when project switches
        this.watchProjectFiles();
        // Re-watch project files every 5s (handles project switches)
        const interval = setInterval(() => this.watchProjectFiles(), 5000);
        this.watchers.push({ close: () => clearInterval(interval) });
    }
    stop() {
        this.watchers.forEach(w => { try {
            w.close();
        }
        catch { } });
        this.watchers = [];
    }
    watchProjectFiles() {
        try {
            const ap = JSON.parse(fs.readFileSync(path.join(this.kitPath, 'active-project.json'), 'utf8'));
            const rel = ap?.current || '.';
            const pr = rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);
            for (const file of ['agent-status.json', 'group-chat.json', 'requirement.json']) {
                const full = path.join(pr, file);
                if (fs.existsSync(full)) {
                    try {
                        const w = fs.watch(full, { persistent: false }, () => this.onChanged());
                        this.watchers.push(w);
                    }
                    catch { }
                }
            }
        }
        catch { }
    }
}
exports.FileWatcher = FileWatcher;
//# sourceMappingURL=fileWatcher.js.map