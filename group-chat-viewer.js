/**
 * group-chat-viewer.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit — Team Panchayat
 * Date: 2026-03-14
 *
 * Live group chat viewer for all Team Panchayat agents.
 * Agents write to group-chat.json; this script renders it like a team channel.
 *
 * Usage:
 *   node group-chat-viewer.js           → show full chat history
 *   node group-chat-viewer.js --watch   → live feed (auto-refresh every 2s)
 *   node group-chat-viewer.js --last 20 → show last N messages
 */

const fs   = require('fs');
const path = require('path');

const CHAT_FILE = path.join(__dirname, 'group-chat.json');

const COLORS = {
  tarun:   '\x1b[97m',   // bright white
  arjun:   '\x1b[35m',   // magenta
  vikram:  '\x1b[31m',   // red
  rasool:  '\x1b[33m',   // yellow
  kavya:   '\x1b[95m',   // bright magenta
  kiran:   '\x1b[36m',   // cyan
  rohan:   '\x1b[34m',   // blue
  keerthi: '\x1b[32m',   // green
  system:  '\x1b[90m',   // dark gray
};
const TYPE_ICONS = {
  message:       '💬',
  status_update: '📊',
  handoff:       '🤝',
  blocker:       '🔴',
  done:          '✅',
  question:      '❓',
  requirement:   '📋',
  analysis:      '🔍',
  plan:          '🗺️',
  system:        '⚙️',
  broadcast:     '📢',
};
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

let lastCount = 0;

function readChat() {
  try {
    return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
  } catch {
    return { channel: 'team-panchayat-general', messages: [] };
  }
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function renderMessage(msg, showDate = false) {
  const color = COLORS[msg.from?.toLowerCase()] || COLORS.system;
  const icon  = TYPE_ICONS[msg.type] || '💬';
  const time  = formatTime(msg.timestamp);
  const from  = (msg.from || 'UNKNOWN').toUpperCase().padEnd(10);

  let line = `  ${color}${BOLD}${from}${RESET} ${DIM}${time}${RESET}  ${icon}  `;

  if (msg.type === 'blocker') {
    line += `\x1b[31m${msg.message}${RESET}`;
  } else if (msg.type === 'done') {
    line += `\x1b[32m${msg.message}${RESET}`;
  } else if (msg.type === 'requirement') {
    line += `${BOLD}${msg.message}${RESET}`;
  } else {
    line += `${msg.message}`;
  }

  if (msg.tags?.length) {
    line += `  ${DIM}[${msg.tags.join(', ')}]${RESET}`;
  }

  return line;
}

function renderChat(limit = 0) {
  const data = readChat();
  const msgs = limit > 0 ? data.messages.slice(-limit) : data.messages;

  console.clear();
  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  📡  Team Panchayat — #${(data.channel || 'general').padEnd(38)}║`);
  console.log(`║  Sprint: ${(data.sprint || '—').padEnd(53)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  if (msgs.length === 0) {
    console.log(`  ${DIM}No messages yet. Agents will post here as they work.${RESET}\n`);
    return;
  }

  let lastDate = '';
  for (const msg of msgs) {
    const date = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('en-GB') : '';
    if (date && date !== lastDate) {
      console.log(`\n  ${DIM}─────────────────── ${date} ───────────────────${RESET}`);
      lastDate = date;
    }
    console.log(renderMessage(msg));
  }

  console.log(`\n  ${DIM}${msgs.length} message(s)  ·  Last updated: ${new Date().toLocaleTimeString('en-GB')}${RESET}\n`);
}

function watchChat(limit = 50) {
  console.log(`\n👁️  Live mode — watching group-chat.json (Ctrl+C to stop)\n`);
  renderChat(limit);
  lastCount = readChat().messages?.length || 0;

  fs.watch(CHAT_FILE, () => {
    setTimeout(() => {
      const data   = readChat();
      const newCount = data.messages?.length || 0;
      if (newCount !== lastCount) {
        renderChat(limit);
        lastCount = newCount;
      }
    }, 300);
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const watch = args.includes('--watch');
const lastI = args.indexOf('--last');
const limit = lastI >= 0 ? parseInt(args[lastI + 1]) || 50 : 0;

if (watch) {
  watchChat(limit || 50);
} else {
  renderChat(limit);
}
