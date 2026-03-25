/**
 * context-compiler.js
 * Agent: context-compiler | Sprint: 01 | Date: 2026-03-16
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 *
 * ENTERPRISE TOKEN OPTIMIZER
 * Runs BEFORE agents launch. Pre-compiles per-agent context JSON so each
 * agent reads a compact ~300-token brief instead of parsing 5000+ tokens
 * of raw requirement.json + group-chat.json + CLAUDE.md every session.
 *
 * Output: context/<agent>-context.json  (one file per agent)
 *
 * Usage:
 *   node context-compiler.js              -- compile all agents
 *   node context-compiler.js vikram       -- compile one agent
 *   node context-compiler.js --watch      -- recompile on file changes
 *   node context-compiler.js --stats      -- show token estimates
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = __dirname;
const CONTEXT_DIR = path.join(ROOT, 'context');
const REQ_FILE    = path.join(ROOT, 'requirement.json');
const CHAT_FILE   = path.join(ROOT, 'group-chat.json');
const STATUS_FILE = path.join(ROOT, 'agent-status.json');
const CLAUDE_FILE = path.join(ROOT, 'CLAUDE.md');

const CHAT_WINDOW    = 30;   // max messages per agent context (recent + tagged)
const MAX_SUMMARY_LEN = 120; // chars for agent input summaries

// Model routing -- enterprise tier assignment
const MODEL_MAP = {
  arjun:   'claude-opus-4-6',              // orchestration + reasoning
  vikram:  'claude-sonnet-4-6',            // IaC + Terraform
  kiran:   'claude-sonnet-4-6',            // backend FastAPI
  rohan:   'claude-sonnet-4-6',            // frontend React
  rasool:  'claude-sonnet-4-6',            // database migrations
  kavya:   'claude-haiku-4-5-20251001',    // design tokens (simple, fast)
  keerthi: 'claude-haiku-4-5-20251001',    // QA checks (fast, cheap)
};

// Phase assignment -- determines launch order
const PHASE_MAP = {
  arjun:   1, vikram: 1, rasool: 1, kavya: 1,
  kiran:   2, rohan:  2,
  keerthi: 3,
};

// What each agent owns (folder boundaries from CLAUDE.md)
const OWNS_MAP = {
  arjun:   ['agent-status.json', 'requirement.json', 'group-chat.json'],
  vikram:  ['infra/modules/'],
  rasool:  ['backend/migrations/', 'docs/db-schema.md'],
  kavya:   ['frontend/src/tokens/', 'docs/component-spec.md'],
  kiran:   ['backend/app/routers/', 'backend/app/schemas/', 'backend/tests/'],
  rohan:   ['frontend/src/components/'],
  keerthi: ['docs/qa-report.md'],
};

// What each agent must NOT touch
const MUST_NOT_TOUCH = {
  arjun:   [],
  vikram:  ['backend/', 'frontend/', 'docs/'],
  rasool:  ['infra/', 'frontend/'],
  kavya:   ['infra/', 'backend/'],
  kiran:   ['infra/', 'frontend/', 'migrations/'],
  rohan:   ['infra/', 'backend/', 'migrations/'],
  keerthi: ['NO CODE CHANGES -- read-only'],
};

// Relevant chat tags per agent
const AGENT_TAGS = {
  arjun:   ['all-agents', 'action-required', 'requirement', 'discovery', 'plan', 'broadcast'],
  vikram:  ['all-agents', 'action-required', 'vikram', 'infra', 'terraform', 'broadcast', 'approved'],
  rasool:  ['all-agents', 'action-required', 'rasool', 'database', 'migration', 'broadcast', 'approved'],
  kavya:   ['all-agents', 'action-required', 'kavya', 'design', 'tokens', 'broadcast', 'approved'],
  kiran:   ['all-agents', 'action-required', 'kiran', 'backend', 'api', 'broadcast', 'approved'],
  rohan:   ['all-agents', 'action-required', 'rohan', 'frontend', 'react', 'broadcast', 'approved'],
  keerthi: ['all-agents', 'done', 'broadcast', 'qa'],
};

function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function readText(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
}

function writeJSON(fp, data) {
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

function estimateTokens(obj) {
  // Rough estimate: 1 token ~ 4 chars
  return Math.ceil(JSON.stringify(obj).length / 4);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function buildChatWindow(messages, agentName) {
  if (!Array.isArray(messages)) return [];
  const tags = AGENT_TAGS[agentName] || ['all-agents', 'broadcast'];

  // Keep: last CHAT_WINDOW messages + any tagged to this agent
  const tagged = messages.filter(m =>
    Array.isArray(m.tags) && m.tags.some(t => tags.includes(t))
  );
  const recent = messages.slice(-CHAT_WINDOW);

  // Merge, deduplicate by id, keep most recent
  const seen = new Set();
  const merged = [];
  for (const m of [...tagged, ...recent]) {
    if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
  }
  merged.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Compress each message to minimal fields
  return merged.slice(-CHAT_WINDOW).map(m => ({
    from: m.from,
    ts:   m.timestamp ? m.timestamp.slice(11, 16) : '',  // HH:MM only
    type: m.type,
    msg:  truncate(m.message, 200),
    tags: m.tags,
  }));
}

function buildRequirementBrief(req, agentName) {
  if (!req || !req.requirementId) return { status: 'no_requirement' };

  // All agents get core requirement info
  const brief = {
    id:          req.requirementId,
    title:       req.title,
    sprint:      req.sprint,
    priority:    req.priority,
    status:      req.status,
    deadline:    req.deadline,
    description: truncate(req.description, 300),
    goal:        truncate(req.businessGoal, 200),
    users:       req.targetUsers,
    constraints: req.techConstraints,
    discoveryComplete: req.discoveryComplete,
    approvedByTarun:   req.approvedByTarun,
  };

  // Add discovery phase for Arjun
  if (agentName === 'arjun') {
    brief.discoveryPhase   = req.discoveryPhase;
    brief.discoveryAnswers = req.discoveryAnswers;
    brief.productBrief     = req.productBrief;
    brief.arjunDecisions   = req.arjunDecisions;
    // Full agent inputs for Arjun to track
    brief.agentInputs = req.agentInputs;
  } else {
    // Non-Arjun agents: only see productBrief + their own input + summary of others
    brief.productBrief = req.productBrief || {};
    brief.arjunDecisions = req.arjunDecisions || {};

    // Compact summary of other agents' status
    brief.teamStatus = {};
    if (req.agentInputs) {
      Object.entries(req.agentInputs).forEach(([name, inp]) => {
        brief.teamStatus[name] = {
          received: inp.received,
          summary:  truncate(inp.summary, MAX_SUMMARY_LEN),
        };
      });
    }

    // Own input in full
    brief.myInput = req.agentInputs?.[agentName] || { received: false };
  }

  return brief;
}

function buildAgentContext(agentName, req, chat, status) {
  const chatWindow = buildChatWindow(chat?.messages || [], agentName);
  const reqBrief   = buildRequirementBrief(req, agentName);

  // Compact status: only the agent's own status + blockers of others
  const myStatus    = status?.agents?.[agentName] || {};
  const teamStatus  = {};
  if (status?.agents) {
    Object.entries(status.agents).forEach(([name, s]) => {
      teamStatus[name] = { status: s.status, progress: s.progress, blocker: s.blocker || '' };
    });
  }

  // CLAUDE.md standards as compact rules (not full text)
  const standards = {
    tags: { Environment: 'dev|staging|prod', Owner: 'TeamPanchayat', CostCenter: 'ADLC-Sprint01', Project: 'CostAnomalyPlatform' },
    terraform: { version: '>=1.7', awsProvider: '>=5.0', backend: 'S3+DynamoDB', requiredFiles: ['main.tf','variables.tf','outputs.tf'] },
    backend:   { python: '3.11+', framework: 'FastAPI+PydanticV2', db: 'PostgreSQL/SQLAlchemy', migrations: 'Alembic', tests: 'pytest 80%+' },
    frontend:  { stack: 'React18+TypeScript', tokens: '/frontend/src/tokens/tokens.css', charts: 'Recharts', mode: 'dark-first', rule: 'no hardcoded colors' },
    quality:   { noTODO: true, noDebugLogs: true, topComment: '# Agent: {name} | Sprint: 01 | Date: {date}' },
  };

  return {
    compiledAt:   new Date().toISOString(),
    agent:        agentName,
    model:        MODEL_MAP[agentName],
    phase:        PHASE_MAP[agentName],
    owns:         OWNS_MAP[agentName],
    mustNotTouch: MUST_NOT_TOUCH[agentName],
    requirement:  reqBrief,
    myStatus,
    teamStatus,
    recentChat:   chatWindow,
    standards,
    _meta: {
      estimatedTokens: 0,  // filled below
      chatMessages:    chatWindow.length,
      totalMessages:   chat?.messages?.length || 0,
    },
  };
}

function compile(agentName) {
  if (!fs.existsSync(CONTEXT_DIR)) fs.mkdirSync(CONTEXT_DIR, { recursive: true });

  const req    = readJSON(REQ_FILE);
  const chat   = readJSON(CHAT_FILE);
  const status = readJSON(STATUS_FILE);

  const ctx = buildAgentContext(agentName, req, chat, status);
  ctx._meta.estimatedTokens = estimateTokens(ctx);

  const outPath = path.join(CONTEXT_DIR, `${agentName}-context.json`);
  writeJSON(outPath, ctx);

  return ctx._meta;
}

function compileAll() {
  const agents = Object.keys(MODEL_MAP);
  const results = {};
  let totalBefore = 0;
  let totalAfter  = 0;

  // Estimate raw file sizes
  const rawReq    = readText(REQ_FILE);
  const rawChat   = readText(CHAT_FILE);
  const rawStatus = readText(STATUS_FILE);
  const rawClaude = readText(CLAUDE_FILE);
  const rawTokens = Math.ceil((rawReq.length + rawChat.length + rawStatus.length + rawClaude.length) / 4);

  agents.forEach(name => {
    const meta = compile(name);
    results[name] = meta;
    totalAfter += meta.estimatedTokens;
  });

  totalBefore = rawTokens * agents.length; // each agent would read all files

  return { results, totalBefore, totalAfter, savings: totalBefore - totalAfter };
}

// -- CLI ------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--watch')) {
  console.log('[context-compiler] Watch mode -- recompiling on changes...');
  const WATCH_FILES = [REQ_FILE, CHAT_FILE, STATUS_FILE];
  compileAll();
  WATCH_FILES.forEach(fp => {
    if (fs.existsSync(fp)) {
      fs.watch(fp, () => {
        process.stdout.write(`\r[context-compiler] Change detected -- recompiling... `);
        try { compileAll(); process.stdout.write('done\n'); } catch (e) { console.error(e.message); }
      });
    }
  });
} else if (args.includes('--stats')) {
  const { results, totalBefore, totalAfter, savings } = compileAll();
  console.log('\n============================================================');
  console.log('  CONTEXT COMPILER -- TOKEN AUDIT');
  console.log('============================================================');
  console.log(`  Without compiler: ~${totalBefore.toLocaleString()} tokens (all agents read all files)`);
  console.log(`  With compiler:    ~${totalAfter.toLocaleString()} tokens (per-agent compiled context)`);
  console.log(`  Savings:          ~${savings.toLocaleString()} tokens (${Math.round(savings/totalBefore*100)}% reduction)`);
  console.log();
  Object.entries(results).forEach(([name, meta]) => {
    const model = MODEL_MAP[name].split('-').slice(-2).join('-');
    console.log(`  ${name.padEnd(10)} ~${String(meta.estimatedTokens).padStart(5)} tokens | ${model} | phase ${PHASE_MAP[name]} | ${meta.chatMessages}/${meta.totalMessages} chat msgs`);
  });
  console.log('============================================================\n');
} else if (args.length && !args[0].startsWith('--')) {
  // Single agent
  const name = args[0].toLowerCase();
  if (!MODEL_MAP[name]) { console.error(`Unknown agent: ${name}`); process.exit(1); }
  const meta = compile(name);
  console.log(`[context-compiler] ${name}: ~${meta.estimatedTokens} tokens -> context/${name}-context.json`);
} else {
  // Compile all
  const { results, totalBefore, totalAfter, savings } = compileAll();
  const pct = Math.round(savings / totalBefore * 100);
  console.log(`[context-compiler] All agents compiled. Tokens: ${totalBefore.toLocaleString()} -> ${totalAfter.toLocaleString()} (${pct}% reduction)`);
  Object.entries(results).forEach(([name, meta]) => {
    console.log(`  ${name.padEnd(10)} ~${meta.estimatedTokens} tokens | model: ${MODEL_MAP[name]}`);
  });
}
