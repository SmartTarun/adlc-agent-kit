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
exports.RasoolManager = void 0;
// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ── Snowflake keypair credential keys in SecretStorage ───────────────────────
const SECRET_SF_ACCOUNT = 'adlc.snowflake.account';
const SECRET_SF_USER = 'adlc.snowflake.user';
const SECRET_SF_ROLE = 'adlc.snowflake.role';
const SECRET_SF_WAREHOUSE = 'adlc.snowflake.warehouse';
const SECRET_SF_DATABASE = 'adlc.snowflake.database';
const SECRET_SF_SCHEMA = 'adlc.snowflake.schema';
const SECRET_SF_PRIVKEY = 'adlc.snowflake.privateKey'; // PEM content (not path)
const SECRET_SF_PASSPHRASE = 'adlc.snowflake.passphrase'; // optional passphrase
class RasoolManager {
    constructor(kitPath, projectMgr) {
        this.kitPath = kitPath;
        this.projectMgr = projectMgr;
        this.sfConfig = null;
    }
    // ── Public: called by AgentRunner when launchAgent('rasool') fires ─────────
    async autoGenerate(out, token) {
        const pr = this.projectMgr.getProjectRoot();
        const req = this.readJSON(path.join(pr, 'requirement.json')) || {};
        const db = req.dbConfig || { primary: 'postgresql', analytics: 'none', existing: false, provisionNew: true };
        out.appendLine('[ADLC] Rasool: reading requirement.json and dbConfig…');
        out.appendLine(`[ADLC] Primary DB  : ${db.primary}`);
        out.appendLine(`[ADLC] Analytics   : ${db.analytics}`);
        out.appendLine(`[ADLC] Existing    : ${db.existing}`);
        out.appendLine('─'.repeat(60));
        const needs = this.inferSchemaNeeds(req, db);
        out.appendLine(`[ADLC] Entities detected: ${needs.entities.join(', ')}`);
        out.appendLine(`[ADLC] Dialect: ${needs.dialect}`);
        // ── Pick which Copilot model to use ──────────────────────────────────────
        const modelId = vscode.workspace.getConfiguration('adlc').get('copilotModel') || 'gpt-4o';
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
        if (!model) {
            out.appendLine('[ERROR] GitHub Copilot model not available — is Copilot installed and signed in?');
            vscode.window.showErrorMessage('ADLC Rasool: GitHub Copilot model not found.');
            return;
        }
        // ── Generate PostgreSQL (Alembic) ─────────────────────────────────────────
        if (needs.dialect === 'postgresql' || needs.dialect === 'both') {
            out.appendLine('\n[ADLC] Generating PostgreSQL Alembic migrations…');
            await this.generatePostgres(model, out, token, pr, req, db, needs);
        }
        // ── Generate Snowflake DDL (keypair auth) ─────────────────────────────────
        if (needs.dialect === 'snowflake' || needs.dialect === 'both') {
            out.appendLine('\n[ADLC] Generating Snowflake DDL (keypair auth)…');
            await this.generateSnowflake(model, out, token, pr, req, db, needs);
        }
        out.appendLine('\n' + '─'.repeat(60));
        out.appendLine('[ADLC] Rasool completed DB schema generation.');
    }
    // ── PostgreSQL: Alembic migrations + SQLAlchemy models ────────────────────
    async generatePostgres(model, out, token, pr, req, db, needs) {
        const prompt = this.buildPostgresPrompt(req, db, needs);
        const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
        let text = '';
        for await (const chunk of response.text) {
            text += chunk;
            out.append(chunk);
        }
        out.appendLine('');
        this.writeAgentFiles(pr, text, out);
    }
    // ── Snowflake: DDL only, keypair conn string in outputs ───────────────────
    async generateSnowflake(model, out, token, pr, req, db, needs) {
        const sfHint = this.sfConfig
            ? `Snowflake account: ${this.sfConfig.account}, user: ${this.sfConfig.user}, ` +
                `role: ${this.sfConfig.role}, warehouse: ${this.sfConfig.warehouse}, ` +
                `database: ${this.sfConfig.database}, schema: ${this.sfConfig.schema}. ` +
                `Authentication: keypair (JWT) — do NOT generate any username/password auth.`
            : `No Snowflake connection configured yet. Generate DDL + a keypair connection snippet placeholder.`;
        const prompt = this.buildSnowflakePrompt(req, db, needs, sfHint);
        const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
        let text = '';
        for await (const chunk of response.text) {
            text += chunk;
            out.append(chunk);
        }
        out.appendLine('');
        this.writeAgentFiles(pr, text, out);
    }
    // ── Schema inference ───────────────────────────────────────────────────────
    inferSchemaNeeds(req, db) {
        const combined = `${req.title || ''} ${req.description || ''} ${req.businessGoal || ''}`.toLowerCase();
        const entities = [];
        // Generic entities always present
        entities.push('users');
        // Domain-specific entity hints
        if (/anomal|cost|spend|budget|billing|invoice/.test(combined))
            entities.push('cost_anomalies', 'cost_alerts', 'budgets');
        if (/tenant|multi.?tenant|organization|org/.test(combined))
            entities.push('organizations', 'tenants');
        if (/project/.test(combined))
            entities.push('projects');
        if (/report|analytics|dashboard|metric/.test(combined))
            entities.push('reports', 'metrics');
        if (/asset|resource|infra/.test(combined))
            entities.push('cloud_resources');
        if (/lease|property|real.?estate|building/.test(combined))
            entities.push('properties', 'leases', 'tenants_re');
        if (/product|catalog|sku|inventory/.test(combined))
            entities.push('products', 'inventory');
        if (/order|cart|purchase|transaction/.test(combined))
            entities.push('orders', 'order_items', 'transactions');
        if (/audit|log|event|activity/.test(combined))
            entities.push('audit_logs');
        if (/notification|alert|email/.test(combined))
            entities.push('notifications');
        if (/tag|label|category|classif/.test(combined))
            entities.push('tags', 'categories');
        const primary = (db.primary || 'postgresql').toLowerCase();
        const analytics = (db.analytics || 'none').toLowerCase();
        let dialect;
        if (primary === 'snowflake' && analytics === 'none') {
            dialect = 'snowflake';
        }
        else if (primary !== 'snowflake' && analytics === 'snowflake') {
            dialect = 'both';
        }
        else if (primary === 'snowflake') {
            dialect = 'snowflake';
        }
        else {
            dialect = 'postgresql';
        }
        return {
            dialect,
            entities: [...new Set(entities)],
            needsAudit: /audit|log|complian|trail/.test(combined),
            needsMultiTenant: /multi.?tenant|organization|org/.test(combined),
            needsTimeSeries: /time.?series|partition|historical|trend/.test(combined) || analytics === 'snowflake',
            region: req.techConstraints?.region || 'us-east-1',
        };
    }
    // ── Prompt builders ───────────────────────────────────────────────────────
    buildPostgresPrompt(req, db, needs) {
        return `You are Rasool, the Database Agent for the ADLC system. Generate PostgreSQL Alembic migrations and SQLAlchemy models.

PROJECT: ${req.title || 'Untitled'}
DESCRIPTION: ${req.description || ''}
BUSINESS GOAL: ${req.businessGoal || ''}
DB CONFIG: ${JSON.stringify(db, null, 2)}

ENTITIES TO MODEL: ${needs.entities.join(', ')}
AUDIT COLUMNS NEEDED: ${needs.needsAudit}
MULTI-TENANT: ${needs.needsMultiTenant}

REQUIREMENTS:
- Python 3.11+, SQLAlchemy 2.x, Alembic
- Pydantic v2 schemas for every model
- All tables: id (UUID PK), created_at, updated_at
- Soft deletes via deleted_at (nullable) on main entity tables
- All files must start with: # Agent: rasool | Sprint: 01 | Date: ${new Date().toISOString().split('T')[0]}
- No TODO comments, no debug print statements

OUTPUT FORMAT — write each file as:
\`\`\`python
// FILE: backend/migrations/versions/001_initial_schema.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/models/base.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/models/<entity>.py
<content>
\`\`\`

\`\`\`python
// FILE: backend/app/schemas/<entity>.py
<content>
\`\`\`

\`\`\`python
// FILE: docs/db-schema.md
<content>
\`\`\`

Generate all entity models and schemas. Use proper foreign keys and indexes.`;
    }
    buildSnowflakePrompt(req, db, needs, sfHint) {
        return `You are Rasool, the Database Agent for the ADLC system. Generate Snowflake DDL and Python connector code using KEYPAIR authentication only.

PROJECT: ${req.title || 'Untitled'}
DESCRIPTION: ${req.description || ''}
BUSINESS GOAL: ${req.businessGoal || ''}
DB CONFIG: ${JSON.stringify(db, null, 2)}
SNOWFLAKE CONFIG: ${sfHint}

ENTITIES TO MODEL: ${needs.entities.join(', ')}
TIME-SERIES/ANALYTICS: ${needs.needsTimeSeries}

CRITICAL REQUIREMENTS — SNOWFLAKE KEYPAIR AUTH:
- Authentication method: JWT keypair ONLY — never generate username/password auth
- Python connector must use: authenticator="snowflake_jwt", private_key=<loaded from PEM>
- PEM private key loaded via: cryptography.hazmat.primitives.serialization.load_pem_private_key()
- Private key passphrase read from environment variable SNOWFLAKE_PRIVATE_KEY_PASSPHRASE (may be empty)
- Connection params: account, user, role, warehouse, database, schema (all from env vars)
- All files must start with: # Agent: rasool | Sprint: 01 | Date: ${new Date().toISOString().split('T')[0]}
- No TODO comments, no debug print statements

SNOWFLAKE BEST PRACTICES:
- Use VARIANT columns for semi-structured data (JSON tags, metadata)
- Cluster keys on high-cardinality date/timestamp columns for time-series tables
- Transient tables for staging/intermediate data
- Row access policies for multi-tenant isolation (if applicable)
- Use MERGE for upserts, not INSERT/UPDATE pairs

OUTPUT FORMAT:
\`\`\`sql
// FILE: backend/db/snowflake/schema.sql
<DDL CREATE TABLE statements>
\`\`\`

\`\`\`python
// FILE: backend/db/snowflake/connection.py
<keypair connection helper>
\`\`\`

\`\`\`python
// FILE: backend/db/snowflake/loader.py
<data loading / upsert helpers>
\`\`\`

\`\`\`markdown
// FILE: docs/snowflake-schema.md
<schema documentation>
\`\`\`

Generate all tables with proper Snowflake DDL, keypair connection code, and documentation.`;
    }
    // ── File writer (same pattern as terraformManager) ────────────────────────
    writeAgentFiles(pr, response, out) {
        const fileBlockRe = /```(?:[\w./\-]+)?\s*\n\/\/ FILE: ([^\n]+)\n([\s\S]*?)```/g;
        let match;
        const written = [];
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
            vscode.window.showInformationMessage(`ADLC Rasool: wrote ${written.length} file(s)`);
        }
    }
    // ── Snowflake keypair login wizard ─────────────────────────────────────────
    static async loginWizard(context) {
        const account = await vscode.window.showInputBox({
            prompt: 'Snowflake Account Identifier',
            placeHolder: 'orgname-accountname  (e.g. myorg-myaccount)',
            ignoreFocusOut: true,
        });
        if (!account) {
            return;
        }
        const user = await vscode.window.showInputBox({
            prompt: 'Snowflake Username (for keypair auth)',
            ignoreFocusOut: true,
        });
        if (!user) {
            return;
        }
        const role = await vscode.window.showInputBox({
            prompt: 'Snowflake Role',
            placeHolder: 'SYSADMIN',
            ignoreFocusOut: true,
        }) || 'SYSADMIN';
        const warehouse = await vscode.window.showInputBox({
            prompt: 'Snowflake Warehouse',
            placeHolder: 'COMPUTE_WH',
            ignoreFocusOut: true,
        }) || 'COMPUTE_WH';
        const database = await vscode.window.showInputBox({
            prompt: 'Snowflake Database',
            ignoreFocusOut: true,
        }) || '';
        const schema = await vscode.window.showInputBox({
            prompt: 'Snowflake Schema',
            placeHolder: 'PUBLIC',
            ignoreFocusOut: true,
        }) || 'PUBLIC';
        // Private key — paste PEM content (not path, for portability)
        const privateKey = await vscode.window.showInputBox({
            prompt: 'RSA Private Key (PEM content — paste entire -----BEGIN RSA PRIVATE KEY----- block)',
            ignoreFocusOut: true,
            password: true,
        });
        if (!privateKey) {
            return;
        }
        const passphrase = await vscode.window.showInputBox({
            prompt: 'Private Key Passphrase (leave empty if none)',
            ignoreFocusOut: true,
            password: true,
        }) || '';
        await context.secrets.store(SECRET_SF_ACCOUNT, account);
        await context.secrets.store(SECRET_SF_USER, user);
        await context.secrets.store(SECRET_SF_ROLE, role);
        await context.secrets.store(SECRET_SF_WAREHOUSE, warehouse);
        await context.secrets.store(SECRET_SF_DATABASE, database);
        await context.secrets.store(SECRET_SF_SCHEMA, schema);
        await context.secrets.store(SECRET_SF_PRIVKEY, privateKey);
        await context.secrets.store(SECRET_SF_PASSPHRASE, passphrase);
        vscode.window.showInformationMessage(`ADLC: Snowflake keypair credentials saved for ${user}@${account}`);
        return { account, user, role, warehouse, database, schema, privateKey, passphrase };
    }
    static async logout(context) {
        await Promise.all([
            context.secrets.delete(SECRET_SF_ACCOUNT),
            context.secrets.delete(SECRET_SF_USER),
            context.secrets.delete(SECRET_SF_ROLE),
            context.secrets.delete(SECRET_SF_WAREHOUSE),
            context.secrets.delete(SECRET_SF_DATABASE),
            context.secrets.delete(SECRET_SF_SCHEMA),
            context.secrets.delete(SECRET_SF_PRIVKEY),
            context.secrets.delete(SECRET_SF_PASSPHRASE),
        ]);
        vscode.window.showInformationMessage('ADLC: Snowflake credentials cleared.');
    }
    async loadSnowflakeConfigFromSecrets(context) {
        const account = await context.secrets.get(SECRET_SF_ACCOUNT);
        const user = await context.secrets.get(SECRET_SF_USER);
        const role = await context.secrets.get(SECRET_SF_ROLE);
        const warehouse = await context.secrets.get(SECRET_SF_WAREHOUSE);
        const database = await context.secrets.get(SECRET_SF_DATABASE);
        const schema = await context.secrets.get(SECRET_SF_SCHEMA);
        const privateKey = await context.secrets.get(SECRET_SF_PRIVKEY);
        const passphrase = await context.secrets.get(SECRET_SF_PASSPHRASE);
        if (account && user && privateKey) {
            this.sfConfig = {
                account, user,
                role: role || 'SYSADMIN',
                warehouse: warehouse || 'COMPUTE_WH',
                database: database || '',
                schema: schema || 'PUBLIC',
                privateKey,
                passphrase: passphrase || '',
            };
        }
        else {
            this.sfConfig = null;
        }
    }
    isSnowflakeConnected() {
        return this.sfConfig !== null;
    }
    getSnowflakeConnectionInfo() {
        if (!this.sfConfig) {
            return null;
        }
        return `${this.sfConfig.user}@${this.sfConfig.account} / ${this.sfConfig.database}.${this.sfConfig.schema}`;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    readJSON(file) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        catch {
            return null;
        }
    }
}
exports.RasoolManager = RasoolManager;
//# sourceMappingURL=rasoolManager.js.map