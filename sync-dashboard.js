/**
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit — Team Panchayat
 * Date: 2026-03-14
 */
/**
 * sync-dashboard.js
 * Team Panchayat — ADLC Sprint Dashboard Auto-Sync
 *
 * Reads agent-status.json and patches sprint-dashboard.html
 * Run with: node sync-dashboard.js
 * Auto-watch mode: node sync-dashboard.js --watch
 */

const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, 'agent-status.json');
const DASHBOARD_FILE = path.join(__dirname, 'sprint-dashboard.html');

const STATUS_LABELS = {
  done: '✅ DONE',
  wip: '🟡 IN PROGRESS',
  blocked: '🔴 BLOCKED',
  queue: '⏳ QUEUE'
};

function syncDashboard() {
  // Read status
  let statusData;
  try {
    statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ Cannot read agent-status.json:', e.message);
    return;
  }

  const agents = statusData.agents;
  const now = new Date().toLocaleTimeString('en-GB');

  // Build updated AGENTS array for injection into HTML
  const agentOrder = ['vikram', 'rohan', 'kiran', 'rasool', 'kavya', 'keerthi'];
  const agentMeta = {
    vikram:  { cls: 'c-vikram',  initial: 'V',  name: 'Vikram',  role: 'Cloud Architect · Claude Sonnet',    tools: ['Terraform', 'AWS CLI', 'CMD Terminal', 'VS Code'] },
    rohan:   { cls: 'c-rohan',   initial: 'R',  name: 'Rohan',   role: 'Frontend Engineer · Claude Sonnet',  tools: ['VS Code', 'Chrome Browser', 'CMD', 'GitHub'] },
    kiran:   { cls: 'c-kiran',   initial: 'K',  name: 'Kiran',   role: 'Backend Engineer · Claude Sonnet',   tools: ['FastAPI', 'GitHub', 'VS Code', 'CMD'] },
    rasool:  { cls: 'c-rasool',  initial: 'Ra', name: 'Rasool',  role: 'Database Agent · Claude Sonnet',     tools: ['PostgreSQL', 'Alembic', 'VS Code', 'CMD'] },
    kavya:   { cls: 'c-kavya',   initial: 'Ka', name: 'Kavya',   role: 'UX Designer · Claude Sonnet',        tools: ['Chrome Browser', 'VS Code', 'CSS Tokens'] },
    keerthi: { cls: 'c-keerthi', initial: 'Ke', name: 'Keerthi', role: 'QA Agent · Claude Sonnet',           tools: ['pytest', 'Chrome Browser', 'VS Code', 'CMD'] }
  };

  const agentsArray = agentOrder.map(id => {
    const meta = agentMeta[id];
    const state = agents[id] || {};
    return {
      id,
      cls: meta.cls,
      initial: meta.initial,
      name: meta.name,
      role: meta.role,
      tools: meta.tools,
      task: state.task || meta.role,
      status: state.status || 'queue',
      progress: state.progress || 0,
      blocker: state.blocker || '',
      updated: state.updated ? new Date(state.updated).toLocaleTimeString('en-GB') : '—'
    };
  });

  // Serialize for injection
  const agentsJson = JSON.stringify(agentsArray, null, 2);

  // Read dashboard HTML
  let html;
  try {
    html = fs.readFileSync(DASHBOARD_FILE, 'utf8');
  } catch (e) {
    console.error('❌ Cannot read sprint-dashboard.html:', e.message);
    return;
  }

  // Replace the AGENTS const block
  const agentsBlockRegex = /const AGENTS = \[[\s\S]*?\];/;
  const newAgentsBlock = `const AGENTS = ${agentsJson};`;

  if (!agentsBlockRegex.test(html)) {
    console.error('❌ Could not find AGENTS array in dashboard HTML. Is the file intact?');
    return;
  }

  const updated = html.replace(agentsBlockRegex, newAgentsBlock);

  // Write back
  try {
    fs.writeFileSync(DASHBOARD_FILE, updated, 'utf8');
  } catch (e) {
    console.error('❌ Cannot write sprint-dashboard.html:', e.message);
    return;
  }

  // Print summary
  const done    = agentsArray.filter(a => a.status === 'done').length;
  const wip     = agentsArray.filter(a => a.status === 'wip').length;
  const blocked = agentsArray.filter(a => a.status === 'blocked').length;
  const overall = Math.round(agentsArray.reduce((s, a) => s + a.progress, 0) / agentsArray.length);

  console.log(`\n[${now}] ✅ Dashboard synced — Sprint-${statusData.sprint}`);
  console.log(`  Done: ${done} | Working: ${wip} | Blocked: ${blocked} | Overall: ${overall}%`);
  agentsArray.forEach(a => {
    const icon = { done: '✅', wip: '🟡', blocked: '🔴', queue: '⏳' }[a.status] || '❓';
    console.log(`  ${icon} ${a.name.padEnd(10)} ${String(a.progress + '%').padEnd(5)} — ${a.task.substring(0, 50)}`);
  });

  // Update lastSync in status file
  statusData.lastSync = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf8');
}

// Run once
syncDashboard();

// Watch mode
if (process.argv.includes('--watch')) {
  console.log('\n👁️  Watch mode ON — monitoring agent-status.json for changes...\n');
  fs.watch(STATUS_FILE, (eventType) => {
    if (eventType === 'change') {
      setTimeout(syncDashboard, 300); // small delay to let write complete
    }
  });
}
