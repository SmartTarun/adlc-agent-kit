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
exports.MemoryManager = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class MemoryManager {
    constructor(kitPath) {
        this.kitPath = kitPath;
    }
    readMemory(agentName) {
        const pr = this.getProjectRoot();
        const file = path.join(pr, 'agent-memory', `${agentName}-memory.json`);
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        catch {
            return null;
        }
    }
    updateMemory(agentName, patch) {
        const pr = this.getProjectRoot();
        const dir = path.join(pr, 'agent-memory');
        const file = path.join(dir, `${agentName}-memory.json`);
        fs.mkdirSync(dir, { recursive: true });
        const existing = this.readMemory(agentName) || { agent: agentName, sessionCount: 0 };
        const updated = {
            ...existing,
            ...patch,
            agent: agentName,
            lastActive: new Date().toISOString(),
            sessionCount: (existing.sessionCount || 0) + (patch.sessionCount === undefined ? 1 : 0),
        };
        fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf8');
    }
    clearMemory(agentName) {
        const pr = this.getProjectRoot();
        const file = path.join(pr, 'agent-memory', `${agentName}-memory.json`);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
    getAllMemories() {
        const pr = this.getProjectRoot();
        const dir = path.join(pr, 'agent-memory');
        const out = {};
        if (!fs.existsSync(dir)) {
            return out;
        }
        fs.readdirSync(dir).forEach(f => {
            if (!f.endsWith('-memory.json')) {
                return;
            }
            const agent = f.replace('-memory.json', '');
            try {
                out[agent] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            }
            catch { }
        });
        return out;
    }
    getProjectRoot() {
        try {
            const ap = JSON.parse(fs.readFileSync(path.join(this.kitPath, 'active-project.json'), 'utf8'));
            const rel = ap?.current || '.';
            return rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);
        }
        catch {
            return this.kitPath;
        }
    }
}
exports.MemoryManager = MemoryManager;
//# sourceMappingURL=memoryManager.js.map