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
 *   node new-project.js                         -> interactive wizard
 *   node new-project.js --status                -> show current requirement status
 *   node new-project.js --inputs                -> show all agent inputs received so far
 *   node new-project.js --approve               -> Tarun approves the sprint plan
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const REQ_FILE  = path.join(__dirname, 'requirement.json');
const CHAT_FILE = path.join(__dirname, 'group-chat.json');
const STATUS_FILE = path.join(__dirname, 'agent-status.json');

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
  const chat = readJSON(CHAT_FILE) || { channel: 'team-panchayat-general', messages: [] };
  chat.messages.push({
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from,
    role,
    timestamp: new Date().toISOString(),
    type,
    message,
    tags,
  });
  writeJSON(CHAT_FILE, chat);
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

  // Save requirement
  writeJSON(REQ_FILE, req);

  // Reset agent statuses for new sprint
  const status = readJSON(STATUS_FILE) || { agents: {} };
  status.sprint = req.sprint;
  AGENTS.forEach(a => {
    status.agents[a] = { status: 'queue', progress: 0, task: 'Awaiting requirement analysis', blocker: '', updated: new Date().toISOString() };
  });
  writeJSON(STATUS_FILE, status);

  // Post to group chat
  postToChat('TARUN', 'Product Owner', 'requirement',
    `[REQ] NEW REQUIREMENT POSTED  -- [${req.requirementId}] "${req.title}" | Sprint-${req.sprint} | Priority: ${req.priority.toUpperCase()}`,
    ['requirement', `sprint-${req.sprint}`]);

  postToChat('TARUN', 'Product Owner', 'broadcast',
    `${req.description} | Goal: ${req.businessGoal} | Users: ${req.targetUsers}${req.techConstraints.length ? ' | Constraints: ' + req.techConstraints.join(', ') : ''}`,
    ['requirement-detail']);

  postToChat('ARJUN', 'Orchestrator', 'broadcast',
    `All agents  -- new requirement received: "${req.title}". Please read requirement.json and post your analysis to group-chat.json within your session. I will collect all inputs and generate the sprint plan.`,
    ['action-required', 'all-agents']);

  console.log(`\n${GREEN}${BOLD}[OK] Requirement posted successfully!${RESET}`);
  console.log(`   ID: ${req.requirementId}`);
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
  const req = readJSON(REQ_FILE);
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
  const req = readJSON(REQ_FILE);
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
  const req = readJSON(REQ_FILE);
  if (!req || !req.requirementId) {
    console.log(`\n${RED}No active requirement to approve.${RESET}\n`);
    return;
  }
  req.approvedByTarun = true;
  req.status = 'in_sprint';
  writeJSON(REQ_FILE, req);

  postToChat('TARUN', 'Product Owner', 'broadcast',
    `[OK] SPRINT PLAN APPROVED by Tarun. All agents  -- sprint is GO. Begin execution now. Arjun will assign tasks via the task list.`,
    ['approved', `sprint-${req.sprint}`]);

  // Update agent statuses to wip
  const status = readJSON(STATUS_FILE) || { agents: {} };
  AGENTS.filter(a => a !== 'keerthi').forEach(a => {
    if (status.agents[a]) status.agents[a].status = 'wip';
  });
  writeJSON(STATUS_FILE, status);

  console.log(`\n${GREEN}${BOLD}[OK] Sprint plan approved! Agents have been notified.${RESET}`);
  console.log(`   Check group chat: node group-chat-viewer.js --watch\n`);
}

// -- CLI ------------------------------------------------------------------
const args = process.argv.slice(2);
if      (args.includes('--status'))  showStatus();
else if (args.includes('--inputs'))  showInputs();
else if (args.includes('--approve')) approve();
else    wizard();
