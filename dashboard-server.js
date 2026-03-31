/**
 * dashboard-server.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit -- Team Panchayat
 * Date: 2026-03-15
 *
 * Live Dashboard Server -- serves sprint-board.html on a local port
 * with real-time push via Server-Sent Events (SSE).
 * All changes to agent-status.json, group-chat.json, requirement.json
 * are instantly pushed to all connected browsers -- no manual refresh needed.
 *
 * Usage:
 *   node dashboard-server.js          -> start on default port 3000
 *   node dashboard-server.js --port 8080
 *
 * API endpoints:
 *   GET  /api/state                  -- current full state (JSON)
 *   POST /api/chat                   -- post a message to group chat (supports file attachments)
 *   POST /api/requirement            -- post a new requirement (from wizard)
 *   POST /api/requirement/approve    -- Tarun approves the sprint plan
 *   GET  /events                     -- SSE stream
 *   GET  /uploads/<filename>         -- serve uploaded chat attachment files
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { spawn } = require('child_process');

const ROOT        = __dirname;
const PORT        = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? parseInt(process.argv[i+1]) : 3000; })();
const AGENTS      = ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'];
const UPLOADS_DIR = path.join(ROOT, 'chat-uploads');
const LOGS_DIR    = path.join(ROOT, 'agent-logs');

// Ensure required directories exist on startup
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR))    fs.mkdirSync(LOGS_DIR,    { recursive: true });

// -- Agent process tracking --------------------------------------------------
const agentProcesses = {}; // { agentName: { proc, pid, startedAt } }

function getAgentModel(agentName) {
  try {
    const prompt = fs.readFileSync(path.join(ROOT, 'prompts', `${agentName}-prompt.txt`), 'utf8');
    const m = prompt.match(/# Model:\s*(\S+)/);
    return m ? m[1] : 'claude-sonnet-4-6';
  } catch { return 'claude-sonnet-4-6'; }
}

// ── Local LLM agent runner (Ollama one-shot code generation) ─────────────
const AGENT_ROLES = {
  arjun: 'Orchestrator', kavya: 'UX Designer', vikram: 'Cloud Architect',
  rasool: 'Database Agent', kiran: 'Backend Engineer', rohan: 'Frontend Engineer', keerthi: 'QA Agent',
};

function setAgentStatus(agentName, status, progress, task, blocker) {
  const pr = getProjectRoot();
  const sd = readJSON(path.join(pr, 'agent-status.json')) || {};
  const am = sd.agents || sd;
  am[agentName] = { status, progress, task, blocker: blocker || '', updated: new Date().toISOString() };
  if (sd.agents) sd.agents = am; else Object.assign(sd, am);
  writeJSON(path.join(pr, 'agent-status.json'), sd);
  broadcast('update', getFullState());
}

async function launchAgentLocal(agentName, llmCfg) {
  const pr         = getProjectRoot();
  const activeProj = readJSON(path.join(ROOT, 'active-project.json')) || {};
  const projectId  = path.basename(pr);
  const today      = new Date().toISOString().split('T')[0];
  const req        = readJSON(path.join(pr, 'requirement.json')) || {};
  const logPath    = path.join(LOGS_DIR, `${agentName}.log`);
  const endpoint   = (llmCfg.endpoint || 'http://localhost:11434').replace(/\/$/, '');
  const model      = llmCfg.model || 'llama3.2';

  // Feedback loop settings
  const feedbackEnabled   = !!llmCfg.feedbackLoop;
  const maxIterations     = Math.min(llmCfg.maxIterations || 3, 5);
  const feedbackThreshold = llmCfg.feedbackThreshold || 75;

  const promptFile = path.join(ROOT, 'prompts', `${agentName}-prompt.txt`);
  if (!fs.existsSync(promptFile)) {
    setAgentStatus(agentName, 'blocked', 0, 'No prompt file found', 'missing prompt');
    return { ok: false, error: 'no prompt file' };
  }
  const promptContent = fs.readFileSync(promptFile, 'utf8');

  const outputInstruction = [
    '', '=== LOCAL LLM OUTPUT FORMAT (REQUIRED) ===',
    'Respond with ONLY a raw JSON object (no markdown, no code fences):',
    '{ "files": [{ "path": "relative/path", "content": "full file content" }],',
    '  "chat_message": "Short summary (1-2 sentences)",',
    '  "status": { "task": "what was delivered", "progress": 100 } }',
    `PROJECT_ROOT: ${pr}`,
    'Write complete file contents — do NOT truncate or use placeholders.',
    '=== END OUTPUT FORMAT ===', '',
  ].join('\n');

  const contextBlock = [
    '=== RUNTIME CONTEXT (injected by dashboard-server — read this first) ===',
    `WORKSPACE_ROOT    : ${ROOT}`,
    `PROJECT_ROOT      : ${pr}`,
    `PROJECT_ID        : ${projectId}`,
    `PROJECT_NAME      : ${activeProj.name || req.title || projectId}`,
    `SPRINT            : ${activeProj.sprint || req.sprint || '01'}`,
    `TODAY             : ${today}`,
    '',
    '── KEY FILES (use these exact paths — do NOT guess) ──',
    `  requirement.json  : ${path.join(pr, 'requirement.json')}`,
    `  agent-status.json : ${path.join(pr, 'agent-status.json')}`,
    `  group-chat.json   : ${path.join(pr, 'group-chat.json')}`,
    `  active-project    : ${path.join(ROOT, 'active-project.json')}`,
    '',
    '── CURRENT REQUIREMENT SNAPSHOT ──',
    `  title            : ${req.title || '(none)'}`,
    `  type             : ${req.type || '(none)'}`,
    `  status           : ${req.status || '(none)'}`,
    `  sprint           : ${req.sprint || '(none)'}`,
    `  discoveryComplete: ${req.discoveryComplete || false}`,
    `  approvedByTarun  : ${req.approvedByTarun || false}`,
    '',
    'IMPORTANT: Always read/write requirement.json, agent-status.json and group-chat.json',
    'from PROJECT_ROOT shown above — NOT from /workspace/ root.',
    '=== END RUNTIME CONTEXT ===', '',
  ].join('\n');

  const systemPrompt = contextBlock + outputInstruction + promptContent;

  setAgentStatus(agentName, 'wip', 10, `[Ollama] Iter 1/${feedbackEnabled ? maxIterations : 1} — generating…`);
  fs.appendFileSync(logPath, `[LOCAL LLM] model=${model} feedbackLoop=${feedbackEnabled} maxIter=${maxIterations}\n`);
  broadcast('agent-log', { agent: agentName,
    text: `[LOCAL LLM] Model: ${model} | FeedbackLoop: ${feedbackEnabled ? `ON (max ${maxIterations} iters, threshold ${feedbackThreshold}/100)` : 'OFF'}\n` });

  // Ollama keeps conversation history via messages array
  const messages    = [{ role: 'user', content: systemPrompt }];
  let   finalParsed = null;
  let   finalScore  = 0;
  let   iteration   = 0;

  try {
    while (iteration < (feedbackEnabled ? maxIterations : 1)) {
      iteration++;
      const iterLabel = feedbackEnabled ? ` (iter ${iteration}/${maxIterations})` : '';
      setAgentStatus(agentName, 'wip', Math.min(10 + (iteration - 1) * 25, 85),
        `[Ollama] Generating${iterLabel}…`);
      broadcast('agent-log', { agent: agentName,
        text: `[LOCAL LLM] ── Iteration ${iteration} / ${feedbackEnabled ? maxIterations : 1} ──\n` });

      const resp = await fetch(`${endpoint}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, messages, stream: false, options: { num_ctx: 16384, temperature: 0.2 } }),
      });
      if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);

      const rawContent = ((await resp.json()).message?.content || '').trim();
      const jsonStr    = rawContent.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      let   parsed;
      try   { parsed = JSON.parse(jsonStr); }
      catch { const m = jsonStr.match(/\{[\s\S]*\}/); if (!m) throw new Error('No valid JSON'); parsed = JSON.parse(m[0]); }

      finalParsed = parsed;
      finalScore  = scoreOllamaOutput(parsed);
      broadcast('agent-log', { agent: agentName,
        text: `[LOCAL LLM] Iter ${iteration} score: ${finalScore}/100 (threshold: ${feedbackThreshold})\n` });
      fs.appendFileSync(logPath, `[LOCAL LLM] Iter ${iteration} score: ${finalScore}/100\n`);

      // Add assistant reply to history
      messages.push({ role: 'assistant', content: rawContent });

      if (!feedbackEnabled || finalScore >= feedbackThreshold) break;
      if (iteration >= maxIterations) {
        broadcast('agent-log', { agent: agentName,
          text: `[LOCAL LLM] Max iterations reached. Using best result (score: ${finalScore}).\n` });
        break;
      }

      // Add feedback message to conversation
      const feedback = buildFeedbackPrompt(iteration + 1, finalScore, feedbackThreshold, parsed);
      messages.push({ role: 'user', content: feedback });
      broadcast('agent-log', { agent: agentName,
        text: `[LOCAL LLM] Sending feedback for iteration ${iteration + 1}…\n` });
      postToChat('SYSTEM', 'System', 'system',
        `🔄 [${agentName.toUpperCase()}] Ollama feedback loop iter ${iteration}: score ${finalScore}/100 — improving…`,
        [agentName]);
    }

    if (!finalParsed) throw new Error('No valid response from Ollama');

    const files   = finalParsed.files || [];
    let   written = 0;
    for (const file of files) {
      if (!file.path || file.content === undefined) continue;
      const absPath = path.resolve(pr, file.path);
      if (!absPath.startsWith(pr)) continue;
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, file.content, 'utf8');
      written++;
      fs.appendFileSync(logPath, `[LOCAL LLM] Wrote: ${file.path}\n`);
      broadcast('agent-log', { agent: agentName, text: `  ✓ ${file.path}\n` });
    }

    const iterSummary = feedbackEnabled && iteration > 1 ? ` · ${iteration} iterations · score ${finalScore}/100` : '';
    const chatMsg     = finalParsed.chat_message || `Generated ${written} file(s).`;
    postToChat(agentName.toUpperCase(), AGENT_ROLES[agentName] || agentName, 'message',
      `🦙 [${model}${iterSummary}] ${chatMsg}`, ['tarun']);

    const task = finalParsed.status?.task || `${written} file(s) via ${model}${iterSummary}`;
    setAgentStatus(agentName, 'done', 100, task);
    broadcast('update', getFullState());
    return { ok: true, files: written };

  } catch (e) {
    const errMsg = e.message;
    fs.appendFileSync(logPath, `[LOCAL LLM ERROR] ${errMsg}\n`);
    broadcast('agent-log', { agent: agentName, text: `[LOCAL LLM ERROR] ${errMsg}\n` });
    postToChat('SYSTEM', 'System', 'system',
      `❌ Local LLM failed for ${agentName.toUpperCase()}: ${errMsg}`, [agentName]);
    setAgentStatus(agentName, 'blocked', 0, `Local LLM error: ${errMsg}`, errMsg);
    return { ok: false, error: errMsg };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HYBRID LLM ENGINE — Ollama (draft) → quality score → Claude (improve)
// Completely independent from launchAgent/launchAgentLocal.
// Config lives under connections.json → "hybrid" key.
// ════════════════════════════════════════════════════════════════════════════

function scoreOllamaOutput(parsed) {
  let score = 0;
  // 1. Valid JSON with expected shape (30 pts)
  if (parsed && typeof parsed === 'object') score += 15;
  if (Array.isArray(parsed.files))          score += 15;
  // 2. Has actual files (20 pts)
  const files = parsed.files || [];
  if (files.length > 0)       score += 10;
  if (files.length >= 2)      score += 10;
  // 3. File content quality (30 pts)
  const avgLines = files.length
    ? files.reduce((s, f) => s + (f.content || '').split('\n').length, 0) / files.length
    : 0;
  if (avgLines > 10)  score += 10;
  if (avgLines > 30)  score += 10;
  if (avgLines > 80)  score += 10;
  // 4. No placeholder patterns (20 pts)
  const allContent = files.map(f => f.content || '').join('\n');
  const placeholders = (allContent.match(/TODO|FIXME|pass\b|\.\.\.|\[your |<your /gi) || []).length;
  if (placeholders === 0) score += 20;
  else if (placeholders < 3) score += 10;
  return Math.min(score, 100);
}

async function callClaudeAPI(prompt, hybridCfg) {
  const apiKey = hybridCfg.claudeApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY set for hybrid Claude layer');
  const model  = hybridCfg.claudeModel || 'claude-sonnet-4-6';
  const resp   = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function launchAgentHybrid(agentName, hybridCfg) {
  const pr         = getProjectRoot();
  const activeProj = readJSON(path.join(ROOT, 'active-project.json')) || {};
  const projectId  = path.basename(pr);
  const today      = new Date().toISOString().split('T')[0];
  const req        = readJSON(path.join(pr, 'requirement.json')) || {};
  const logPath    = path.join(LOGS_DIR, `${agentName}.log`);
  const mode       = hybridCfg.mode || 'ollama-first';
  const threshold  = hybridCfg.qualityThreshold !== undefined ? hybridCfg.qualityThreshold : 75;

  const promptFile = path.join(ROOT, 'prompts', `${agentName}-prompt.txt`);
  if (!fs.existsSync(promptFile)) {
    setAgentStatus(agentName, 'blocked', 0, 'No prompt file', 'missing prompt');
    return { ok: false, error: 'no prompt file' };
  }
  const promptContent = fs.readFileSync(promptFile, 'utf8');

  const outputInstruction = [
    '',
    '=== HYBRID OUTPUT FORMAT (REQUIRED) ===',
    'Respond with ONLY a raw JSON object (no markdown fences):',
    '{',
    '  "files": [{ "path": "relative/path", "content": "full content" }],',
    '  "chat_message": "1-2 sentence summary of what was built",',
    '  "status": { "task": "delivery description", "progress": 100 }',
    '}',
    `PROJECT_ROOT: ${pr}`,
    'Write COMPLETE file contents — no truncation, no placeholders.',
    '=== END FORMAT ===',
    '',
  ].join('\n');

  const contextBlock = [
    '=== RUNTIME CONTEXT (injected by dashboard-server — read this first) ===',
    `WORKSPACE_ROOT    : ${ROOT}`,
    `PROJECT_ROOT      : ${pr}`,
    `PROJECT_ID        : ${projectId}`,
    `PROJECT_NAME      : ${activeProj.name || req.title || projectId}`,
    `SPRINT            : ${activeProj.sprint || req.sprint || '01'}`,
    `TODAY             : ${today}`,
    '',
    '── KEY FILES (use these exact paths — do NOT guess) ──',
    `  requirement.json  : ${path.join(pr, 'requirement.json')}`,
    `  agent-status.json : ${path.join(pr, 'agent-status.json')}`,
    `  group-chat.json   : ${path.join(pr, 'group-chat.json')}`,
    `  active-project    : ${path.join(ROOT, 'active-project.json')}`,
    '',
    '── CURRENT REQUIREMENT SNAPSHOT ──',
    `  title            : ${req.title || '(none)'}`,
    `  type             : ${req.type || '(none)'}`,
    `  status           : ${req.status || '(none)'}`,
    `  sprint           : ${req.sprint || '(none)'}`,
    `  discoveryComplete: ${req.discoveryComplete || false}`,
    `  approvedByTarun  : ${req.approvedByTarun || false}`,
    '',
    'IMPORTANT: Always read/write requirement.json, agent-status.json and group-chat.json',
    'from PROJECT_ROOT shown above — NOT from /workspace/ root.',
    '=== END RUNTIME CONTEXT ===', '',
  ].join('\n');

  const fullPrompt = contextBlock + outputInstruction + promptContent;

  // ── STEP 1: Ollama draft ──────────────────────────────────────────────────
  setAgentStatus(agentName, 'wip', 15, `[Hybrid] Ollama drafting code (${hybridCfg.ollamaModel})…`);
  broadcast('agent-log', { agent: agentName, text: `[HYBRID] Step 1: Ollama draft (${hybridCfg.ollamaModel})\n` });

  let ollamaParsed = null;
  let ollamaScore  = 0;
  let ollamaError  = null;

  try {
    const endpoint = (hybridCfg.ollamaEndpoint || 'http://localhost:11434').replace(/\/$/, '');
    const resp = await fetch(`${endpoint}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:    hybridCfg.ollamaModel || 'qwen2.5-coder:7b',
        messages: [{ role: 'user', content: fullPrompt }],
        stream:   false,
        options:  { num_ctx: 16384, temperature: 0.2 },
      }),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const raw = ((await resp.json()).message?.content || '').trim()
      .replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    ollamaParsed = JSON.parse(match ? match[0] : raw);
    ollamaScore  = scoreOllamaOutput(ollamaParsed);
    fs.appendFileSync(logPath, `[HYBRID] Ollama score: ${ollamaScore}/100\n`);
    broadcast('agent-log', { agent: agentName, text: `[HYBRID] Ollama score: ${ollamaScore}/100 (threshold: ${threshold})\n` });
  } catch (e) {
    ollamaError = e.message;
    fs.appendFileSync(logPath, `[HYBRID] Ollama failed: ${ollamaError}\n`);
    broadcast('agent-log', { agent: agentName, text: `[HYBRID] Ollama failed: ${ollamaError}\n` });
  }

  // ── STEP 2: Decide whether Claude is needed ───────────────────────────────
  const needsClaude = mode === 'claude-review'
    || (ollamaError && hybridCfg.claudeOnFail !== false)
    || (ollamaParsed && ollamaScore < threshold);

  let finalParsed = ollamaParsed;
  let usedLayer   = 'ollama';

  if (needsClaude) {
    setAgentStatus(agentName, 'wip', 55, `[Hybrid] Claude improving draft (${hybridCfg.claudeModel})…`);
    broadcast('agent-log', { agent: agentName,
      text: `[HYBRID] Step 2: Escalating to Claude (${hybridCfg.claudeModel}) — reason: ${ollamaError ? 'ollama-failed' : `score=${ollamaScore}<${threshold}`}\n` });

    try {
      const improvePrompt = ollamaParsed
        ? [
            contextBlock,
            '=== HYBRID IMPROVEMENT TASK ===',
            `Ollama generated a draft (quality score: ${ollamaScore}/100). Review and improve it.`,
            'Fix any issues: incomplete code, placeholders, missing logic, poor structure.',
            'Return improved output in the same JSON format.',
            outputInstruction,
            '=== OLLAMA DRAFT TO IMPROVE ===',
            JSON.stringify(ollamaParsed, null, 2),
            '=== END DRAFT ===',
            promptContent,
          ].join('\n')
        : fullPrompt; // Ollama failed entirely — Claude builds from scratch

      const claudeRaw = await callClaudeAPI(improvePrompt, hybridCfg);
      const claudeStr = claudeRaw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const m2        = claudeStr.match(/\{[\s\S]*\}/);
      finalParsed     = JSON.parse(m2 ? m2[0] : claudeStr);
      usedLayer       = ollamaParsed ? 'hybrid' : 'claude';
      broadcast('agent-log', { agent: agentName, text: `[HYBRID] Claude improvement applied. Final layer: ${usedLayer}\n` });
    } catch (e) {
      broadcast('agent-log', { agent: agentName, text: `[HYBRID] Claude failed: ${e.message}. Using Ollama draft.\n` });
      // fallback to whatever Ollama gave us
    }
  }

  if (!finalParsed) {
    const errMsg = ollamaError || 'Both Ollama and Claude failed';
    setAgentStatus(agentName, 'blocked', 0, `Hybrid failed: ${errMsg}`, errMsg);
    postToChat('SYSTEM', 'System', 'system', `❌ Hybrid LLM failed for ${agentName.toUpperCase()}: ${errMsg}`, [agentName]);
    return { ok: false, error: errMsg };
  }

  // ── STEP 3: Write files ───────────────────────────────────────────────────
  setAgentStatus(agentName, 'wip', 85, '[Hybrid] Writing files…');
  const files   = finalParsed.files || [];
  let   written = 0;
  for (const file of files) {
    if (!file.path || file.content === undefined) continue;
    const absPath = path.resolve(pr, file.path);
    if (!absPath.startsWith(pr)) continue;
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, file.content, 'utf8');
    written++;
    broadcast('agent-log', { agent: agentName, text: `  ✓ ${file.path}\n` });
  }

  const layerEmoji = { ollama: '🟡', claude: '🔵', hybrid: '🔀' }[usedLayer] || '🔀';
  const chatMsg    = finalParsed.chat_message || `Generated ${written} file(s).`;
  postToChat(
    agentName.toUpperCase(), AGENT_ROLES[agentName] || agentName, 'message',
    `${layerEmoji} [Hybrid · ${usedLayer}] ${chatMsg}`, ['tarun'],
  );

  // Save layer used to agent-status for UI badge
  const pr2  = getProjectRoot();
  const sd   = readJSON(path.join(pr2, 'agent-status.json')) || {};
  const am   = sd.agents || sd;
  if (am[agentName]) am[agentName].hybridLayer = usedLayer;
  if (sd.agents) sd.agents = am; else Object.assign(sd, am);
  writeJSON(path.join(pr2, 'agent-status.json'), sd);

  setAgentStatus(agentName, 'done', 100, finalParsed.status?.task || `${written} file(s) via ${usedLayer}`);
  return { ok: true, files: written, layer: usedLayer, ollamaScore };
}

// ── Hybrid config API endpoints (new, isolated) ───────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// OPENAI-COMPATIBLE LLM ENGINE
// Supports: Azure OpenAI + Standard OpenAI + any OpenAI-compatible endpoint
// (Together.ai, Groq, LM Studio, etc.)
// Config lives under connections.json → "openaiCompat" key.
// Completely independent from Ollama, Claude and Hybrid modes.
// ════════════════════════════════════════════════════════════════════════════

const OPENAI_COMPAT_DEFAULTS = {
  enabled:         false,
  provider:        'openai',   // 'openai' | 'azure' | 'custom'
  endpoint:        'https://api.openai.com/v1',
  apiKey:          '',
  model:           'gpt-4o',
  // Azure-specific
  azureDeployment: '',
  azureApiVersion: '2024-02-01',
  // Feedback loop
  feedbackLoop:    false,
  maxIterations:   3,
  feedbackThreshold: 75,       // re-try if score below this
};

function buildOpenAICompatRequest(cfg) {
  const isAzure  = cfg.provider === 'azure' || cfg.endpoint.includes('.openai.azure.com');
  const base     = cfg.endpoint.replace(/\/$/, '');
  let   url, headers;

  if (isAzure) {
    const deployment = cfg.azureDeployment || cfg.model;
    const apiVersion = cfg.azureApiVersion || '2024-02-01';
    url     = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    headers = { 'Content-Type': 'application/json', 'api-key': cfg.apiKey };
  } else {
    // Standard OpenAI or compatible (Together, Groq, LM Studio, etc.)
    url     = `${base}/chat/completions`;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` };
  }
  return { url, headers };
}

function buildFeedbackPrompt(iteration, score, threshold, prevParsed) {
  const files       = prevParsed.files || [];
  const issues      = [];
  const allContent  = files.map(f => f.content || '').join('\n');
  const avgLines    = files.length
    ? files.reduce((s, f) => s + (f.content || '').split('\n').length, 0) / files.length : 0;
  const placeholders = (allContent.match(/TODO|FIXME|pass\b|\.\.\.|\[your |<your /gi) || []).length;

  if (files.length === 0)     issues.push('No files were generated — you must return at least one file.');
  else if (files.length < 2)  issues.push('Too few files generated — the task likely requires multiple files.');
  if (avgLines < 20)          issues.push(`File content is too short (avg ${Math.round(avgLines)} lines) — write complete, production-ready implementations.`);
  if (placeholders > 0)       issues.push(`Found ${placeholders} placeholder(s) (TODO/FIXME/pass/...) — replace ALL with real working code.`);

  const issueList = issues.length ? issues.map((i, n) => `${n + 1}. ${i}`).join('\n') : 'Overall code quality is below the required threshold.';

  return [
    `=== FEEDBACK LOOP — Iteration ${iteration} ===`,
    `Your previous response scored ${score}/100 (required: ${threshold}/100).`,
    '',
    'Issues found:',
    issueList,
    '',
    'Instructions to improve:',
    '- Fix every issue listed above.',
    '- Return the COMPLETE improved JSON response — all files with full content.',
    '- Do NOT truncate. Do NOT use placeholders.',
    '- The JSON format is the same as before.',
    '=== END FEEDBACK ===',
    '',
  ].join('\n');
}

async function callOpenAICompatAPI(url, headers, model, messages, isAzure) {
  const resp = await fetch(url, {
    method:  'POST',
    headers,
    body: JSON.stringify({
      model:       isAzure ? undefined : model,
      messages,
      temperature: 0.2,
      max_tokens:  8192,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data    = await resp.json();
  const content = (data.choices?.[0]?.message?.content || '').trim();
  const jsonStr = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  let parsed;
  try   { parsed = JSON.parse(jsonStr); }
  catch { const m = jsonStr.match(/\{[\s\S]*\}/); if (!m) throw new Error('No valid JSON in response'); parsed = JSON.parse(m[0]); }
  return { parsed, rawContent: content };
}

async function launchAgentOpenAICompat(agentName, cfg) {
  const pr         = getProjectRoot();
  const activeProj = readJSON(path.join(ROOT, 'active-project.json')) || {};
  const projectId  = path.basename(pr);
  const today      = new Date().toISOString().split('T')[0];
  const req        = readJSON(path.join(pr, 'requirement.json')) || {};
  const logPath    = path.join(LOGS_DIR, `${agentName}.log`);
  const modelLabel = cfg.provider === 'azure' ? `azure/${cfg.azureDeployment || cfg.model}` : cfg.model;
  const isAzure    = cfg.provider === 'azure' || (cfg.endpoint || '').includes('.openai.azure.com');

  // Feedback loop settings
  const feedbackEnabled   = !!cfg.feedbackLoop;
  const maxIterations     = Math.min(cfg.maxIterations || 3, 5);
  const feedbackThreshold = cfg.feedbackThreshold || 75;

  const promptFile = path.join(ROOT, 'prompts', `${agentName}-prompt.txt`);
  if (!fs.existsSync(promptFile)) {
    setAgentStatus(agentName, 'blocked', 0, 'No prompt file', 'missing prompt');
    return { ok: false, error: 'no prompt file' };
  }
  const promptContent = fs.readFileSync(promptFile, 'utf8');

  const outputInstruction = [
    '', '=== OUTPUT FORMAT (REQUIRED) ===',
    'Respond with ONLY a raw JSON object (no markdown fences):',
    '{ "files": [{ "path": "relative/path", "content": "full file content" }],',
    '  "chat_message": "1-2 sentence summary",',
    '  "status": { "task": "what was delivered", "progress": 100 } }',
    `PROJECT_ROOT: ${pr}`,
    'Write COMPLETE file contents — no truncation, no TODOs, no placeholders.',
    '=== END FORMAT ===', '',
  ].join('\n');

  const contextBlock = [
    '=== RUNTIME CONTEXT (injected by dashboard-server — read this first) ===',
    `WORKSPACE_ROOT    : ${ROOT}`,
    `PROJECT_ROOT      : ${pr}`,
    `PROJECT_ID        : ${projectId}`,
    `PROJECT_NAME      : ${activeProj.name || req.title || projectId}`,
    `SPRINT            : ${activeProj.sprint || req.sprint || '01'}`,
    `TODAY             : ${today}`,
    '',
    '── KEY FILES (use these exact paths — do NOT guess) ──',
    `  requirement.json  : ${path.join(pr, 'requirement.json')}`,
    `  agent-status.json : ${path.join(pr, 'agent-status.json')}`,
    `  group-chat.json   : ${path.join(pr, 'group-chat.json')}`,
    `  active-project    : ${path.join(ROOT, 'active-project.json')}`,
    '',
    '── CURRENT REQUIREMENT SNAPSHOT ──',
    `  title            : ${req.title || '(none)'}`,
    `  type             : ${req.type || '(none)'}`,
    `  status           : ${req.status || '(none)'}`,
    `  sprint           : ${req.sprint || '(none)'}`,
    `  discoveryComplete: ${req.discoveryComplete || false}`,
    `  approvedByTarun  : ${req.approvedByTarun || false}`,
    '',
    'IMPORTANT: Always read/write requirement.json, agent-status.json and group-chat.json',
    'from PROJECT_ROOT shown above — NOT from /workspace/ root.',
    '=== END RUNTIME CONTEXT ===', '',
  ].join('\n');

  const systemPrompt   = contextBlock + outputInstruction + promptContent;
  const { url, headers } = buildOpenAICompatRequest(cfg);

  setAgentStatus(agentName, 'wip', 10, `[OpenAI] Iteration 1/${feedbackEnabled ? maxIterations : 1} — generating…`);
  fs.appendFileSync(logPath, `[OPENAI-COMPAT] Starting — model=${modelLabel} feedbackLoop=${feedbackEnabled} maxIter=${maxIterations}\n`);
  broadcast('agent-log', { agent: agentName, text: `[OPENAI] Model: ${modelLabel} | FeedbackLoop: ${feedbackEnabled ? `ON (max ${maxIterations} iterations, threshold ${feedbackThreshold}/100)` : 'OFF'}\n` });

  // ── Feedback loop: multi-turn conversation ────────────────────────────────
  const messages    = [{ role: 'user', content: systemPrompt }];
  let   finalParsed = null;
  let   finalScore  = 0;
  let   iteration   = 0;

  try {
    while (iteration < (feedbackEnabled ? maxIterations : 1)) {
      iteration++;
      const iterLabel = feedbackEnabled ? ` (iter ${iteration}/${maxIterations})` : '';
      setAgentStatus(agentName, 'wip', Math.min(10 + (iteration - 1) * 25, 85),
        `[OpenAI] Generating${iterLabel}…`);
      broadcast('agent-log', { agent: agentName,
        text: `[OPENAI] ── Iteration ${iteration} / ${feedbackEnabled ? maxIterations : 1} ──\n` });

      const { parsed, rawContent } = await callOpenAICompatAPI(url, headers, cfg.model, messages, isAzure);
      fs.appendFileSync(logPath, `[OPENAI] Iter ${iteration}: response ${rawContent.length} chars\n`);

      finalParsed  = parsed;
      finalScore   = scoreOllamaOutput(parsed);
      broadcast('agent-log', { agent: agentName,
        text: `[OPENAI] Iter ${iteration} score: ${finalScore}/100 (threshold: ${feedbackThreshold})\n` });
      fs.appendFileSync(logPath, `[OPENAI] Iter ${iteration} score: ${finalScore}/100\n`);

      // Add assistant response to conversation history
      messages.push({ role: 'assistant', content: rawContent });

      // Stop if quality is good enough or feedback loop disabled
      if (!feedbackEnabled || finalScore >= feedbackThreshold) break;
      if (iteration >= maxIterations) {
        broadcast('agent-log', { agent: agentName,
          text: `[OPENAI] Max iterations reached (${maxIterations}). Using best result (score: ${finalScore}).\n` });
        break;
      }

      // Build feedback message and add to conversation
      const feedback = buildFeedbackPrompt(iteration + 1, finalScore, feedbackThreshold, parsed);
      messages.push({ role: 'user', content: feedback });
      broadcast('agent-log', { agent: agentName,
        text: `[OPENAI] Score below threshold — sending feedback for iteration ${iteration + 1}…\n` });

      // Post intermediate status to chat
      postToChat('SYSTEM', 'System', 'system',
        `🔄 [${agentName.toUpperCase()}] Feedback loop iteration ${iteration}: score ${finalScore}/100 — improving…`,
        [agentName]);
    }

    if (!finalParsed) throw new Error('No valid response from model');

    // ── Write final files ───────────────────────────────────────────────────
    const files   = finalParsed.files || [];
    let   written = 0;
    for (const file of files) {
      if (!file.path || file.content === undefined) continue;
      const absPath = path.resolve(pr, file.path);
      if (!absPath.startsWith(pr)) continue;
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, file.content, 'utf8');
      written++;
      broadcast('agent-log', { agent: agentName, text: `  ✓ ${file.path}\n` });
    }

    const providerEmoji  = cfg.provider === 'azure' ? '☁️' : cfg.provider === 'custom' ? '🔧' : '🟢';
    const iterSummary    = feedbackEnabled && iteration > 1 ? ` · ${iteration} iterations · final score ${finalScore}/100` : '';
    const chatMsg        = finalParsed.chat_message || `Generated ${written} file(s).`;
    postToChat(agentName.toUpperCase(), AGENT_ROLES[agentName] || agentName, 'message',
      `${providerEmoji} [${modelLabel}${iterSummary}] ${chatMsg}`, ['tarun']);

    setAgentStatus(agentName, 'done', 100,
      finalParsed.status?.task || `${written} file(s) via ${modelLabel}${iterSummary}`);
    broadcast('update', getFullState());
    return { ok: true, files: written };

  } catch (e) {
    fs.appendFileSync(logPath, `[OPENAI-COMPAT ERROR] ${e.message}\n`);
    broadcast('agent-log', { agent: agentName, text: `[OPENAI ERROR] ${e.message}\n` });
    postToChat('SYSTEM', 'System', 'system',
      `❌ OpenAI-compat failed for ${agentName.toUpperCase()}: ${e.message}`, [agentName]);
    setAgentStatus(agentName, 'blocked', 0, `OpenAI error: ${e.message}`, e.message);
    return { ok: false, error: e.message };
  }
}

const HYBRID_DEFAULTS = {
  enabled:          false,
  mode:             'ollama-first',   // 'ollama-first' | 'claude-review' | 'router'
  ollamaEndpoint:   'http://localhost:11434',
  ollamaModel:      'qwen2.5-coder:7b',
  claudeModel:      'claude-sonnet-4-6',
  qualityThreshold: 75,
  claudeOnFail:     true,
};

function launchAgent(agentName) {
  const connCfg = readJSON(path.join(ROOT, 'connections.json')) || {};

  // ── OpenAI-compatible mode (Azure / OpenAI / custom) — isolated ──────────
  const oaiCfg = connCfg.openaiCompat || {};
  if (oaiCfg.enabled) {
    const merged = Object.assign({}, OPENAI_COMPAT_DEFAULTS, oaiCfg);
    launchAgentOpenAICompat(agentName, merged);
    return { ok: true, mode: 'openai-compat' };
  }

  // ── NEW: Hybrid mode — checked independently, never touches other modes ──
  const hybridCfg = connCfg.hybrid || {};
  if (hybridCfg.enabled) {
    const merged = Object.assign({}, HYBRID_DEFAULTS, hybridCfg);
    launchAgentHybrid(agentName, merged);
    return { ok: true, mode: 'hybrid' };
  }

  // ── Existing: Ollama-only (unchanged) ───────────────────────────────────
  const llmCfg = connCfg.localLLM || {};
  if (llmCfg.enabled && llmCfg.useForAgents) {
    launchAgentLocal(agentName, llmCfg);
    return { ok: true, mode: 'local-llm' };
  }

  const existing = agentProcesses[agentName];
  if (existing && existing.proc && existing.proc.exitCode === null) {
    return { ok: false, error: 'already running' };
  }
  const promptFile = path.join(ROOT, 'prompts', `${agentName}-prompt.txt`);
  if (!fs.existsSync(promptFile)) return { ok: false, error: 'no prompt file' };

  const promptContent = fs.readFileSync(promptFile, 'utf8');
  const model   = getAgentModel(agentName);
  const logPath = path.join(LOGS_DIR, `${agentName}.log`);

  // Resolve project root so agents know where to read/write files
  const pr          = getProjectRoot();
  const activeProj  = readJSON(path.join(ROOT, 'active-project.json')) || {};
  const projectId   = path.basename(pr);
  const today       = new Date().toISOString().split('T')[0];

  // Prepend a context block so agents always know real paths regardless of prompt placeholders
  const req2 = readJSON(path.join(pr, 'requirement.json')) || {};
  const contextBlock = [
    '=== RUNTIME CONTEXT (injected by dashboard-server — read this first) ===',
    `WORKSPACE_ROOT    : ${ROOT}`,
    `PROJECT_ROOT      : ${pr}`,
    `PROJECT_ID        : ${projectId}`,
    `PROJECT_NAME      : ${activeProj.name || req2.title || projectId}`,
    `SPRINT            : ${activeProj.sprint || req2.sprint || '01'}`,
    `TODAY             : ${today}`,
    '',
    '── KEY FILES (use these exact paths — do NOT guess) ──',
    `  requirement.json  : ${path.join(pr, 'requirement.json')}`,
    `  agent-status.json : ${path.join(pr, 'agent-status.json')}`,
    `  group-chat.json   : ${path.join(pr, 'group-chat.json')}`,
    `  active-project    : ${path.join(ROOT, 'active-project.json')}`,
    '',
    '── PATH ALIASES (for prompts that use /workspace/ or /projects/) ──',
    `  /workspace/  →  ${ROOT}${path.sep}`,
    `  /projects/${projectId}/  →  ${pr}${path.sep}`,
    '',
    '── CURRENT REQUIREMENT SNAPSHOT ──',
    `  title            : ${req2.title || '(none)'}`,
    `  type             : ${req2.type || '(none)'}`,
    `  status           : ${req2.status || '(none)'}`,
    `  sprint           : ${req2.sprint || '(none)'}`,
    `  discoveryComplete: ${req2.discoveryComplete || false}`,
    `  approvedByTarun  : ${req2.approvedByTarun || false}`,
    '',
    'IMPORTANT: Always read/write requirement.json, agent-status.json and group-chat.json',
    'from PROJECT_ROOT shown above — NOT from /workspace/ root.',
    '=== END RUNTIME CONTEXT ===',
    '',
  ].join('\n');

  const proc = spawn('claude', [
    '--print',
    '--model', model,
    '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch',
  ], { cwd: ROOT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdin.on('error', () => {}); // suppress EPIPE if process exits before stdin drains
  try { proc.stdin.write(contextBlock + promptContent); proc.stdin.end(); } catch (e) {
    fs.appendFileSync(logPath, `[ERR] stdin write failed: ${e.message}\n`);
  }

  agentProcesses[agentName] = { proc, pid: proc.pid, startedAt: new Date().toISOString() };

  // Mark agent as wip immediately — write flat format so getFullState() normalises cleanly
  const statusData = readJSON(path.join(pr, 'agent-status.json')) || {};
  const agentsMap = statusData.agents || statusData;
  agentsMap[agentName] = { status: 'wip', progress: 5, task: 'Agent starting…', blocker: '', updated: new Date().toISOString() };
  if (statusData.agents) statusData.agents = agentsMap; else Object.assign(statusData, agentsMap);
  writeJSON(path.join(pr, 'agent-status.json'), statusData);

  proc.stdout.on('data', chunk => {
    fs.appendFileSync(logPath, chunk.toString());
    broadcast('agent-log', { agent: agentName, text: chunk.toString() });
  });
  proc.stderr.on('data', chunk => {
    fs.appendFileSync(logPath, '[ERR] ' + chunk.toString());
  });
  proc.on('exit', code => {
    const pr2 = getProjectRoot();
    const sd = readJSON(path.join(pr2, 'agent-status.json')) || {};
    const am = sd.agents || sd;
    if (am[agentName]) {
      am[agentName].status  = code === 0 ? 'done' : 'blocked';
      am[agentName].blocker = code !== 0 ? `Exited with code ${code}` : '';
      am[agentName].updated = new Date().toISOString();
    }
    if (sd.agents) sd.agents = am; else Object.assign(sd, am);
    writeJSON(path.join(pr2, 'agent-status.json'), sd);
    broadcast('update', getFullState());
    postToChat('SYSTEM', 'System', 'system',
      `Agent ${agentName.toUpperCase()} ${code === 0 ? 'completed ✅' : `exited with code ${code} ❌`}`,
      [agentName]);
  });

  return { ok: true, pid: proc.pid };
}

function stopAllAgents() {
  let stopped = 0;
  for (const [, info] of Object.entries(agentProcesses)) {
    if (info.proc && info.proc.exitCode === null) {
      try { info.proc.kill(); stopped++; } catch {}
    }
  }
  return stopped;
}

// -- Multi-project support -----------------------------------------------

// Returns absolute path to the currently active project folder.
// Reads active-project.json on every call so switching projects is instant.
function getProjectRoot() {
  try {
    const ap = JSON.parse(fs.readFileSync(path.join(ROOT, 'active-project.json'), 'utf8'));
    const rel = ap.current || '.';
    return rel === '.' ? ROOT : path.resolve(ROOT, rel);
  } catch {
    return ROOT;
  }
}

// Lists all projects from the local projects/ folder.
// Reads requirement.json if present, falls back to PROJECT-MEMORY.md,
// then bare folder name — so every project directory is always shown.
function getProjects() {
  const projects  = [];
  const activeRoot = getProjectRoot();

  // Parse PROJECT-MEMORY.md for name/sprint/status when requirement.json is absent
  function parseMemory(folderAbs) {
    try {
      const md = fs.readFileSync(path.join(folderAbs, 'PROJECT-MEMORY.md'), 'utf8');
      const nameMatch   = md.match(/^#\s+Project Memory\s*[—-]\s*(.+)$/m);
      const sprintMatch = md.match(/\*\*Sprint\*\*:\s*(\S+)/);
      const statusMatch = md.match(/\*\*Status\*\*:\s*(\S+)/);
      return {
        name:   nameMatch   ? nameMatch[1].trim()   : null,
        sprint: sprintMatch ? sprintMatch[1].trim() : '',
        status: statusMatch ? statusMatch[1].trim() : 'pending',
      };
    } catch { return null; }
  }

  const projectsDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projectsDir)) {
    fs.readdirSync(projectsDir).sort().forEach(folder => {
      const folderAbs  = path.join(projectsDir, folder);
      try { if (!fs.statSync(folderAbs).isDirectory()) return; } catch { return; }

      const req    = readJSON(path.join(folderAbs, 'requirement.json'));
      const memory = parseMemory(folderAbs);

      const id     = (req && req.requirementId) || folder;
      const name   = (req && req.title) || (memory && memory.name) || folder;
      const sprint = (req && req.sprint) || (memory && memory.sprint) || '';
      const status = (req && req.status) || (memory && memory.status) || 'pending';

      // Read agent-status from project folder if it exists, else root
      const agentStatusPath = fs.existsSync(path.join(folderAbs, 'agent-status.json'))
        ? path.join(folderAbs, 'agent-status.json')
        : path.join(ROOT, 'agent-status.json');
      const agentStatus = readJSON(agentStatusPath) || {};
      const agentsMap   = agentStatus.agents || agentStatus;

      projects.push({
        id,
        name,
        sprint,
        status,
        path:      'projects/' + folder,
        isActive:  activeRoot === folderAbs,
        agents:    agentsMap,
        createdAt: req ? req.postedAt : null,
      });
    });
  }
  return projects;
}

// Switch the active project and broadcast the new state.
function switchActiveProject(relPath, meta) {
  const ap = { current: relPath, updatedAt: new Date().toISOString(), ...meta };
  fs.writeFileSync(path.join(ROOT, 'active-project.json'), JSON.stringify(ap, null, 2), 'utf8');
  projectsCache = null; // bust cache on switch
  // Re-init watchers for the new project root
  startWatching();
  const fullState = getFullState();
  broadcast('project-switch', { activeProject: ap, state: fullState });
  // Also broadcast 'update' so all existing SSE handlers re-render boards/dropdowns
  broadcast('update', fullState);
  console.log(`[${new Date().toLocaleTimeString()}] Project switched -> ${relPath}`);
}

// -- File watchers (dynamic, reset on project switch) --------------------
let watchers = [];
let fileCache = {};

function startWatching() {
  // Tear down existing watchers
  watchers.forEach(w => { try { w.close(); } catch {} });
  watchers = [];
  fileCache = {};

  const pr = getProjectRoot();
  const targets = ['agent-status.json', 'group-chat.json', 'requirement.json'];
  const memDir  = path.join(pr, 'agent-memory');
  if (fs.existsSync(memDir)) {
    try { fs.readdirSync(memDir).forEach(f => targets.push('agent-memory/' + f)); } catch {}
  }

  // Watch files in the active project folder
  targets.forEach(rel => {
    const abs = path.join(pr, rel);
    if (!fs.existsSync(abs)) return;
    try {
      const debounceMs = rel === 'group-chat.json' ? 50 : 300;
      const w = fs.watch(abs, () => {
        setTimeout(() => {
          try {
            const content = fs.readFileSync(abs, 'utf8');
            if (content !== fileCache[abs]) {
              fileCache[abs] = content;
              broadcast('update', getFullState());
              console.log(`[${new Date().toLocaleTimeString()}] Changed: ${rel} -> pushed to ${clients.length} client(s)`);
            }
          } catch {}
        }, debounceMs);
      });
      watchers.push(w);
    } catch {}
  });

  // Also watch ROOT agent-status.json and group-chat.json when project is in a subfolder
  // — agents write to ROOT (their cwd), so we must watch there too
  if (pr !== ROOT) {
    ['agent-status.json', 'group-chat.json'].forEach(rel => {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) return;
      try {
        const debounceMs = rel === 'group-chat.json' ? 50 : 300;
        const w = fs.watch(abs, () => {
          setTimeout(() => {
            try {
              const content = fs.readFileSync(abs, 'utf8');
              if (content !== fileCache[abs]) {
                fileCache[abs] = content;
                broadcast('update', getFullState());
                console.log(`[${new Date().toLocaleTimeString()}] ROOT Changed: ${rel} -> pushed to ${clients.length} client(s)`);
              }
            } catch {}
          }, debounceMs);
        });
        watchers.push(w);
      } catch {}
    });
  }
}

// Connected SSE clients
let clients = [];

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(c => {
    try { c.res.write(payload); return true; }
    catch { return false; }
  });
}

// Enterprise: only send last N messages to dashboard (avoids huge SSE payloads)
const CHAT_DASHBOARD_WINDOW = 50;

function getFullState() {
  const pr         = getProjectRoot();

  // Agent status: project folder is always authoritative.
  // Root-level agent-status.json only fills in agents NOT present in the project file.
  // This prevents stale root data from a previous project overwriting the current one.
  const projectStatus = readJSON(path.join(pr, 'agent-status.json')) || {};
  const rootStatus    = pr !== ROOT ? (readJSON(path.join(ROOT, 'agent-status.json')) || {}) : {};
  const projectAgents = projectStatus.agents || projectStatus;
  const rootAgents    = rootStatus.agents    || rootStatus;
  const agents = { ...projectAgents };
  for (const [name, rootEntry] of Object.entries(rootAgents)) {
    // Only use root entry if project folder has no entry for this agent at all
    if (!agents[name]) agents[name] = rootEntry;
  }
  const rawChat    = readJSON(path.join(pr, 'group-chat.json'))   || { channel: 'team-panchayat-general', messages: [] };
  const req        = readJSON(path.join(pr, 'requirement.json'))  || {};
  const memory     = {};
  try {
    fs.readdirSync(path.join(pr, 'agent-memory')).forEach(f => {
      const agent = f.replace('-memory.json', '');
      memory[agent] = readJSON(path.join(pr, 'agent-memory', f));
    });
  } catch {}
  const activeProject = readJSON(path.join(ROOT, 'active-project.json')) || { current: '.', name: 'Default' };
  const projects = getProjectsCached();

  // Windowed chat: send last CHAT_DASHBOARD_WINDOW messages + totalCount for UI
  const allMessages = rawChat.messages || [];
  const chat = {
    channel:    rawChat.channel || 'team-panchayat-general',
    totalCount: allMessages.length,
    messages:   allMessages.slice(-CHAT_DASHBOARD_WINDOW),
  };

  return { agents, chat, req, memory, activeProject, projects, timestamp: new Date().toISOString() };
}

// Respond to Tarun's chat message using a local Ollama LLM
async function respondWithOllama(userMessage, llmCfg) {
  try {
    const pr          = getProjectRoot();
    const req         = readJSON(path.join(pr, 'requirement.json')) || {};
    const statusData  = readJSON(path.join(pr, 'agent-status.json')) || {};
    const agents      = statusData.agents || statusData;
    const projectName = req.title || 'the project';
    const agentLines  = Object.entries(agents)
      .map(([n, s]) => `  ${n}: ${s.status} (${s.progress || 0}%) — ${s.task || ''}`)
      .join('\n');

    const systemPrompt =
      `You are ARJUN, PM of Team Panchayat working on "${projectName}". ` +
      `Reply in 2-3 short sentences. Be direct, professional, and use plain text (no markdown).\n` +
      `Current agent status:\n${agentLines}`;

    const endpoint = (llmCfg.endpoint || 'http://localhost:11434').replace(/\/$/, '');
    const model    = llmCfg.model || 'llama3.2';

    const resp = await fetch(`${endpoint}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
        stream: false,
      }),
    });
    if (!resp.ok) return;
    const data  = await resp.json();
    const reply = (data.message?.content || '').trim();
    if (reply) {
      postToChat('ARJUN', 'Orchestrator', 'message', `[Local LLM · ${model}] ${reply}`, ['tarun']);
      broadcast('update', getFullState());
    }
  } catch { /* Ollama not available — silently skip */ }
}

