/**
 * new-project.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit  -- Team Panchayat
 * Date: 2026-03-14
 *
 * NEW PROJECT / FEATURE BROADCASTER
 * Tarun posts a requirement -> all agents are notified -> each provides input
 * Arjun collects all inputs and generates the sprint plan.
 *
 * Usage:
 *   node new-project.js                         -> interactive wizard (creates new project subfolder)
 *   node new-project.js --status                -> show current requirement status
 *   node new-project.js --inputs                -> show all agent inputs received so far
 *   node new-project.js --approve               -> Tarun approves the sprint plan
 *   node new-project.js --list                  -> list all projects
 *   node new-project.js --switch <folder>       -> switch active project (e.g. projects/REQ-xxx-name)
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const KIT_ROOT            = __dirname;
const ACTIVE_PROJECT_FILE = path.join(KIT_ROOT, 'active-project.json');
const PROJECTS_DIR        = path.join(KIT_ROOT, 'projects');

// Ensure projects/ directory exists
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// Returns absolute path of the currently active project root
function getProjectRoot() {
  try {
    const ap = JSON.parse(fs.readFileSync(ACTIVE_PROJECT_FILE, 'utf8'));
    const rel = ap.current || '.';
    return rel === '.' ? KIT_ROOT : path.resolve(KIT_ROOT, rel);
  } catch {
    return KIT_ROOT;
  }
}

function getProjectFile(filename) {
  return path.join(getProjectRoot(), filename);
}

// Re-evaluated on each call so switching project works within session
const REQ_FILE    = () => getProjectFile('requirement.json');
const CHAT_FILE   = () => getProjectFile('group-chat.json');
const STATUS_FILE = () => getProjectFile('agent-status.json');

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED   = '\x1b[31m';

const AGENTS = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
const AGENT_ROLES = {
  arjun:   'PM / Orchestrator',
  vikram:  'Cloud Architect / Terraform',
  rasool:  'Database Agent / PostgreSQL',
  kavya:   'UX Designer / Design Tokens',
  kiran:   'Backend Engineer / FastAPI',
  rohan:   'Frontend Engineer / React',
  keerthi: 'QA Agent',
};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function postToChat(from, role, type, message, tags = []) {
  const chat = readJSON(CHAT_FILE()) || { channel: 'team-panchayat-general', messages: [] };
  chat.messages.push({
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from,
    role,
    timestamp: new Date().toISOString(),
    type,
    message,
    tags,
  });
  writeJSON(CHAT_FILE(), chat);
}

// Switch the active project and update active-project.json
function switchProject(relPath, meta = {}) {
  const absTarget = relPath === '.' ? KIT_ROOT : path.resolve(KIT_ROOT, relPath);
  const req = readJSON(path.join(absTarget, 'requirement.json'));
  const ap = {
    current:     relPath,
    id:          (req && req.requirementId) || meta.id || '',
    name:        (req && req.title)         || meta.name || relPath,
    sprint:      (req && req.sprint)        || meta.sprint || '01',
    status:      (req && req.status)        || meta.status || 'pending',
    description: (req && req.description)   || meta.description || '',
    updatedAt:   new Date().toISOString(),
  };
  writeJSON(ACTIVE_PROJECT_FILE, ap);
  console.log(`\n${GREEN}${BOLD}[OK] Switched active project -> ${relPath}${RESET}`);
  console.log(`   Name:   ${ap.name}`);
  console.log(`   Sprint: ${ap.sprint}`);
  console.log(`   Status: ${ap.status}\n`);
}

// List all projects
function listProjects() {
  const projects = [];
  const activeRoot = getProjectRoot();

  const rootReq = readJSON(path.join(KIT_ROOT, 'requirement.json'));
  if (rootReq && rootReq.requirementId) {
    projects.push({ path: '.', req: rootReq, isActive: activeRoot === KIT_ROOT });
  }
  if (fs.existsSync(PROJECTS_DIR)) {
    fs.readdirSync(PROJECTS_DIR).forEach(folder => {
      const abs = path.join(PROJECTS_DIR, folder);
      try { if (!fs.statSync(abs).isDirectory()) return; } catch { return; }
      const req = readJSON(path.join(abs, 'requirement.json'));
      if (!req || !req.requirementId) return;
      projects.push({ path: 'projects/' + folder, req, isActive: activeRoot === abs });
    });
  }
  return projects;
}

function resetRequirement() {
  return {
    requirementId: `REQ-${Date.now()}`,
    postedBy:  'Tarun Vangari',
    postedAt:  new Date().toISOString(),
    sprint:    '',
    type:      '',
    title:     '',
    description: '',
    businessGoal: '',
    targetUsers: '',
    techConstraints: [],
    deadline:  '',
    priority:  'medium',
    status:    'pending_analysis',
    agentInputs: Object.fromEntries(AGENTS.map(a => [a, { received: false, summary: '', questions: [], estimate: '' }])),
    discoveryComplete: false,
    discoveryPhase: { currentRound: 0, roundStatus: 'not_started', startedAt: '' },
    discoveryAnswers: { round1: {}, round2: {}, round3: {} },
    productBrief: {},
    sprintPlan: '',
    approvedByTarun: false,
  };
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function wizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n${BOLD}${CYAN}+==============================================================+`);
  console.log(`|       [REQ]  ADLC New Project / Feature Wizard                 |`);
  console.log(`|       Tarun Vangari  -- Team Panchayat                        |`);
  console.log(`+==============================================================+${RESET}\n`);

  const req = resetRequirement();

  req.title        = await ask(rl, `${BOLD}Project / Feature Title:${RESET} `);
  req.sprint       = await ask(rl, `${BOLD}Sprint number (e.g. 02):${RESET} `);
  req.type         = await ask(rl, `${BOLD}Type [new_project / new_feature / bug_fix / enhancement]:${RESET} `);
  req.priority     = await ask(rl, `${BOLD}Priority [low / medium / high / critical]:${RESET} `);
  req.description  = await ask(rl, `${BOLD}Describe the requirement (what do you want to build?):${RESET}\n> `);
  req.businessGoal = await ask(rl, `${BOLD}Business goal (why are we building this?):${RESET}\n> `);
  req.targetUsers  = await ask(rl, `${BOLD}Target users / audience:${RESET} `);
  const constraints = await ask(rl, `${BOLD}Tech constraints (comma-separated, or press Enter to skip):${RESET} `);
  req.deadline     = await ask(rl, `${BOLD}Deadline (e.g. 2026-03-28, or press Enter to skip):${RESET} `);

  if (constraints.trim()) {
    req.techConstraints = constraints.split(',').map(s => s.trim()).filter(Boolean);
  }

  rl.close();

  // --- Scaffold new project subfolder under projects/ ---
  const slug      = req.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const folder    = req.requirementId + '-' + slug;
  const absDir    = path.join(PROJECTS_DIR, folder);
  const relPath   = 'projects/' + folder;

  fs.mkdirSync(absDir, { recursive: true });
  ['agent-logs', 'agent-memory', 'chat-uploads', 'infra', 'backend', 'frontend', 'docs'].forEach(d => {
    fs.mkdirSync(path.join(absDir, d), { recursive: true });
  });

  // Save requirement.json into the new project folder
  writeJSON(path.join(absDir, 'requirement.json'), req);

  // Reset agent statuses in the new project folder
  const status = { sprint: req.sprint, lastSync: new Date().toISOString(), agents: {} };
  AGENTS.forEach(a => {
    status.agents[a] = { status: 'queue', progress: 0, task: 'Awaiting requirement analysis', blocker: '', updated: new Date().toISOString() };
  });
  writeJSON(path.join(absDir, 'agent-status.json'), status);

  // Initialise empty group chat
  writeJSON(path.join(absDir, 'group-chat.json'), { channel: 'team-panchayat-general', messages: [] });

  // Switch active project to the new folder
  switchProject(relPath);

  // Post to group chat (now points to the new folder via getProjectRoot())
  postToChat('TARUN', 'Product Owner', 'requirement',
    `[REQ] NEW REQUIREMENT POSTED  -- [${req.requirementId}] "${req.title}" | Sprint-${req.sprint} | Priority: ${req.priority.toUpperCase()}`,
    ['requirement', `sprint-${req.sprint}`]);

  postToChat('TARUN', 'Product Owner', 'broadcast',
    `${req.description} | Goal: ${req.businessGoal} | Users: ${req.targetUsers}${req.techConstraints.length ? ' | Constraints: ' + req.techConstraints.join(', ') : ''}`,
    ['requirement-detail']);

  postToChat('ARJUN', 'Orchestrator', 'broadcast',
    `All agents  -- new requirement received: "${req.title}". Read requirement.json and post your analysis to group-chat.json. I will collect all inputs and generate the sprint plan.`,
    ['action-required', 'all-agents']);

  console.log(`\n${GREEN}${BOLD}[OK] Requirement posted successfully!${RESET}`);
  console.log(`   ID:      ${req.requirementId}`);
  console.log(`   Folder:  ${relPath}`);
  console.log(`   Title: ${req.title}`);
  console.log(`   Sprint: ${req.sprint}\n`);

  console.log(`${AMBER}${BOLD}NEXT STEPS:${RESET}`);
  console.log(`  1. Open each agent window and paste their prompt`);
  console.log(`  2. Each agent will read requirement.json and post their analysis`);
  console.log(`  3. Watch group chat:   node group-chat-viewer.js --watch`);
  console.log(`  4. Check inputs:       node new-project.js --inputs`);
  console.log(`  5. Once all agents respond, Arjun posts the sprint plan`);
  console.log(`  6. Approve the plan:   node new-project.js --approve\n`);

  // Print ready-to-paste instruction for agents
  console.log(`${CYAN}${BOLD}--- PASTE THIS TO ALL AGENT WINDOWS ----------------------------${RESET}`);
  console.log(`New requirement posted by Tarun. Read requirement.json immediately.`);
  console.log(`Analyse it from your role's perspective and post your input to group-chat.json.`);
  console.log(`See your updated prompt for the exact format to follow.`);
  console.log(`${CYAN}${BOLD}----------------------------------------------------------------${RESET}\n`);
}

function showStatus() {
  const req = readJSON(REQ_FILE());
  if (!req || !req.requirementId) {
    console.log(`\n${AMBER}No active requirement. Run: node new-project.js${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}+==============================================================+`);
  console.log(`|  [REQ]  Active Requirement                                      |`);
  console.log(`+==============================================================+${RESET}`);
  console.log(`\n  ${BOLD}ID:${RESET}       ${req.requirementId}`);
  console.log(`  ${BOLD}Title:${RESET}    ${req.title}`);
  console.log(`  ${BOLD}Sprint:${RESET}   ${req.sprint}`);
  console.log(`  ${BOLD}Type:${RESET}     ${req.type}`);
  console.log(`  ${BOLD}Priority:${RESET} ${req.priority.toUpperCase()}`);
  console.log(`  ${BOLD}Status:${RESET}   ${req.status}`);
  console.log(`  ${BOLD}Approved:${RESET} ${req.approvedByTarun ? GREEN + '[OK] Yes' : RED + '[NO] Pending'}${RESET}`);

  const received = AGENTS.filter(a => req.agentInputs?.[a]?.received).length;
  console.log(`\n  ${BOLD}Agent Inputs: ${received}/${AGENTS.length} received${RESET}`);
  AGENTS.forEach(a => {
    const inp = req.agentInputs?.[a];
    const icon = inp?.received ? `${GREEN}[OK]${RESET}` : `${AMBER}[..]${RESET}`;
    console.log(`    ${icon}  ${a.padEnd(10)} ${inp?.received ? DIM + (inp.summary || '').substring(0, 50) + RESET : DIM + 'Waiting...' + RESET}`);
  });
  console.log('');
}

function showInputs() {
  const req = readJSON(REQ_FILE());
  if (!req || !req.requirementId) {
    console.log(`\n${AMBER}No active requirement.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Agent Inputs for: "${req.title}"${RESET}\n`);
  AGENTS.forEach(a => {
    const inp = req.agentInputs?.[a];
    const role = AGENT_ROLES[a];
    if (!inp?.received) {
      console.log(`  ${AMBER}[..] ${a.toUpperCase().padEnd(10)}${RESET} ${DIM}(${role})  -- not yet submitted${RESET}\n`);
      return;
    }
    console.log(`  ${GREEN}[OK] ${a.toUpperCase()}${RESET}  -- ${role}`);
    console.log(`     Summary:  ${inp.summary}`);
    console.log(`     Estimate: ${inp.estimate}`);
    if (inp.questions?.length) {
      console.log(`     Questions:`);
      inp.questions.forEach(q => console.log(`       [?] ${q}`));
    }
    console.log('');
  });

  if (req.sprintPlan) {
    console.log(`${BOLD}${GREEN}Sprint Plan (from Arjun):${RESET}\n${req.sprintPlan}\n`);
  }
}

function approve() {
  const req = readJSON(REQ_FILE());
  if (!req || !req.requirementId) {
    console.log(`\n${RED}No active requirement to approve.${RESET}\n`);
    return;
  }
  req.approvedByTarun = true;
  req.status = 'in_sprint';
  writeJSON(REQ_FILE(), req);

  postToChat('TARUN', 'Product Owner', 'broadcast',
    `[OK] SPRINT PLAN APPROVED by Tarun. All agents  -- sprint is GO. Begin execution now. Arjun will assign tasks via the task list.`,
    ['approved', `sprint-${req.sprint}`]);

  // Update agent statuses to wip
  const status = readJSON(STATUS_FILE()) || { agents: {} };
  AGENTS.filter(a => a !== 'keerthi').forEach(a => {
    if (status.agents[a]) status.agents[a].status = 'wip';
  });
  writeJSON(STATUS_FILE(), status);

  // Keep active-project.json in sync
  try {
    const ap = JSON.parse(fs.readFileSync(ACTIVE_PROJECT_FILE, 'utf8'));
    ap.status    = 'in_sprint';
    ap.updatedAt = new Date().toISOString();
    writeJSON(ACTIVE_PROJECT_FILE, ap);
  } catch {}

  console.log(`\n${GREEN}${BOLD}[OK] Sprint plan approved! Agents have been notified.${RESET}`);
  console.log(`   Check group chat: node group-chat-viewer.js --watch\n`);
}

function showList() {
  const projects = listProjects();
  console.log(`\n${BOLD}+==============================================================+`);
  console.log(`|  [PROJECTS]  All Requirements / Projects                        |`);
  console.log(`+==============================================================+${RESET}`);
  if (projects.length === 0) {
    console.log(`\n  ${AMBER}No projects found. Run: node new-project.js${RESET}\n`);
    return;
  }
  projects.forEach(p => {
    const active = p.isActive ? `${GREEN} [ACTIVE]${RESET}` : '';
    console.log(`\n  ${BOLD}${p.req.title || p.path}${RESET}${active}`);
    console.log(`    Path:    ${p.path}`);
    console.log(`    ID:      ${p.req.requirementId}`);
    console.log(`    Sprint:  ${p.req.sprint}`);
    console.log(`    Status:  ${p.req.status}`);
  });
  console.log(`\n${DIM}To switch: node new-project.js --switch projects/<folder>${RESET}\n`);
}

// -- CLI ------------------------------------------------------------------
const args = process.argv.slice(2);
if      (args.includes('--status'))  showStatus();
else if (args.includes('--inputs'))  showInputs();
else if (args.includes('--approve')) approve();
else if (args.includes('--list'))    showList();
else if (args.includes('--switch')) {
  const idx = args.indexOf('--switch');
  const target = args[idx + 1];
  if (!target) {
    console.log(`\n${RED}Usage: node new-project.js --switch projects/<folder>${RESET}\n`);
  } else {
    switchProject(target);
  }
}
else    wizard();
