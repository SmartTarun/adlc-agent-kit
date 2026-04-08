// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { ProjectManager } from './projectManager';

export class KiranManager {
  constructor(
    private readonly kitPath: string,
    private readonly projectMgr: ProjectManager,
  ) {}

  // ── Public: called by AgentRunner when launchAgent('kiran') fires ──────────

  async autoGenerate(out: vscode.OutputChannel, token: vscode.CancellationToken): Promise<void> {
    const pr = this.projectMgr.getProjectRoot();

    // ── 1. Read Arjun's requirement ───────────────────────────────────────────
    const req = this.readJSON(path.join(pr, 'requirement.json')) || {};
    if (!req.title) {
      out.appendLine('[ERROR] requirement.json not found or has no title — run Arjun first.');
      vscode.window.showErrorMessage('ADLC Kiran: requirement.json is missing. Run Arjun first.');
      return;
    }
    out.appendLine(`[ADLC] Requirement  : ${req.title}`);
    out.appendLine(`[ADLC] Discovery    : ${req.discoveryComplete ? 'complete' : 'INCOMPLETE — Arjun may still be running'}`);

    // ── 2. Read Rasool's DB models ────────────────────────────────────────────
    const modelsDir  = path.join(pr, 'backend', 'app', 'models');
    const modelFiles = this.readDirFiles(modelsDir, '.py');
    if (modelFiles.length === 0) {
      out.appendLine('[WARN] No SQLAlchemy models found in backend/app/models/ — Rasool may not have run yet.');
      out.appendLine('[ADLC] Kiran will infer models from requirement.json and generate stubs.');
    } else {
      out.appendLine(`[ADLC] DB models    : ${modelFiles.map(f => path.basename(f)).join(', ')}`);
    }

    // ── 3. Read Kavya's component spec ────────────────────────────────────────
    const componentSpec = this.readFile(path.join(pr, 'docs', 'component-spec.md'));
    if (!componentSpec) {
      out.appendLine('[WARN] docs/component-spec.md not found — Kavya may not have run yet.');
      out.appendLine('[ADLC] Kiran will infer UI data needs from requirement.json.');
    } else {
      out.appendLine('[ADLC] Component spec: found — extracting API surface from UI components');
    }

    // ── 4. Read Rasool's Snowflake DDL if present ─────────────────────────────
    const sfSchema = this.readFile(path.join(pr, 'backend', 'db', 'snowflake', 'schema.sql'));

    out.appendLine('─'.repeat(60));

    // ── 5. Infer what the API needs to expose ────────────────────────────────
    const apiNeeds = this.inferApiNeeds(req, modelFiles, componentSpec);
    out.appendLine(`[ADLC] Routers to generate : ${apiNeeds.routers.join(', ')}`);
    out.appendLine(`[ADLC] Auth required       : ${apiNeeds.needsAuth}`);
    out.appendLine(`[ADLC] Pagination required : ${apiNeeds.needsPagination}`);
    out.appendLine(`[ADLC] Websocket required  : ${apiNeeds.needsWebsocket}`);

    // ── 6. Pick Copilot model ─────────────────────────────────────────────────
    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });

    if (!model) {
      out.appendLine('[ERROR] GitHub Copilot model not available.');
      vscode.window.showErrorMessage('ADLC Kiran: GitHub Copilot model not found.');
      return;
    }

    // ── 7. Build coordinated prompt and generate ──────────────────────────────
    const prompt = this.buildPrompt(req, modelFiles, componentSpec, sfSchema, apiNeeds);
    out.appendLine('\n[ADLC] Generating FastAPI routers + schemas via Copilot…\n');
    out.appendLine('─'.repeat(60));

    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)], {}, token,
    );

    let text = '';
    for await (const chunk of response.text) {
      text += chunk;
      out.append(chunk);
    }

    out.appendLine('\n' + '─'.repeat(60));
    this.writeAgentFiles(pr, text, out);
    out.appendLine('[ADLC] Kiran completed FastAPI generation.');
  }

  // ── API needs inference ───────────────────────────────────────────────────

  private inferApiNeeds(req: any, modelFiles: string[], componentSpec: string | null): {
    routers: string[];
    needsAuth: boolean;
    needsPagination: boolean;
    needsWebsocket: boolean;
    needsBackgroundTasks: boolean;
    dbConfig: any;
  } {
    const combined = `${req.title || ''} ${req.description || ''} ${req.businessGoal || ''}`.toLowerCase();
    const spec     = (componentSpec || '').toLowerCase();

    const routers: string[] = ['health'];

    // Infer routers from model files (each model → a router)
    for (const f of modelFiles) {
      const base = path.basename(f, '.py');
      if (base !== 'base' && base !== '__init__') {
        routers.push(base.replace(/_/g, '-'));   // cost_anomalies → cost-anomalies
      }
    }

    // Fallback: infer from requirement text
    if (routers.length === 1) {
      if (/anomal|cost|alert/.test(combined))         routers.push('anomalies', 'alerts');
      if (/user|auth|login|signup/.test(combined))    routers.push('users', 'auth');
      if (/report|dashboard|metric/.test(combined))   routers.push('reports', 'metrics');
      if (/property|lease|real.?estate/.test(combined)) routers.push('properties', 'leases');
      if (/product|catalog|inventory/.test(combined)) routers.push('products', 'inventory');
      if (/order|transaction/.test(combined))         routers.push('orders');
      if (/notification|alert/.test(combined))        routers.push('notifications');
      if (/budget|spend|billing/.test(combined))      routers.push('budgets');
      if (/resource|infra|cloud/.test(combined))      routers.push('cloud-resources');
    }

    // Infer extra needs from spec + requirement
    const needsAuth        = /auth|login|jwt|oauth|role|permission/.test(combined + spec);
    const needsPagination  = /list|table|grid|paginate|search|filter/.test(combined + spec);
    const needsWebsocket   = /real.?time|live|stream|websocket|ws/.test(combined + spec);
    const needsBackgroundTasks = /async|job|task|batch|schedule/.test(combined + spec);

    return {
      routers: [...new Set(routers)],
      needsAuth,
      needsPagination,
      needsWebsocket,
      needsBackgroundTasks,
      dbConfig: req.dbConfig || { primary: 'postgresql' },
    };
  }

  // ── Prompt builder ────────────────────────────────────────────────────────

  private buildPrompt(
    req: any,
    modelFiles: string[],
    componentSpec: string | null,
    sfSchema: string | null,
    needs: ReturnType<KiranManager['inferApiNeeds']>,
  ): string {
    const today = new Date().toISOString().split('T')[0];

    // Collect model source code to include in prompt
    const modelsSrc = modelFiles.map(f => {
      const content = this.readFile(f) || '';
      return `### ${path.basename(f)}\n\`\`\`python\n${content}\n\`\`\``;
    }).join('\n\n');

    const sfSection = sfSchema
      ? `\n### Snowflake Schema (read-only analytics, use Snowflake connector — keypair auth)\n\`\`\`sql\n${sfSchema}\n\`\`\``
      : '';

    const componentSection = componentSpec
      ? `\n### Kavya Component Spec (UI data requirements)\n${componentSpec}`
      : '\n### UI Requirements (component spec not yet generated)\n(Infer from requirement description)';

    return `You are Kiran, the Backend Engineer for the ADLC system. Generate production-ready FastAPI code.

You MUST coordinate with three sources before writing any code:
1. Arjun's requirement (what the system does)
2. Rasool's SQLAlchemy models (exact DB schema — do NOT change column names or types)
3. Kavya's component spec (what data the UI needs — shape your response bodies accordingly)

═══════════════════════════════════════════════════════════
ARJUN — REQUIREMENT (source of truth)
═══════════════════════════════════════════════════════════
Title       : ${req.title || 'Untitled'}
Description : ${req.description || ''}
Business Goal: ${req.businessGoal || ''}
Target Users: ${req.targetUsers || ''}
DB Config   : ${JSON.stringify(needs.dbConfig, null, 2)}
Discovery   : ${req.discoveryComplete ? 'COMPLETE' : 'in-progress'}
Approved    : ${req.approvedByTarun || false}

═══════════════════════════════════════════════════════════
RASOOL — DB MODELS (match these exactly — no drift)
═══════════════════════════════════════════════════════════
${modelsSrc || '(No models yet — generate stubs that match requirement entities)'}
${sfSection}

═══════════════════════════════════════════════════════════
KAVYA — UI COMPONENT SPEC (shape API responses to match UI needs)
═══════════════════════════════════════════════════════════
${componentSection}

═══════════════════════════════════════════════════════════
API SURFACE TO GENERATE
═══════════════════════════════════════════════════════════
Routers      : ${needs.routers.join(', ')}
Auth         : ${needs.needsAuth ? 'JWT Bearer — add OAuth2PasswordBearer + get_current_user dep' : 'none required'}
Pagination   : ${needs.needsPagination ? 'yes — use page/size query params, return PaginatedResponse[T]' : 'no'}
WebSocket    : ${needs.needsWebsocket ? 'yes — add /ws/{resource} endpoint for real-time updates' : 'no'}
Background   : ${needs.needsBackgroundTasks ? 'yes — use FastAPI BackgroundTasks for async jobs' : 'no'}

REQUIREMENTS:
- Python 3.11+, FastAPI with Pydantic v2, SQLAlchemy 2.x async sessions
- Every endpoint MUST have: summary, description, response_model, status codes in OpenAPI docstring
- Use the EXACT same field names as Rasool's models — never rename or add columns
- Response schemas must include ALL fields that Kavya's components display
- If Kavya shows a chart — include aggregated fields (e.g. total_cost, anomaly_count, trend_pct)
- All files: # Agent: kiran | Sprint: 01 | Date: ${today}
- No TODO comments, no debug print statements
- Tests: pytest with TestClient, minimum 80% coverage per endpoint

FOLDER OWNERSHIP (write ONLY to these paths):
- backend/app/routers/         ← FastAPI router files
- backend/app/schemas/         ← Pydantic v2 schemas
- backend/app/dependencies/    ← reusable FastAPI dependencies (db session, auth)
- backend/app/main.py          ← app factory, register routers
- backend/tests/               ← pytest test files

OUTPUT FORMAT — each file as:
\`\`\`python
// FILE: backend/app/routers/<name>.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/schemas/<name>.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/dependencies/database.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/main.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/tests/test_<name>.py
<content>
\`\`\`

Generate ALL routers listed above. For each router: Create, Read (single + list), Update, Delete endpoints.
Pagination, auth, and WebSocket endpoints only if flagged above.
Match Kavya's component data shapes exactly.`;
  }

  // ── File writer ───────────────────────────────────────────────────────────

  private writeAgentFiles(pr: string, response: string, out: vscode.OutputChannel): void {
    const fileBlockRe = /```(?:[\w./\-]+)?\s*\n\/\/ FILE: ([^\n]+)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    const written: string[] = [];

    while ((match = fileBlockRe.exec(response)) !== null) {
      const relPath = match[1].trim();
      const content = match[2];
      const absPath = relPath.startsWith('/') ? relPath : path.join(pr, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, 'utf8');
      written.push(relPath);
      out.appendLine(`[FILE WRITTEN] ${relPath}`);
    }

    if (written.length > 0) {
      vscode.window.showInformationMessage(`ADLC Kiran: wrote ${written.length} file(s)`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private readDirFiles(dir: string, ext: string): string[] {
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith(ext))
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }

  private readFile(filePath: string): string | null {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  }

  private readJSON(file: string): any {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
}