function postToChat(from, role, type, message, tags) {
  const chatFile = path.join(getProjectRoot(), 'group-chat.json');
  const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
  if (!chat.messages) chat.messages = [];
  const msg = {
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    from, role, type, message,
    tags:      tags || [],
    timestamp: new Date().toISOString(),
  };
  chat.messages.push(msg);
  writeJSON(chatFile, chat);
  // Push just the new message instantly — no file-watcher delay
  broadcast('chat-message', msg);
}

// Cache sprint-board.html at startup so it is not re-read on every request
let cachedHtml = null;
let cachedHtmlMtime = 0;
function getHtml() {
  const htmlPath = path.join(ROOT, 'sprint-board.html');
  try {
    const mtime = fs.statSync(htmlPath).mtimeMs;
    if (!cachedHtml || mtime !== cachedHtmlMtime) {
      cachedHtml = fs.readFileSync(htmlPath, 'utf8');
      cachedHtmlMtime = mtime;
    }
  } catch {}
  return cachedHtml || '';
}
// Warm the cache on startup
getHtml();

// ── Auto-configure from environment variables (Docker mode) ─────────────────
// When OLLAMA_ENDPOINT is set (e.g. in docker-compose.ollama.yml),
// pre-write connections.json so the dashboard is ready without manual setup.
(function autoConfigFromEnv() {
  const ollamaEndpoint  = process.env.OLLAMA_ENDPOINT;
  const ollamaModel     = process.env.OLLAMA_MODEL     || 'qwen2.5-coder:7b';
  const useForAgents    = process.env.OLLAMA_USE_FOR_AGENTS === 'true';
  const useForChat      = process.env.OLLAMA_USE_FOR_CHAT   === 'true';
  const llmMode         = process.env.LLM_MODE          || 'claude';

  if (!ollamaEndpoint) return; // Claude mode — no auto-config needed

  const connPath = path.join(ROOT, 'connections.json');
  const existing = readJSON(connPath) || {};

  // Only write if not already set to avoid overwriting user customisations
  if (existing.localLLM && existing.localLLM.endpoint === ollamaEndpoint) return;

  existing.localLLM = {
    enabled:      true,
    endpoint:     ollamaEndpoint,
    model:        ollamaModel,
    useForAgents: useForAgents,
    useForChat:   useForChat,
  };
  writeJSON(connPath, existing);
  console.log(`[AutoConfig] Ollama configured: ${ollamaEndpoint} model=${ollamaModel} agents=${useForAgents} chat=${useForChat}`);
})();

