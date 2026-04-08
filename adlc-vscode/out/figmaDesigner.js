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
exports.FigmaDesigner = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
// Kavya UX agent — creates designs in Figma and asks Tarun for feedback via VS Code chat
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const UX_QUESTIONS = [
    { key: 'visualStyle', q: 'What visual style? (minimal, bold, corporate, playful)' },
    { key: 'colourMode', q: 'Dark mode first, light mode, or both?' },
    { key: 'primaryColour', q: 'Primary brand colour? (e.g. #7c3aed or "deep purple")' },
    { key: 'keyScreens', q: 'List the 3 most important screens to design first.' },
    { key: 'dataDisplay', q: 'How should data be shown — tables, cards, charts, or mixed?' },
    { key: 'userFlow', q: 'What is the first thing a user does when they open the app?' },
];
class FigmaDesigner {
    constructor(kitPath, projectMgr) {
        this.kitPath = kitPath;
        this.projectMgr = projectMgr;
        this.answers = {};
        this.figmaToken = vscode.workspace.getConfiguration('adlc').get('figmaToken') || '';
    }
    // ── Main entry — called from chatParticipant /ux or agentRunner kavya ────
    async runUXFlow(stream, token) {
        const req = this.projectMgr.getRequirement();
        stream.markdown(`## 🎨 Kavya — UX Design Review\n\n`);
        stream.markdown(`**Project:** ${req.title || 'Untitled'}\n\n`);
        stream.markdown(`I'll create the UI designs in Figma and share them here for your review.\n\n`);
        stream.markdown(`First, let me ask you **${UX_QUESTIONS.length} quick questions** to shape the design:\n\n`);
        // Post questions to group chat so the web dashboard also shows them
        const pr = this.projectMgr.getProjectRoot();
        this.postToGroupChat(pr, 'KAVYA', 'UX Designer', 'discovery', this.formatQuestionsMessage(req), ['discovery', 'tarun', 'kavya']);
        // Display questions in the VS Code chat stream
        UX_QUESTIONS.forEach((q, i) => {
            stream.markdown(`**Q${i + 1}.** ${q.q}\n\n`);
        });
        stream.markdown(`---\n\n`);
        stream.markdown(`💬 *Reply in this chat with your answers (one per line or numbered). I'll create the Figma designs immediately after.*\n\n`);
        stream.markdown(`Or type \`@adlc /ux-design skip\` to let me decide based on the project brief.\n`);
    }
    // ── Called when Tarun answers Kavya's UX questions ───────────────────────
    async applyAnswersAndDesign(answers, stream, token) {
        const req = this.projectMgr.getRequirement();
        const pr = this.projectMgr.getProjectRoot();
        // Parse answers
        this.parseAnswers(answers);
        // Save answers to requirement.json
        const reqFile = path.join(pr, 'requirement.json');
        const data = this.readJSON(reqFile) || {};
        data.uxAnswers = this.answers;
        if (!data.teamDiscovery) {
            data.teamDiscovery = {};
        }
        data.teamDiscovery.kavya = { answers: this.answers, answeredAt: new Date().toISOString() };
        fs.writeFileSync(reqFile, JSON.stringify(data, null, 2), 'utf8');
        stream.markdown(`✅ **Answers saved.** Creating your Figma designs now…\n\n`);
        // Create Figma design
        await this.createFigmaDesigns(req, stream, token);
    }
    // ── Create Figma file via Figma REST API ──────────────────────────────────
    async createFigmaDesigns(req, stream, token) {
        const pr = this.projectMgr.getProjectRoot();
        // Build design spec from answers + project brief
        const spec = this.buildDesignSpec(req);
        stream.markdown(`### Figma Design Spec\n\n`);
        stream.markdown('```\n' + JSON.stringify(spec, null, 2) + '\n```\n\n');
        if (!this.figmaToken) {
            stream.markdown(`⚠️ **No Figma token configured.**\n\n`);
            stream.markdown(`Add your token: **Settings → adlc.figmaToken**\n\n`);
            stream.markdown(`Get one at: https://www.figma.com/developers/api#access-tokens\n\n`);
            stream.markdown(`Once added, the design will be created automatically in Figma.\n\n`);
            // Still write the design spec to the project folder
            this.writeDesignSpec(pr, spec);
            stream.markdown(`📄 Design spec saved to: \`docs/ux-spec.json\`\n\n`);
            this.askForFeedback(stream, null, spec);
            return;
        }
        try {
            // Create Figma file via REST API
            const figmaUrl = await this.createFigmaFile(req.title, spec);
            stream.markdown(`✅ **Figma file created!**\n\n`);
            stream.markdown(`🔗 [Open in Figma](${figmaUrl})\n\n`);
            // Save link to project
            const reqFile = path.join(pr, 'requirement.json');
            const data = this.readJSON(reqFile) || {};
            data.figmaUrl = figmaUrl;
            fs.writeFileSync(reqFile, JSON.stringify(data, null, 2), 'utf8');
            // Post to group chat
            this.postToGroupChat(pr, 'KAVYA', 'UX Designer', 'ux-design', `🎨 Figma designs ready! View here: ${figmaUrl}\n\nPlease review and share your feedback.`, ['tarun', 'kavya']);
            this.askForFeedback(stream, figmaUrl, spec);
        }
        catch (err) {
            stream.markdown(`❌ Figma API error: ${err.message}\n\n`);
            stream.markdown(`Writing design spec locally instead…\n\n`);
            this.writeDesignSpec(pr, spec);
            this.askForFeedback(stream, null, spec);
        }
    }
    async createFigmaFile(projectTitle, spec) {
        // Figma REST API — create a new file via drafts
        const { default: https } = await Promise.resolve().then(() => __importStar(require('https')));
        const body = JSON.stringify({
            name: `ADLC — ${projectTitle} — UX Design`,
            document: {
                children: spec.screens.map((screen, i) => ({
                    id: `page:${i}`,
                    name: screen.name,
                    type: 'CANVAS',
                    children: [],
                })),
            },
        });
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.figma.com',
                path: '/v1/files',
                method: 'POST',
                headers: {
                    'X-Figma-Token': this.figmaToken,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            }, res => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.key) {
                            resolve(`https://www.figma.com/file/${json.key}`);
                        }
                        else {
                            reject(new Error(json.message || 'Unknown Figma API error'));
                        }
                    }
                    catch {
                        reject(new Error('Failed to parse Figma response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    // ── Ask Tarun for feedback after design is shown ─────────────────────────
    askForFeedback(stream, figmaUrl, spec) {
        stream.markdown(`---\n\n### 📋 Design Overview\n\n`);
        stream.markdown(`**Visual Style:** ${this.answers.visualStyle || spec.visualStyle}\n\n`);
        stream.markdown(`**Colour Mode:** ${this.answers.colourMode || spec.colourMode}\n\n`);
        stream.markdown(`**Primary Colour:** ${this.answers.primaryColour || spec.primaryColour}\n\n`);
        stream.markdown(`**Screens planned:**\n\n`);
        spec.screens.forEach((s) => stream.markdown(`- **${s.name}** — ${s.description}\n`));
        stream.markdown(`\n---\n\n`);
        stream.markdown(`💬 **Your feedback options:**\n\n`);
        stream.markdown(`- \`@adlc /ux-feedback approve\` — approve designs, Kavya writes tokens.css\n`);
        stream.markdown(`- \`@adlc /ux-feedback change the primary colour to blue\` — request changes\n`);
        stream.markdown(`- \`@adlc /ux-feedback add a settings screen\` — add screens\n\n`);
        if (figmaUrl) {
            stream.markdown(`🔗 [Review in Figma](${figmaUrl})\n`);
        }
    }
    // ── Apply feedback changes ────────────────────────────────────────────────
    async applyFeedback(feedback, stream, token) {
        const pr = this.projectMgr.getProjectRoot();
        const req = this.projectMgr.getRequirement();
        if (feedback.toLowerCase().includes('approve')) {
            stream.markdown(`✅ **UX Designs approved!** Kavya is now writing \`tokens.css\` and \`component-spec.md\`…\n\n`);
            await this.writeDesignTokens(pr, req, stream, token);
            return;
        }
        // Use Copilot to interpret the feedback and update the spec
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            stream.markdown('⚠️ Copilot not available.');
            return;
        }
        stream.markdown(`🔄 **Applying your feedback via GitHub Copilot…**\n\n`);
        const specFile = path.join(pr, 'docs', 'ux-spec.json');
        const spec = this.readJSON(specFile) || {};
        const messages = [
            vscode.LanguageModelChatMessage.User(`You are Kavya, UX Designer for Team Panchayat.\n` +
                `Current design spec:\n${JSON.stringify(spec, null, 2)}\n\n` +
                `Tarun's feedback: "${feedback}"\n\n` +
                `Update the design spec JSON to reflect the feedback. ` +
                `Reply ONLY with the updated JSON object, no markdown fences.`),
        ];
        try {
            let updatedSpec = '';
            const response = await model.sendRequest(messages, {}, token);
            for await (const chunk of response.text) {
                updatedSpec += chunk;
                stream.markdown(chunk);
            }
            const parsed = JSON.parse(updatedSpec.trim());
            fs.mkdirSync(path.dirname(specFile), { recursive: true });
            fs.writeFileSync(specFile, JSON.stringify(parsed, null, 2), 'utf8');
            stream.markdown(`\n\n✅ Spec updated. [Re-open Figma](${req.figmaUrl || '#'}) to see changes.\n\n`);
            this.askForFeedback(stream, req.figmaUrl || null, parsed);
        }
        catch {
            stream.markdown(`\n\n⚠️ Could not parse updated spec. Please try again with simpler feedback.\n`);
        }
    }
    // ── Write design tokens once approved ────────────────────────────────────
    async writeDesignTokens(pr, req, stream, token) {
        const spec = this.readJSON(path.join(pr, 'docs', 'ux-spec.json')) || this.buildDesignSpec(req);
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            stream.markdown('⚠️ Copilot not available.');
            return;
        }
        const messages = [
            vscode.LanguageModelChatMessage.User(`You are Kavya, UX Designer. Based on this design spec, write a complete tokens.css file.\n` +
                `Spec: ${JSON.stringify(spec)}\n\n` +
                `Requirements:\n` +
                `- CSS custom properties only (--color-primary, --color-bg, --font-family, --radius, --spacing-* etc)\n` +
                `- ${spec.colourMode === 'dark' ? 'Dark mode first, with :root{} for dark and @media(prefers-color-scheme:light){} for light' : 'Light mode first'}\n` +
                `- No hardcoded colours in components — tokens only\n` +
                `- Primary colour: ${spec.primaryColour}\n\n` +
                `Reply with ONLY the CSS content, no explanation.`),
        ];
        let tokensCSS = '';
        const response = await model.sendRequest(messages, {}, token);
        for await (const chunk of response.text) {
            tokensCSS += chunk;
            stream.markdown(chunk);
        }
        const tokensPath = path.join(pr, 'frontend', 'src', 'tokens', 'tokens.css');
        fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
        fs.writeFileSync(tokensPath, tokensCSS, 'utf8');
        const compSpecPath = path.join(pr, 'docs', 'component-spec.md');
        fs.writeFileSync(compSpecPath, this.buildComponentSpec(spec), 'utf8');
        // Update agent status
        const statusFile = path.join(pr, 'agent-status.json');
        const status = this.readJSON(statusFile) || { agents: {} };
        (status.agents || status).kavya = { status: 'done', progress: 100, task: 'tokens.css + component-spec written', blocker: '', updated: new Date().toISOString() };
        fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), 'utf8');
        this.postToGroupChat(pr, 'KAVYA', 'UX Designer', 'message', `✅ UX design tokens written to frontend/src/tokens/tokens.css. Component spec in docs/component-spec.md. Rohan can now build components.`, ['rohan', 'arjun']);
        stream.markdown(`\n\n✅ **Design tokens written!**\n`);
        stream.markdown(`- \`frontend/src/tokens/tokens.css\`\n`);
        stream.markdown(`- \`docs/component-spec.md\`\n\n`);
        stream.markdown(`Rohan can now start building React components. 🎉\n`);
    }
    // ── Design spec builder ───────────────────────────────────────────────────
    buildDesignSpec(req) {
        const a = this.answers;
        return {
            projectTitle: req.title || 'Untitled',
            visualStyle: a.visualStyle || 'minimal',
            colourMode: a.colourMode || 'dark',
            primaryColour: a.primaryColour || '#7c3aed',
            dataDisplay: a.dataDisplay || 'mixed',
            userFlow: a.userFlow || 'Dashboard overview',
            screens: this.inferScreens(req, a),
            typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'JetBrains Mono' },
            spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32, 48, 64] },
        };
    }
    inferScreens(req, a) {
        const named = (a.keyScreens || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        const screens = named.length > 0
            ? named.map(name => ({ name, description: `Primary screen: ${name}` }))
            : this.defaultScreens(req);
        return screens;
    }
    defaultScreens(req) {
        const title = (req.title || '').toLowerCase();
        if (title.includes('lease') || title.includes('real estate') || title.includes('cre') || title.includes('portfolio')) {
            return [
                { name: 'Dashboard', description: 'Portfolio overview — NOI, Cap Rate, occupancy KPIs' },
                { name: 'Property List', description: 'Filterable table of all properties' },
                { name: 'Property Detail', description: 'Individual property financials and lease roll' },
                { name: 'Reports', description: 'PDF memo and Excel pro-forma export' },
                { name: 'Settings', description: 'User preferences and data source config' },
            ];
        }
        return [
            { name: 'Dashboard', description: 'Main overview screen' },
            { name: 'List View', description: 'Data table with filters' },
            { name: 'Detail', description: 'Individual record view' },
            { name: 'Settings', description: 'Configuration screen' },
        ];
    }
    buildComponentSpec(spec) {
        return [
            `# Component Spec — ${spec.projectTitle}`,
            `Generated by Kavya (UX Designer) — ADLC Agent Kit`,
            ``,
            `## Design Tokens`,
            `All components MUST use CSS variables from \`tokens.css\`. No hardcoded colours.`,
            ``,
            `## Screens`,
            ...spec.screens.map((s) => `### ${s.name}\n${s.description}\n`),
            `## Colour Mode`,
            spec.colourMode === 'dark' ? 'Dark mode first. Light mode via media query.' : 'Light mode first.',
            ``,
            `## Typography`,
            `- Heading: ${spec.typography?.headingFont || 'Inter'}`,
            `- Body:    ${spec.typography?.bodyFont || 'Inter'}`,
            `- Mono:    ${spec.typography?.monoFont || 'JetBrains Mono'}`,
            ``,
            `## Data Display`,
            spec.dataDisplay,
        ].join('\n');
    }
    formatQuestionsMessage(req) {
        return [
            `🎨 Hi Tarun! I'm Kavya, your UX Designer. I've picked up the project: **${req.title}**.`,
            ``,
            `Before I start designing in Figma, I have ${UX_QUESTIONS.length} quick questions:`,
            ``,
            ...UX_QUESTIONS.map((q, i) => `**Q${i + 1}.** ${q.q}`),
            ``,
            `Reply in the VS Code chat with \`@adlc\` to answer.`,
        ].join('\n');
    }
    parseAnswers(raw) {
        const lines = raw.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
        UX_QUESTIONS.forEach((q, i) => {
            if (lines[i]) {
                this.answers[q.key] = lines[i];
            }
        });
    }
    writeDesignSpec(pr, spec) {
        const file = path.join(pr, 'docs', 'ux-spec.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(spec, null, 2), 'utf8');
    }
    postToGroupChat(pr, from, role, type, message, tags) {
        const file = path.join(pr, 'group-chat.json');
        const chat = this.readJSON(file) || { channel: 'team-panchayat-general', messages: [] };
        chat.messages.push({ id: `msg-${Date.now()}`, from, role, type, message, tags, timestamp: new Date().toISOString() });
        fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8');
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
exports.FigmaDesigner = FigmaDesigner;
//# sourceMappingURL=figmaDesigner.js.map