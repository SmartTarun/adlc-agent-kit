/**
 * memory-manager.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit  --  Team Panchayat
 * Date: 2026-03-14
 *
 * Agent Memory Manager  --  reads, displays, and resets agent memory
 *
 * Usage:
 *   node memory-manager.js              -> show memory summary for all agents
 *   node memory-manager.js vikram       -> show detailed memory for one agent
 *   node memory-manager.js --reset all  -> reset all agent memories (new sprint)
 *   node memory-manager.js --reset vikram -> reset one agent's memory
 *   node memory-manager.js --watch      -> live watch mode (refreshes every 5s)
 */

const fs   = require('fs');
const path = require('path');

const MEMORY_DIR  = path.join(__dirname, 'agent-memory');
const STATUS_FILE = path.join(__dirname, 'agent-status.json');

const AGENTS = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];

const STATUS_ICON = { not_started: '[..]', in_progress: '[*]', blocked: '[*]', done: '[OK]', queue: '[..]' };
const AGENT_COLORS = {
  arjun:   '\x1b[35m',  // magenta
  vikram:  '\x1b[31m',  // red
  rasool:  '\x1b[33m',  // yellow
  kavya:   '\x1b[35m',  // magenta
  kiran:   '\x1b[36m',  // cyan
  rohan:   '\x1b[34m',  // blue
  keerthi: '\x1b[32m',  // green
};
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

function readMemory(agent) {
  const file = path.join(MEMORY_DIR, `${agent}-memory.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeMemory(agent, data) {
  const file = path.join(MEMORY_DIR, `${agent}-memory.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { agents: {} };
  }
}

function emptyMemory(agent, sprint = '01') {
  return {
    agent,
    sprint,
    lastActive: '',
    sessionCount: 0,
    currentTask: {
      title: '',
      status: 'not_started',
      progressPercent: 0,
      startedAt: '',
      lastStepCompleted: ''
    },
    completedTasks: [],
    filesCreated: [],
    filesModified: [],
    keyDecisions: [],
    pendingNextSteps: [],
    dependenciesStatus: { waitingFor: '', readyToUnblock: '' },
    blockers: [],
    notes: ''
  };
}