// ── Auto-configure Hybrid mode from environment (docker-compose.hybrid.yml) ──
(function autoConfigHybridFromEnv() {
  if (process.env.HYBRID_ENABLED !== 'true') return;
  const connPath = path.join(ROOT, 'connections.json');
  const existing = readJSON(connPath) || {};
  if (existing.hybrid && existing.hybrid.enabled) return; // already set by user
  existing.hybrid = {
    enabled:          true,
    mode:             process.env.HYBRID_MODE             || 'ollama-first',
    ollamaEndpoint:   process.env.HYBRID_OLLAMA_ENDPOINT  || 'http://ollama:11434',
    ollamaModel:      process.env.HYBRID_OLLAMA_MODEL     || 'qwen2.5-coder:7b',
    claudeModel:      process.env.HYBRID_CLAUDE_MODEL     || 'claude-sonnet-4-6',
    qualityThreshold: parseInt(process.env.HYBRID_QUALITY_THRESHOLD || '75', 10),
    claudeOnFail:     true,
  };
  writeJSON(connPath, existing);
  const h = existing.hybrid;
  console.log(`[AutoConfig] Hybrid LLM configured: mode=${h.mode} threshold=${h.qualityThreshold} ollama=${h.ollamaModel} claude=${h.claudeModel}`);
})();

