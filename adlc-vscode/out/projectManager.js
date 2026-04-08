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
exports.ProjectManager = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ProjectManager {
    constructor(kitPath) {
        this.kitPath = kitPath;
    }
    getProjectRoot() {
        const ap = this.readActiveProject();
        const rel = ap?.current || '.';
        return rel === '.' ? this.kitPath : path.resolve(this.kitPath, rel);
    }
    getActiveProjectName() {
        return this.readActiveProject()?.name || '';
    }
    getActiveProject() {
        return this.readActiveProject() || {};
    }
    getRequirement() {
        return this.readJSON(path.join(this.getProjectRoot(), 'requirement.json')) || {};
    }
    getAgentStatus() {
        const data = this.readJSON(path.join(this.getProjectRoot(), 'agent-status.json')) || {};
        return data.agents || data;
    }
    listProjects() {
        const projectsDir = path.join(this.kitPath, 'projects');
        if (!fs.existsSync(projectsDir)) {
            return [];
        }
        return fs.readdirSync(projectsDir)
            .map(folder => {
            const abs = path.join(projectsDir, folder);
            try {
                if (!fs.statSync(abs).isDirectory()) {
                    return null;
                }
            }
            catch {
                return null;
            }
            const req = this.readJSON(path.join(abs, 'requirement.json'));
            if (!req?.requirementId) {
                return null;
            }
            return { name: req.title || folder, sprint: req.sprint || '01', status: req.status || 'pending', path: 'projects/' + folder };
        })
            .filter((p) => p !== null);
    }
    switchProject(relPath) {
        const abs = path.resolve(this.kitPath, relPath);
        const req = this.readJSON(path.join(abs, 'requirement.json')) || {};
        const ap = {
            current: relPath,
            name: req.title || relPath,
            sprint: req.sprint || '01',
            status: req.status || 'pending_analysis',
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(this.kitPath, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
    }
    createProject(data) {
        try {
            const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
            const folder = slug + '-' + Date.now();
            const projectsBase = path.join(this.kitPath, 'projects');
            const absDir = path.join(projectsBase, folder);
            const relPath = 'projects/' + folder;
            // Ensure projects folder exists
            if (!fs.existsSync(projectsBase)) {
                fs.mkdirSync(projectsBase, { recursive: true });
            }
            fs.mkdirSync(absDir, { recursive: true });
            ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
                fs.mkdirSync(path.join(absDir, d), { recursive: true });
            });
            const req = {
                requirementId: `REQ-${Date.now()}`,
                postedBy: 'Tarun Vangari',
                postedAt: new Date().toISOString(),
                title: data.title,
                description: data.description,
                businessGoal: data.businessGoal || '',
                targetUsers: data.targetUsers || '',
                type: data.type || 'new_project',
                priority: data.priority || 'high',
                sprint: '01',
                status: 'pending_analysis',
                discoveryComplete: false,
                approvedByTarun: false,
                agentInputs: Object.fromEntries(['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'].map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])),
                sprintPlan: '',
            };
            fs.writeFileSync(path.join(absDir, 'requirement.json'), JSON.stringify(req, null, 2), 'utf8');
            fs.writeFileSync(path.join(absDir, 'group-chat.json'), JSON.stringify({ channel: 'team-panchayat-general', messages: [] }, null, 2), 'utf8');
            const status = { sprint: '01', agents: Object.fromEntries(['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'].map(a => [a, { status: 'queue', progress: 0, task: 'Awaiting requirement analysis', blocker: '', updated: new Date().toISOString() }])) };
            fs.writeFileSync(path.join(absDir, 'agent-status.json'), JSON.stringify(status, null, 2), 'utf8');
            this.switchProject(relPath);
            return relPath;
        }
        catch (err) {
            throw new Error(`Project creation failed: ${err.message}`);
        }
    }
    readActiveProject() {
        return this.readJSON(path.join(this.kitPath, 'active-project.json'));
    }
    readJSON(file) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        catch {
            return null;
        }
    }
}
exports.ProjectManager = ProjectManager;
//# sourceMappingURL=projectManager.js.map