function showSummary() {
  const status = readStatus();
  const now    = new Date().toLocaleString('en-GB');

  console.log(`\n${BOLD}+===========================================================+`);
  console.log(`|        ADLC Agent Memory Summary  --  Team Panchayat         |`);
  console.log(`+===========================================================+${RESET}`);
  console.log(`${DIM}  ${now}\n${RESET}`);

  for (const agent of AGENTS) {
    const mem   = readMemory(agent);
    const stat  = status.agents?.[agent] || {};
    const color = AGENT_COLORS[agent] || '';
    const icon  = STATUS_ICON[stat.status || 'not_started'] || '[..]';

    if (!mem) {
      console.log(`  ${color}${BOLD}${agent.toUpperCase().padEnd(10)}${RESET}  [NO] No memory file found`);
      continue;
    }

    const sessions    = mem.sessionCount || 0;
    const lastActive  = mem.lastActive   ? new Date(mem.lastActive).toLocaleString('en-GB') : 'Never';
    const progress    = stat.progress    || mem.currentTask?.progressPercent || 0;
    const lastStep    = mem.currentTask?.lastStepCompleted || 'None yet';
    const nextSteps   = mem.pendingNextSteps?.length || 0;
    const filesCount  = (mem.filesCreated?.length || 0) + (mem.filesModified?.length || 0);
    const blockers    = mem.blockers?.length || 0;

    // Progress bar
    const barLen  = 20;
    const filled  = Math.round((progress / 100) * barLen);
    const bar     = '#'.repeat(filled) + '-'.repeat(barLen - filled);

    console.log(`  ${color}${BOLD}${agent.toUpperCase().padEnd(10)}${RESET} ${icon}  Sessions: ${sessions}  |  Last active: ${lastActive}`);
    console.log(`             [${color}${bar}${RESET}] ${progress}%`);
    console.log(`             Last step: ${DIM}${lastStep.substring(0, 55)}${RESET}`);
    console.log(`             Files: ${filesCount}  |  Next steps queued: ${nextSteps}  |  Blockers: ${blockers > 0 ? `\x1b[31m${blockers}${RESET}` : '0'}`);
    console.log('');
  }
}

function showDetail(agent) {
  const mem = readMemory(agent);
  if (!mem) {
    console.log(`\n[NO] No memory file found for agent: ${agent}`);
    return;
  }

  const color = AGENT_COLORS[agent] || '';
  console.log(`\n${BOLD}${color}+===========================================================+`);
  console.log(`|  AGENT MEMORY: ${agent.toUpperCase().padEnd(45)}|`);
  console.log(`+===========================================================+${RESET}`);

  console.log(`\n${BOLD}  Sprint:${RESET}       ${mem.sprint}`);
  console.log(`${BOLD}  Sessions:${RESET}     ${mem.sessionCount}`);
  console.log(`${BOLD}  Last Active:${RESET}  ${mem.lastActive ? new Date(mem.lastActive).toLocaleString('en-GB') : 'Never'}`);

  console.log(`\n${BOLD}  Current Task:${RESET}`);
  console.log(`    Title:    ${mem.currentTask?.title || 'None'}`);
  console.log(`    Status:   ${STATUS_ICON[mem.currentTask?.status || 'not_started']} ${mem.currentTask?.status || 'not_started'}`);
  console.log(`    Progress: ${mem.currentTask?.progressPercent || 0}%`);
  console.log(`    Last Step: ${mem.currentTask?.lastStepCompleted || 'None'}`);

  if (mem.completedTasks?.length) {
    console.log(`\n${BOLD}  Completed Tasks (${mem.completedTasks.length}):${RESET}`);
    mem.completedTasks.forEach(t => console.log(`    [OK] ${t}`));
  }

  if (mem.pendingNextSteps?.length) {
    console.log(`\n${BOLD}  Pending Next Steps (${mem.pendingNextSteps.length}):${RESET}`);
    mem.pendingNextSteps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  }

  if (mem.filesCreated?.length) {
    console.log(`\n${BOLD}  Files Created (${mem.filesCreated.length}):${RESET}`);
    mem.filesCreated.forEach(f => console.log(`    ${DIM}+ ${f}${RESET}`));
  }

  if (mem.filesModified?.length) {
    console.log(`\n${BOLD}  Files Modified (${mem.filesModified.length}):${RESET}`);
    mem.filesModified.forEach(f => console.log(`    ${DIM}~ ${f}${RESET}`));
  }

  if (mem.keyDecisions?.length) {
    console.log(`\n${BOLD}  Key Decisions:${RESET}`);
    mem.keyDecisions.forEach(d => console.log(`    [*] ${d}`));
  }

  if (mem.blockers?.length) {
    console.log(`\n${BOLD}  [*] Blockers:${RESET}`);
    mem.blockers.forEach(b => console.log(`    [!][?]  ${b}`));
  }

  if (mem.dependenciesStatus?.waitingFor) {
    console.log(`\n${BOLD}  Waiting For:${RESET} ${mem.dependenciesStatus.waitingFor}`);
  }
  if (mem.dependenciesStatus?.readyToUnblock) {
    console.log(`${BOLD}  Can Unblock:${RESET} ${mem.dependenciesStatus.readyToUnblock}`);
  }

  if (mem.notes) {
    console.log(`\n${BOLD}  Notes:${RESET} ${mem.notes}`);
  }
  console.log('');
}

function resetMemory(target) {
  const statusData = readStatus();
  const sprint     = statusData.sprint || '01';

  const targets = target === 'all' ? AGENTS : [target.toLowerCase()];

  for (const agent of targets) {
    if (!AGENTS.includes(agent)) {
      console.log(`[!][?]  Unknown agent: ${agent}`);
      continue;
    }
    writeMemory(agent, emptyMemory(agent, sprint));
    console.log(`[OK] Reset memory for: ${agent}`);
  }
  console.log('\nDone. All specified agent memories cleared for new sprint.');
}

// -- CLI entry -------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--reset')) {
  const target = args[args.indexOf('--reset') + 1] || 'all';
  resetMemory(target);
} else if (args.includes('--watch')) {
  console.log('\n[*][?]  Watch mode  --  refreshing every 5 seconds (Ctrl+C to stop)\n');
  showSummary();
  setInterval(() => {
    console.clear();
    showSummary();
  }, 5000);
} else if (args.length && !args[0].startsWith('-')) {
  showDetail(args[0].toLowerCase());
} else {
  showSummary();
}