// ── Auto-configure OpenAI-compatible mode from environment ───────────────────
(function autoConfigOpenAIFromEnv() {
  const oaiEnabled  = process.env.OPENAI_COMPAT_ENABLED === 'true';
  if (!oaiEnabled) return;
  const connPath = path.join(ROOT, 'connections.json');
  const existing = readJSON(connPath) || {};
  if (existing.openaiCompat && existing.openaiCompat.enabled) return;
  const provider = process.env.OPENAI_PROVIDER || 'openai'; // 'openai' | 'azure' | 'custom'
  existing.openaiCompat = {
    enabled:         true,
    provider,
    endpoint:        process.env.OPENAI_ENDPOINT        || (provider === 'azure' ? '' : 'https://api.openai.com/v1'),
    apiKey:          process.env.OPENAI_API_KEY          || process.env.AZURE_OPENAI_KEY || '',
    model:           process.env.OPENAI_MODEL            || 'gpt-4o',
    azureDeployment: process.env.AZURE_DEPLOYMENT        || '',
    azureApiVersion: process.env.AZURE_API_VERSION       || '2024-02-01',
  };
  writeJSON(connPath, existing);
  const c = existing.openaiCompat;
  console.log(`[AutoConfig] OpenAI-compat configured: provider=${c.provider} endpoint=${c.endpoint} model=${c.model}`);
})();

// Cache getProjects() — only invalidates on project switch or every 10s
let projectsCache = null;
let projectsCacheAt = 0;
const PROJECTS_CACHE_TTL = 10000;
function getProjectsCached() {
  const now = Date.now();
  if (!projectsCache || now - projectsCacheAt > PROJECTS_CACHE_TTL) {
    projectsCache = getProjects();
    projectsCacheAt = now;
  }
  return projectsCache;
}

// Start watching files for the active project
startWatching();

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
};

// CORS headers helper
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Read body helper
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) reject(new Error('Body too large')); });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    cors(res); res.writeHead(204); res.end(); return;
  }

  // -- SSE endpoint ----------------------------------------------
  if (pathname === '/events') {
    cors(res);
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('retry: 2000\n\n');
    const state = getFullState();
    res.write(`event: init\ndata: ${JSON.stringify(state)}\n\n`);
    const client = { id: Date.now(), res };
    clients.push(client);
    console.log(`[${new Date().toLocaleTimeString()}] Client connected (${clients.length} total)`);
    req.on('close', () => {
      clients = clients.filter(c => c.id !== client.id);
      console.log(`[${new Date().toLocaleTimeString()}] Client disconnected (${clients.length} remaining)`);
    });
    return;
  }

  // -- API: current state -----------------------------------------
  if (pathname === '/api/state') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getFullState(), null, 2));
    return;
  }

  // -- Static file server: /uploads/<filename> -------------------
  if (pathname.startsWith('/uploads/')) {
    const filename  = path.basename(decodeURIComponent(pathname.slice('/uploads/'.length)));
    const filePath  = path.join(UPLOADS_DIR, filename);
    if (!filePath.startsWith(UPLOADS_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
      webp:'image/webp', svg:'image/svg+xml', pdf:'application/pdf',
      json:'application/json', txt:'text/plain', md:'text/markdown',
      js:'text/javascript', py:'text/plain', tf:'text/plain', hcl:'text/plain',
      yml:'text/plain', yaml:'text/plain', sh:'text/plain', ps1:'text/plain',
      zip:'application/zip', gz:'application/gzip',
    };
    res.writeHead(200, {
      'Content-Type':        mimeTypes[ext] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control':       'public, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // -- API: MCP config (GET + POST) --------------------------------
  if (pathname === '/api/mcp/config') {
    cors(res);
    const CONN_FILE    = path.join(ROOT, 'connections.json');
    const CLAUDE_DIR   = path.join(ROOT, '.claude');
    const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

    if (req.method === 'GET') {
      const cfg = readJSON(CONN_FILE) || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        db:       cfg.database?.url      || '',
        dbType:   cfg.database?.type     || 'postgres',
        gh:       cfg.github?.token      || '',
        ghOwner:  cfg.github?.owner      || '',
        aws:      cfg.aws?.region        || '',
        mysql:    cfg.mysql?.url         || '',
        oracle:   cfg.oracle?.url        || '',
        sqlite:   cfg.sqlite?.path       || '',
        custom:   cfg.custom?.mcpUrl     || '',
      }));
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const existing = readJSON(CONN_FILE) || {};

        // Save raw credentials
        if (body.db !== undefined)     { existing.database = { ...existing.database, url: body.db, type: body.dbType || 'postgres' }; }
        if (body.gh !== undefined)     { existing.github   = { ...existing.github,   token: body.gh, owner: body.ghOwner || '' }; }
        if (body.aws !== undefined)    { existing.aws      = { ...existing.aws,      region: body.aws }; }
        if (body.mysql !== undefined)  { existing.mysql    = { ...existing.mysql,    url: body.mysql }; }
        if (body.oracle !== undefined) { existing.oracle   = { ...existing.oracle,   url: body.oracle }; }
        if (body.sqlite !== undefined) { existing.sqlite   = { ...existing.sqlite,   path: body.sqlite }; }
        if (body.custom !== undefined) { existing.custom   = { ...existing.custom,   mcpUrl: body.custom }; }
        writeJSON(CONN_FILE, existing);

        // Build mcpServers block for .claude/settings.json
        const settings  = readJSON(SETTINGS_FILE) || {};
        const mcpServers = settings.mcpServers || {};

        // PostgreSQL
        if (existing.database?.url) {
          mcpServers['postgres'] = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', existing.database.url] };
        } else { delete mcpServers['postgres']; }

        // MySQL
        if (existing.mysql?.url) {
          mcpServers['mysql'] = { command: 'npx', args: ['-y', 'mcp-server-mysql', '--url', existing.mysql.url] };
        } else { delete mcpServers['mysql']; }

        // Oracle
        if (existing.oracle?.url) {
          mcpServers['oracle'] = { command: 'npx', args: ['-y', 'mcp-server-oracle', '--url', existing.oracle.url] };
        } else { delete mcpServers['oracle']; }

        // SQLite
        if (existing.sqlite?.path) {
          mcpServers['sqlite'] = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', existing.sqlite.path] };
        } else { delete mcpServers['sqlite']; }

        // GitHub
        if (existing.github?.token) {
          mcpServers['github'] = {
            command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: existing.github.token }
          };
        } else { delete mcpServers['github']; }

        // Custom MCP
        if (existing.custom?.mcpUrl) {
          mcpServers['custom'] = { command: 'npx', args: ['-y', 'mcp-remote', existing.custom.mcpUrl] };
        } else { delete mcpServers['custom']; }

        settings.mcpServers = mcpServers;
        if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
        writeJSON(SETTINGS_FILE, settings);

        const activeCount = Object.keys(mcpServers).length;
        console.log(`[${new Date().toLocaleTimeString()}] MCP config saved — ${activeCount} server(s) active`);
        postToChat('SYSTEM', 'System', 'system',
          `🔌 MCP config updated — ${activeCount} server(s) active: ${Object.keys(mcpServers).join(', ') || 'none'}. Agents will use these on next launch.`,
          ['all-agents']);
        broadcast('update', getFullState());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, active: Object.keys(mcpServers) }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
  }

  // -- API: Local LLM config (GET + POST) ---------------------------
  if (pathname === '/api/llm/config') {
    cors(res);
    const CONN_FILE = path.join(ROOT, 'connections.json');
    if (req.method === 'GET') {
      const cfg = (readJSON(CONN_FILE) || {}).localLLM || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled:           cfg.enabled           || false,
        useForAgents:      cfg.useForAgents      || false,
        endpoint:          cfg.endpoint          || 'http://localhost:11434',
        model:             cfg.model             || 'qwen2.5-coder:7b',
        feedbackLoop:      cfg.feedbackLoop      || false,
        maxIterations:     cfg.maxIterations     || 3,
        feedbackThreshold: cfg.feedbackThreshold || 75,
      }));
      return;
    }
    if (req.method === 'POST') {
      try {
        const body     = JSON.parse(await readBody(req));
        const existing = readJSON(CONN_FILE) || {};
        existing.localLLM = {
          enabled:           body.enabled           !== undefined ? body.enabled           : (existing.localLLM?.enabled           || false),
          useForAgents:      body.useForAgents      !== undefined ? body.useForAgents      : (existing.localLLM?.useForAgents      || false),
          endpoint:          body.endpoint          || existing.localLLM?.endpoint         || 'http://localhost:11434',
          model:             body.model             || existing.localLLM?.model            || 'qwen2.5-coder:7b',
          feedbackLoop:      body.feedbackLoop      !== undefined ? body.feedbackLoop      : (existing.localLLM?.feedbackLoop      || false),
          maxIterations:     body.maxIterations     !== undefined ? body.maxIterations     : (existing.localLLM?.maxIterations     || 3),
          feedbackThreshold: body.feedbackThreshold !== undefined ? body.feedbackThreshold : (existing.localLLM?.feedbackThreshold || 75),
        };
        writeJSON(CONN_FILE, existing);
        const modes = [existing.localLLM.enabled && 'chat', existing.localLLM.useForAgents && 'agents'].filter(Boolean);
        const status = modes.length ? `active for: ${modes.join(' + ')}` : 'disabled';
        postToChat('SYSTEM', 'System', 'system',
          `🦙 Local LLM (${existing.localLLM.model}) ${status}. Endpoint: ${existing.localLLM.endpoint}`,
          ['tarun']);
        broadcast('update', getFullState());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: existing.localLLM }));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
      return;
    }
  }

  // -- API: Test Ollama connection -----------------------------------
  if (pathname === '/api/llm/test' && req.method === 'POST') {
    cors(res);
    try {
      const body     = JSON.parse(await readBody(req));
      const endpoint = (body.endpoint || 'http://localhost:11434').replace(/\/$/, '');
      const model    = body.model || 'llama3.2';
      const r = await fetch(`${endpoint}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], stream: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, reply: data.message?.content || 'ok' }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // -- API: Hybrid LLM config (GET/POST) ─────────────────────────
  if (pathname === '/api/hybrid/config') {
    cors(res);
    if (req.method === 'GET') {
      const cfg = (readJSON(CONN_FILE) || {}).hybrid || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.assign({}, HYBRID_DEFAULTS, cfg)));
      return;
    }
    if (req.method === 'POST') {
      try {
        const body     = JSON.parse(await readBody(req));
        const existing = readJSON(CONN_FILE) || {};
        existing.hybrid = Object.assign({}, HYBRID_DEFAULTS, existing.hybrid || {}, body);
        writeJSON(CONN_FILE, existing);
        const h = existing.hybrid;
        const modeLabel = { 'ollama-first': 'Ollama-first → Claude upgrade', 'claude-review': 'Ollama draft → Claude always reviews', 'router': 'Router by complexity' }[h.mode] || h.mode;
        if (h.enabled) {
          postToChat('SYSTEM', 'System', 'system',
            `🔀 Hybrid LLM enabled — Mode: ${modeLabel} | Threshold: ${h.qualityThreshold}/100 | Ollama: ${h.ollamaModel} → Claude: ${h.claudeModel}`,
            ['tarun']);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: existing.hybrid }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
  }

  // -- API: Hybrid LLM test (ping both Ollama + Claude) -----------
  if (pathname === '/api/hybrid/test' && req.method === 'POST') {
    cors(res);
    try {
      const body    = JSON.parse(await readBody(req));
      const results = { ollama: null, claude: null };

      // Test Ollama
      try {
        const ep  = (body.ollamaEndpoint || 'http://localhost:11434').replace(/\/$/, '');
        const r   = await fetch(`${ep}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: body.ollamaModel || 'qwen2.5-coder:7b',
            messages: [{ role: 'user', content: 'ping' }], stream: false }),
        });
        results.ollama = r.ok ? { ok: true, reply: ((await r.json()).message?.content || 'ok').slice(0, 80) }
                               : { ok: false, error: `HTTP ${r.status}` };
      } catch (e) { results.ollama = { ok: false, error: e.message }; }

      // Test Claude
      try {
        const apiKey = body.claudeApiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('No ANTHROPIC_API_KEY');
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: body.claudeModel || 'claude-sonnet-4-6', max_tokens: 32,
            messages: [{ role: 'user', content: 'ping' }] }),
        });
        const d = await r.json();
        results.claude = r.ok ? { ok: true, reply: d.content?.[0]?.text?.slice(0, 80) || 'ok' }
                               : { ok: false, error: d.error?.message || `HTTP ${r.status}` };
      } catch (e) { results.claude = { ok: false, error: e.message }; }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: OpenAI-compat config (GET/POST) -----------------------
  if (pathname === '/api/openai/config') {
    cors(res);
    if (req.method === 'GET') {
      const cfg = (readJSON(CONN_FILE) || {}).openaiCompat || {};
      const safe = Object.assign({}, OPENAI_COMPAT_DEFAULTS, cfg);
      delete safe.apiKey; // never return key to browser
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(safe));
      return;
    }
    if (req.method === 'POST') {
      try {
        const body     = JSON.parse(await readBody(req));
        const existing = readJSON(CONN_FILE) || {};
        existing.openaiCompat = Object.assign({}, OPENAI_COMPAT_DEFAULTS, existing.openaiCompat || {}, body);
        writeJSON(CONN_FILE, existing);
        const c = existing.openaiCompat;
        if (c.enabled) {
          const label = c.provider === 'azure' ? `Azure OpenAI (${c.azureDeployment || c.model})` : `OpenAI (${c.model})`;
          postToChat('SYSTEM', 'System', 'system',
            `🟢 ${label} enabled — endpoint: ${c.endpoint}`, ['tarun']);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
  }

  // -- API: OpenAI-compat test ------------------------------------
  if (pathname === '/api/openai/test' && req.method === 'POST') {
    cors(res);
    try {
      const body = JSON.parse(await readBody(req));
      const cfg  = Object.assign({}, OPENAI_COMPAT_DEFAULTS, body);
      const { url, headers } = buildOpenAICompatRequest(cfg);
      const r = await fetch(url, {
        method:  'POST',
        headers,
        body: JSON.stringify({
          model:       cfg.provider === 'azure' ? undefined : cfg.model,
          messages:    [{ role: 'user', content: 'Say "pong" only.' }],
          max_tokens:  10,
          temperature: 0,
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `HTTP ${r.status}: ${errText.slice(0, 150)}` }));
        return;
      }
      const data  = await r.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || 'ok';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, reply, model: data.model || cfg.model }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // -- API: context file upload ------------------------------------
  if (pathname === '/api/project/upload-context' && req.method === 'POST') {
    cors(res);
    try {
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) { res.writeHead(400); res.end('Missing boundary'); return; }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);

      // Parse multipart: extract projectId and files
      const parts = raw.toString('binary').split('--' + boundary);
      let projectId = '';
      const savedFiles = [];

      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd < 0) continue;
        const header  = part.slice(0, headerEnd);
        const bodyRaw = part.slice(headerEnd + 4, part.endsWith('\r\n') ? -2 : undefined);

        const nameMatch = header.match(/name="([^"]+)"/);
        const fileMatch = header.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;

        if (nameMatch[1] === 'projectId' && !fileMatch) {
          projectId = bodyRaw.replace(/\r?\n$/, '');
          continue;
        }

        if (fileMatch) {
          const fname   = fileMatch[1].replace(/[^a-zA-Z0-9._-]/g, '_');
          const projDir = projectId
            ? path.join(ROOT, 'projects', projectId, 'context')
            : path.join(ROOT, 'chat-uploads', 'context');
          if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });
          const savePath = path.join(projDir, fname);
          fs.writeFileSync(savePath, Buffer.from(bodyRaw, 'binary'));
          savedFiles.push(fname);
          console.log(`[${new Date().toLocaleTimeString()}] Context file saved: ${savePath}`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, saved: savedFiles }));
    } catch (e) {
      console.error('[upload-context]', e);
      res.writeHead(500); res.end('Upload failed');
    }
    return;
  }

  // -- API: post to group chat ------------------------------------
  if (pathname === '/api/chat' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const msg  = JSON.parse(body);
      // Normalise: accept either 'from' or 'sender' field
      if (!msg.from && msg.sender) msg.from = msg.sender;
      if (!msg.role)      msg.role      = 'user';
      if (!msg.type)      msg.type      = 'message';
      msg.id        = `msg-${Date.now()}-web`;
      msg.timestamp = new Date().toISOString();

      // Save file attachments to chat-uploads/ and replace base64 data with URLs
      if (Array.isArray(msg.attachments) && msg.attachments.length) {
        msg.attachments = msg.attachments.map((att, idx) => {
          if (!att.data) return att;  // already a URL reference
          try {
            // Parse dataURL: "data:<mime>;base64,<data>"
            const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) return att;
            const mimeType = match[1];
            const b64Data  = match[2];
            const buf      = Buffer.from(b64Data, 'base64');

            // Build safe filename: timestamp-index-originalname
            const safeName = `${msg.id}-${idx}-${att.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const savePath = path.join(UPLOADS_DIR, safeName);
            fs.writeFileSync(savePath, buf);

            // Return attachment without raw base64 -- just the URL
            return { name: att.name, mimeType: mimeType || att.mimeType, size: att.size, url: `/uploads/${safeName}` };
          } catch (e) {
            console.error('[upload] Failed to save attachment:', att.name, e.message);
            return { name: att.name, mimeType: att.mimeType, size: att.size, error: 'save failed' };
          }
        });
        console.log(`[${new Date().toLocaleTimeString()}] Saved ${msg.attachments.length} attachment(s) for message ${msg.id}`);
      }

      const chatFile = path.join(getProjectRoot(), 'group-chat.json');
      const chat = readJSON(chatFile) || { channel: 'team-panchayat-general', messages: [] };
      if (!chat.messages) chat.messages = [];
      chat.messages.push(msg);
      writeJSON(chatFile, chat);
      // Push to all clients instantly
      broadcast('chat-message', msg);

      // Auto-relaunch any agent mentioned by name in Tarun's message
      // Auto-respond via local LLM when no agent is being mentioned
      if (msg.from === 'TARUN' && msg.message) {
        const llmCfg = (readJSON(path.join(ROOT, 'connections.json')) || {}).localLLM || {};
        if (llmCfg.enabled) respondWithOllama(msg.message, llmCfg);
      }

      if (msg.from === 'TARUN' && msg.message) {
        const mentioned = AGENTS.filter(a => a !== 'keerthi' &&
          new RegExp(`\\b${a}\\b`, 'i').test(msg.message));
        for (const agentName of mentioned) {
          const pr = getProjectRoot();
          const sd = readJSON(path.join(pr, 'agent-status.json')) || {};
          const am = sd.agents || sd;
          // Only relaunch if agent is done or not running
          const isRunning = agentProcesses[agentName] &&
            agentProcesses[agentName].proc &&
            agentProcesses[agentName].proc.exitCode === null;
          if (!isRunning) {
            // Extract first sentence of task from message
            const taskHint = msg.message.split(/[.\n]/)[0].trim().substring(0, 100);
            am[agentName] = { status: 'wip', progress: 5, task: taskHint, blocker: '', updated: new Date().toISOString() };
            if (sd.agents) sd.agents = am; else Object.assign(sd, am);
            writeJSON(path.join(pr, 'agent-status.json'), sd);
            broadcast('update', getFullState());
            postToChat('SYSTEM', 'System', 'system',
              `🚀 Auto-launching ${agentName.toUpperCase()} — new task detected in Tarun's message.`,
              [agentName]);
            launchAgent(agentName);
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: get permissions (tool-permissions.json + .claude/settings.json) --
  if (pathname === '/api/permissions' && req.method === 'GET') {
    cors(res);
    const toolPerms    = readJSON(path.join(ROOT, 'tool-permissions.json')) || {};
    const claudeSettings = readJSON(path.join(ROOT, '.claude', 'settings.json')) || { permissions: { allow: [], deny: [] } };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ toolPerms, claudeSettings }));
    return;
  }

  // -- API: save permissions -----------------------------------------------
  if (pathname === '/api/permissions' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);

      // Save tool-permissions.json if provided
      if (data.toolPerms) {
        data.toolPerms._author    = 'Tarun Vangari (tarun.vangari@gmail.com)';
        data.toolPerms.global     = data.toolPerms.global || {};
        data.toolPerms.global.lastUpdated = new Date().toISOString();
        writeJSON(path.join(ROOT, 'tool-permissions.json'), data.toolPerms);
        console.log(`[${new Date().toLocaleTimeString()}] tool-permissions.json updated`);
      }

      // Save .claude/settings.json if provided
      if (data.claudeSettings) {
        const claudeDir = path.join(ROOT, '.claude');
        if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir);
        writeJSON(path.join(claudeDir, 'settings.json'), data.claudeSettings);
        console.log(`[${new Date().toLocaleTimeString()}] .claude/settings.json updated`);
      }

      // Notify agents of permission change via group chat
      postToChat('TARUN', 'Product Owner', 'broadcast',
        'Agent permissions updated by Tarun. Re-read .claude/settings.json if you are in an active session.',
        ['permissions', 'all-agents']);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: post new requirement (from wizard) --------------------
  if (pathname === '/api/requirement' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const req_id = `REQ-${Date.now()}`;
      const reqObj = {
        requirementId:   req_id,
        postedBy:        'Tarun Vangari',
        postedAt:        new Date().toISOString(),
        sprint:          data.sprint       || '',
        type:            data.type         || 'new_feature',
        title:           data.title        || '',
        description:     data.description  || '',
        businessGoal:    data.businessGoal || '',
        targetUsers:     data.targetUsers  || '',
        techConstraints: Array.isArray(data.techConstraints) ? data.techConstraints
                         : (data.techConstraints || '').split(',').map(s => s.trim()).filter(Boolean),
        deadline:        data.deadline     || '',
        priority:        data.priority     || 'medium',
        status:          'pending_analysis',
        discoveryComplete: false,
        discoveryPhase:  { currentRound: 0, roundStatus: 'not_started', fastTrack: false, startedAt: '' },
        discoveryAnswers: { round1: {}, round2: {}, round3: {} },
        productBrief:    {},
        agentInputs:     Object.fromEntries(
          AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])
        ),
        sprintPlan:      '',
        approvedByTarun: false,
      };

      // For new_project: create a dedicated project folder under projects/
      let pr = getProjectRoot();
      let projectSlug = null;
      if (data.type === 'new_project' && data.title) {
        projectSlug = data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50)
          + '-' + Date.now();
        const projectsDir = path.join(ROOT, 'projects');
        if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });
        pr = path.join(projectsDir, projectSlug);
        fs.mkdirSync(pr, { recursive: true });
      }

      writeJSON(path.join(pr, 'requirement.json'), reqObj);

      // Reset agent statuses
      const statusData = readJSON(path.join(pr, 'agent-status.json')) || { agents: {} };
      statusData.sprint = data.sprint || statusData.sprint || '';
      AGENTS.forEach(a => {
        statusData.agents[a] = {
          status: 'queue', progress: 0,
          task: 'Awaiting requirement analysis',
          blocker: '', updated: new Date().toISOString(),
        };
      });
      writeJSON(path.join(pr, 'agent-status.json'), statusData);

      // Switch active project to the new folder (must happen after files are written)
      if (projectSlug) {
        switchActiveProject('projects/' + projectSlug, {
          name:   data.title,
          sprint: data.sprint || '01',
        });
      }

      // Post to group chat
      postToChat('TARUN', 'Product Owner', 'requirement',
        `NEW REQUIREMENT [${req_id}] "${reqObj.title}" | Sprint-${reqObj.sprint} | Priority: ${reqObj.priority.toUpperCase()}`,
        ['requirement', `sprint-${reqObj.sprint}`]);
      postToChat('TARUN', 'Product Owner', 'broadcast',
        `${reqObj.description}${reqObj.businessGoal ? ' | Goal: ' + reqObj.businessGoal : ''}${reqObj.targetUsers ? ' | Users: ' + reqObj.targetUsers : ''}${reqObj.techConstraints.length ? ' | Constraints: ' + reqObj.techConstraints.join(', ') : ''}`,
        ['requirement-detail']);
      postToChat('ARJUN', 'Orchestrator', 'broadcast',
        `All agents - new requirement received: "${reqObj.title}". Read requirement.json and post your analysis.`,
        ['action-required', 'all-agents']);
      postToChat('ARJUN', 'Orchestrator', 'system',
        `🚀 Analysis started for "${reqObj.title}"! I'm spinning up the discovery phase now — Vikram, Rasool, Kiran, Kavya, Rohan: please review requirement.json and report your estimates back here. Keerthi stands by for QA once all agents are done.`,
        ['analysis-started', 'all-agents']);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, requirementId: req_id, projectId: projectSlug || path.basename(pr) }));

      // Auto-launch Arjun (PM/Orchestrator) immediately after project creation
      // so discovery kicks off without needing to click "Launch Agents"
      setTimeout(() => {
        postToChat('SYSTEM', 'System', 'system',
          `🤖 Auto-launching ARJUN to begin discovery for "${reqObj.title}"…`,
          ['auto-launch', 'arjun']);
        launchAgent('arjun');
      }, 500);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: approve sprint plan -----------------------------------
  if (pathname === '/api/requirement/approve' && req.method === 'POST') {
    cors(res);
    try {
      const pr     = getProjectRoot();
      const reqObj = readJSON(path.join(pr, 'requirement.json'));
      if (!reqObj || !reqObj.requirementId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No active requirement' })); return;
      }
      reqObj.approvedByTarun = true;
      reqObj.status = 'in_sprint';
      writeJSON(path.join(pr, 'requirement.json'), reqObj);

      // Move non-keerthi agents to wip
      const statusData = readJSON(path.join(pr, 'agent-status.json')) || { agents: {} };
      ['arjun','vikram','rasool','kavya','kiran','rohan'].forEach(a => {
        if (statusData.agents[a]) statusData.agents[a].status = 'wip';
      });
      writeJSON(path.join(pr, 'agent-status.json'), statusData);

      postToChat('TARUN', 'Product Owner', 'broadcast',
        'SPRINT PLAN APPROVED by Tarun. All agents - sprint is GO. Begin execution now.',
        ['approved', `sprint-${reqObj.sprint}`]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: Vikram approve architecture ---------------------------
  if (pathname === '/api/agent/vikram/approve-architecture' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const pr   = getProjectRoot();
      writeJSON(path.join(pr, 'arch-approved.json'), {
        approved: true, approvedAt: new Date().toISOString(),
        approvedBy: 'Tarun', comments: data.comments || '',
      });
      postToChat('TARUN', 'Product Owner', 'broadcast',
        '✅ Architecture approved! Vikram — please proceed with Terraform/Docker implementation.',
        ['architecture', 'approved']);
      launchAgent('vikram');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: Vikram request architecture changes -------------------
  if (pathname === '/api/agent/vikram/request-arch-changes' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const pr   = getProjectRoot();
      const approvedPath = path.join(pr, 'arch-approved.json');
      if (fs.existsSync(approvedPath)) fs.unlinkSync(approvedPath);
      postToChat('TARUN', 'Product Owner', 'feedback',
        `🔄 Architecture changes requested: ${data.comments || 'Please revise the architecture.'}`,
        ['architecture', 'changes-requested', 'vikram']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: Rasool DB schema (read docs/db-schema.md) -------------
  if (pathname === '/api/agent/rasool/db-schema' && req.method === 'GET') {
    cors(res);
    try {
      const pr         = getProjectRoot();
      const schemaPath = path.join(pr, 'docs', 'db-schema.md');
      const archPath   = path.join(pr, 'docs', 'architecture.md');
      const approved   = readJSON(path.join(pr, 'arch-approved.json'));
      const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : null;
      const arch   = fs.existsSync(archPath)   ? fs.readFileSync(archPath, 'utf8')   : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        schema, arch,
        archApproved: !!(approved && approved.approved),
        archComments: (approved && approved.comments) || '',
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: list all projects -------------------------------------
  if (pathname === '/api/projects' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ projects: getProjects() }));
    return;
  }

  // -- API: switch active project ---------------------------------
  if (pathname === '/api/switch-project' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      if (!data.path) { res.writeHead(400); res.end(JSON.stringify({ error: 'path required' })); return; }
      const absTarget = data.path === '.' ? ROOT : path.resolve(ROOT, data.path);
      if (!fs.existsSync(path.join(absTarget, 'requirement.json'))) {
        res.writeHead(404); res.end(JSON.stringify({ error: 'No requirement.json at that path' })); return;
      }
      const req2 = readJSON(path.join(absTarget, 'requirement.json'));
      switchActiveProject(data.path, {
        id:          req2.requirementId || '',
        name:        req2.title         || data.path,
        sprint:      req2.sprint        || '',
        status:      req2.status        || 'pending',
        description: req2.description   || '',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, active: data.path }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: scaffold + switch to next project --------------------
  // POST /api/next-project  { title, sprint, description, priority }
  if (pathname === '/api/next-project' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const reqId  = 'REQ-' + Date.now();
      const slug   = (data.title || 'new-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const folder = reqId + '-' + slug;
      const absDir = path.join(ROOT, 'projects', folder);

      fs.mkdirSync(absDir, { recursive: true });
      ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
        fs.mkdirSync(path.join(absDir, d), { recursive: true });
      });

      const newReq = {
        requirementId:   reqId,
        postedBy:        'Tarun Vangari',
        postedAt:        new Date().toISOString(),
        sprint:          data.sprint      || '02',
        type:            data.type        || 'new_feature',
        title:           data.title       || 'New Project',
        description:     data.description || '',
        businessGoal:    data.businessGoal|| '',
        targetUsers:     data.targetUsers || '',
        techConstraints: data.techConstraints || [],
        deadline:        data.deadline    || '',
        priority:        data.priority    || 'medium',
        status:          'pending_analysis',
        discoveryComplete: false,
        discoveryPhase:   { currentRound: 0, roundStatus: 'not_started', fastTrack: false, startedAt: '' },
        discoveryAnswers: { round1: {}, round2: {}, round3: {} },
        productBrief:    {},
        agentInputs:     Object.fromEntries(AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])),
        sprintPlan:      '',
        approvedByTarun: false,
      };
      writeJSON(path.join(absDir, 'requirement.json'), newReq);

      const newStatus = {
        sprint: newReq.sprint,
        lastSync: new Date().toISOString(),
        agents: Object.fromEntries(AGENTS.map(a => [a, { status: 'queue', progress: 0, task: 'Awaiting requirement', blocker: '', updated: new Date().toISOString() }])),
      };
      writeJSON(path.join(absDir, 'agent-status.json'), newStatus);
      writeJSON(path.join(absDir, 'group-chat.json'), { channel: 'team-panchayat-general', messages: [] });

      const relPath = 'projects/' + folder;
      switchActiveProject(relPath, { id: reqId, name: newReq.title, sprint: newReq.sprint, status: 'pending_analysis', description: newReq.description });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, projectPath: relPath, requirementId: reqId }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: launch agents ------------------------------------------
  if (pathname === '/api/launch-agents' && req.method === 'POST') {
    cors(res);
    try {
      const body = await readBody(req);
      const data = JSON.parse(body || '{}');
      const targets = Array.isArray(data.agents) ? data.agents : AGENTS.filter(a => a !== 'keerthi');
      const results = {};
      for (const a of targets) results[a] = launchAgent(a);
      postToChat('SYSTEM', 'System', 'broadcast',
        `🚀 Launching agents: ${targets.join(', ')} — check the agent cards for live progress.`,
        ['system', 'all-agents']);
      broadcast('update', getFullState());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, results }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // -- API: stop agents --------------------------------------------
  if (pathname === '/api/stop-agents' && req.method === 'POST') {
    cors(res);
    const stopped = stopAllAgents();
    postToChat('SYSTEM', 'System', 'broadcast',
      `⏹ ${stopped} agent process(es) stopped by Tarun.`, ['system']);
    broadcast('update', getFullState());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, stopped }));
    return;
  }

  // -- API: activate Keerthi QA ------------------------------------
  if (pathname === '/api/agent/keerthi/activate' && req.method === 'POST') {
    cors(res);
    const pr = getProjectRoot();
    const statusData = readJSON(path.join(pr, 'agent-status.json')) || {};
    const agentsMap = statusData.agents || statusData;
    agentsMap['keerthi'] = {
      status: 'wip',
      progress: 5,
      task: 'QA gates starting — reviewing all agent outputs',
      blocker: '',
      updated: new Date().toISOString()
    };
    if (statusData.agents) statusData.agents = agentsMap; else Object.assign(statusData, agentsMap);
    writeJSON(path.join(pr, 'agent-status.json'), statusData);
    broadcast('update', getFullState());
    postToChat('KEERTHI', 'QA Engineer', 'broadcast',
      '🟢 Keerthi QA activated — running quality gates across all agent outputs.', ['all-agents']);
    const launch = launchAgent('keerthi');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, launch }));
    return;
  }

  // -- API: agent process status -----------------------------------
  if (pathname === '/api/agent-processes' && req.method === 'GET') {
    cors(res);
    const status = {};
    for (const [name, info] of Object.entries(agentProcesses)) {
      status[name] = {
        running:    info.proc && info.proc.exitCode === null,
        pid:        info.pid,
        startedAt:  info.startedAt,
        exitCode:   info.proc ? info.proc.exitCode : null,
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  // -- API: Agent log SSE stream ----------------------------------
  if (pathname.startsWith('/api/logs/') && pathname.endsWith('/stream') && req.method === 'GET') {
    cors(res);
    const agentName = pathname.split('/')[3];
    const logFile   = path.join(LOGS_DIR, `${agentName}.log`);
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    const send = (type, content) => res.write(`data: ${JSON.stringify({ type, content })}\n\n`);

    // Send existing content
    try {
      const existing = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : `No log file found for ${agentName}.`;
      send('init', existing);
    } catch { send('init', 'Error reading log file.'); }

    // Watch for new lines
    let lastSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    const watcher = setInterval(() => {
      try {
        if (!fs.existsSync(logFile)) return;
        const size = fs.statSync(logFile).size;
        if (size > lastSize) {
          const fd = fs.openSync(logFile, 'r');
          const buf = Buffer.alloc(size - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          fs.closeSync(fd);
          send('append', buf.toString('utf8'));
          lastSize = size;
        }
      } catch {}
    }, 1000);

    req.on('close', () => clearInterval(watcher));
    return;
  }

  // -- Static files -----------------------------------------------
  // Serve sprint-board.html (the active Kanban dashboard) at /
  let filePath = (pathname === '/' || pathname === '/index.html') ? '/sprint-board.html' : pathname;

  // Inject SSE client into the sprint-board
  if (filePath === '/sprint-board.html' || filePath === '/sprint-dashboard.html') {
    try {
      let html = getHtml();
      const liveScript = `<script>
/* ADLC Live Dashboard -- SSE auto-connect injected by dashboard-server.js */
(function(){
  const PORT = ${PORT};
  let src;
  function connect(){
    src = new EventSource('http://localhost:' + PORT + '/events');
    src.addEventListener('init',           e => { window.dispatchEvent(new CustomEvent('panchayat-state',   {detail: JSON.parse(e.data)})); showStatus('live'); });
    src.addEventListener('update',         e => { window.dispatchEvent(new CustomEvent('panchayat-state',   {detail: JSON.parse(e.data)})); flashStatus(); });
    src.addEventListener('project-switch', e => { const d = JSON.parse(e.data); window.dispatchEvent(new CustomEvent('panchayat-state', {detail: d.state})); flashStatus(); });
    src.addEventListener('chat-message',   e => { window.dispatchEvent(new CustomEvent('panchayat-chat-msg',{detail: JSON.parse(e.data)})); flashStatus(); });
    src.onerror = () => { showStatus('error'); setTimeout(connect, 3000); };
  }
  function showStatus(s){
    const el = document.getElementById('sse-status');
    if(!el) return;
    if(s==='live')  { el.textContent='[?] Live';         el.style.color='var(--green,#3fb950)'; }
    if(s==='error') { el.textContent='[?] Reconnecting'; el.style.color='var(--red,#f85149)';   }
  }
  function flashStatus(){
    const el = document.getElementById('sse-status');
    if(!el) return;
    el.textContent='[?] Updated'; el.style.color='var(--yellow,#e3b341)';
    setTimeout(()=>showStatus('live'), 1500);
  }
  connect();
})();
</script>`;
      html = html.replace('</body>', liveScript + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (e) {
      res.writeHead(500); res.end('Error loading dashboard: ' + e.message);
    }
    return;
  }

  // Serve other static files
  const abs = path.join(ROOT, filePath);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    const mime = MIME[path.extname(abs)] || 'text/plain';
    cors(res);
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(abs).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found: ' + pathname);
  }
});

server.listen(PORT, () => {
  const dashUrl = `http://localhost:${PORT}`;
  console.log('\n============================================================');
  console.log('  ADLC Live Dashboard Server -- Team Panchayat');
  console.log('  Author: Tarun Vangari');
  console.log('============================================================');
  console.log(`\n  Dashboard:     ${dashUrl}   <- OPEN THIS`);
  console.log(`  SSE Events:    ${dashUrl}/events`);
  console.log(`  API State:     GET  ${dashUrl}/api/state`);
  console.log(`  Post Chat:     POST ${dashUrl}/api/chat`);
  console.log(`  New Req:       POST ${dashUrl}/api/requirement`);
  console.log(`  Approve Plan:  POST ${dashUrl}/api/requirement/approve`);
  console.log(`  Projects:      GET  ${dashUrl}/api/projects`);
  console.log(`  Switch Proj:   POST ${dashUrl}/api/switch-project`);
  console.log(`  Next Project:  POST ${dashUrl}/api/next-project`);
  console.log(`  Arch Approve:  POST ${dashUrl}/api/agent/vikram/approve-architecture`);
  console.log(`  DB Schema:     GET  ${dashUrl}/api/agent/rasool/db-schema`);
  console.log(`\n  Active project: ${getProjectRoot()}`);
  console.log(`  Watching project files for live updates...`);
  console.log('  Press Ctrl+C to stop\n');

  if (process.env.SKIP_BROWSER !== '1') {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32'  ? `start "" "${dashUrl}"`
              : process.platform === 'darwin' ? `open "${dashUrl}"`
              : `xdg-open "${dashUrl}"`;
    exec(cmd, err => { if (!err) console.log(`  Browser opened at ${dashUrl}\n`); });
  }
});
