/**
 * connect-tools.js
 * Author: Tarun Vangari (tarun.vangari@gmail.com)
 * Role: DevOps & Cloud Architect
 * Project: ADLC-Agent-Kit  --  Team Panchayat
 * Date: 2026-03-14
 *
 * Interactive wizard to configure tool connections and agent permissions.
 * Supports: GitHub (token or MCP), PostgreSQL (direct or MCP), Docker, AWS
 *
 * Usage:
 *   node connect-tools.js                  -> full setup wizard
 *   node connect-tools.js --status         -> show current connection status
 *   node connect-tools.js --test github    -> test a specific connection
 *   node connect-tools.js --test db
 *   node connect-tools.js --test docker
 *   node connect-tools.js --permissions    -> view/edit agent permissions
 *   node connect-tools.js --grant vikram github push
 *   node connect-tools.js --revoke keerthi aws
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const CONN_FILE = path.join(__dirname, 'connections.json');
const PERM_FILE = path.join(__dirname, 'tool-permissions.json');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const AMBER  = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BLUE   = '\x1b[34m';

const AGENTS = ['arjun', 'vikram', 'rasool', 'kavya', 'kiran', 'rohan', 'keerthi'];
const TOOLS  = ['github', 'database', 'docker', 'aws'];

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

function ask(rl, question, def = '') {
  return new Promise(resolve => {
    const display = def ? `${question} ${DIM}[${def}]${RESET} ` : `${question} `;
    rl.question(display, ans => resolve(ans.trim() || def));
  });
}

function askYN(rl, question) {
  return new Promise(resolve => {
    rl.question(`${question} ${DIM}[y/N]${RESET} `, ans => resolve(ans.trim().toLowerCase() === 'y'));
  });
}

function tryExec(cmd) {
  try { return { ok: true, out: execSync(cmd, { timeout: 8000 }).toString().trim() }; }
  catch (e) { return { ok: false, out: e.message.split('\n')[0] }; }
}

// -- STATUS ----------------------------------------------------------------
function showStatus() {
  const conn = readJSON(CONN_FILE) || {};
  const perm = readJSON(PERM_FILE) || {};

  console.log(`\n${BOLD}${CYAN}+==============================================================+`);
  console.log(`|  [*]  Tool Connections & Permissions  --  Team Panchayat         |`);
  console.log(`+==============================================================+${RESET}\n`);

  console.log(`${BOLD}  CONNECTIONS:${RESET}`);
  TOOLS.forEach(tool => {
    const c    = conn[tool] || {};
    const icon = c.enabled ? `${GREEN}[OK]${RESET}` : `${RED}[NO]${RESET}`;
    const type = c.type || 'not configured';
    const detail = tool === 'github'   ? (c.username   ? `@${c.username}` : 'no user set') :
                   tool === 'database' ? (c.host        ? `${c.host}:${c.port}/${c.database}` : 'not set') :
                   tool === 'docker'   ? (c.socketPath  ? c.socketPath : 'not set') :
                   tool === 'aws'      ? (c.region      ? `${c.profile} / ${c.region}` : 'not set') : '';

    console.log(`    ${icon}  ${tool.padEnd(12)} ${DIM}${type.padEnd(15)}${RESET}  ${detail}`);

    // Check MCP
    const mcp = conn.mcp?.[tool];
    if (mcp) {
      const mcpIcon = mcp.enabled ? `${GREEN}[OK] MCP${RESET}` : `${DIM}[?]  MCP${RESET}`;
      console.log(`        ${mcpIcon}  ${mcp.enabled ? mcp.serverUrl || '(configured)' : 'not connected'}`);
    }
  });

  console.log(`\n${BOLD}  AGENT PERMISSIONS:${RESET}`);
  const agents = perm.agents || {};
  AGENTS.forEach(agent => {
    const a = agents[agent] || {};
    const granted = TOOLS.filter(t => a[t]?.enabled);
    const icon = granted.length > 0 ? GREEN : DIM;
    console.log(`    ${icon}${agent.padEnd(12)}${RESET}  ${granted.length > 0 ? granted.join(', ') : DIM + 'no tools granted' + RESET}`);
  });
  console.log('');
}

// -- TEST CONNECTIONS ------------------------------------------------------
function testConnection(tool) {
  const conn = readJSON(CONN_FILE) || {};
  console.log(`\n${BOLD}Testing: ${tool}${RESET}\n`);

  if (tool === 'github') {
    // Test GitHub CLI
    const ghVer = tryExec('gh --version');
    console.log(`  GitHub CLI: ${ghVer.ok ? GREEN + '[OK] ' + ghVer.out.split('\n')[0] : RED + '[NO] Not installed  --  run: winget install GitHub.cli'}${RESET}`);

    if (ghVer.ok) {
      const authStatus = tryExec('gh auth status');
      console.log(`  Auth:       ${authStatus.ok ? GREEN + '[OK] Authenticated' : RED + '[NO] Not authenticated  --  run: gh auth login'}${RESET}`);

      if (authStatus.ok && conn.github?.defaultRepo) {
        const repo = tryExec(`gh repo view ${conn.github.username || ''}/${conn.github.defaultRepo} --json name`);
        console.log(`  Repo:       ${repo.ok ? GREEN + '[OK] Accessible' : AMBER + '[!][?]  Cannot access repo  --  check permissions'}${RESET}`);
      }
    }
  }

  if (tool === 'db' || tool === 'database') {
    const psql = tryExec('psql --version');
    console.log(`  psql CLI:   ${psql.ok ? GREEN + '[OK] ' + psql.out : AMBER + '[!][?]  psql not found  --  install PostgreSQL client'}${RESET}`);

    const c = conn.database;
    if (c?.host && c?.database && c?.username && c?.password) {
      const connStr = `postgresql://${c.username}:${c.password}@${c.host}:${c.port}/${c.database}`;
      const test = tryExec(`psql "${connStr}" -c "SELECT version();" -t 2>&1`);
      console.log(`  Connection: ${test.ok ? GREEN + '[OK] Connected to ' + c.host : RED + '[NO] Failed  --  ' + test.out.substring(0, 60)}${RESET}`);
    } else {
      console.log(`  ${AMBER}[!][?]  No DB credentials configured. Run: node connect-tools.js${RESET}`);
    }
  }

  if (tool === 'docker') {
    const docker = tryExec('docker --version');
    console.log(`  Docker CLI: ${docker.ok ? GREEN + '[OK] ' + docker.out : RED + '[NO] Not installed  --  install Docker Desktop'}${RESET}`);

    if (docker.ok) {
      const daemon = tryExec('docker info --format "Server Version: {{.ServerVersion}}"');
      console.log(`  Daemon:     ${daemon.ok ? GREEN + '[OK] ' + daemon.out : RED + '[NO] Not running  --  start Docker Desktop'}${RESET}`);
    }
  }

  if (tool === 'aws') {
    const aws = tryExec('aws --version');
    console.log(`  AWS CLI:    ${aws.ok ? GREEN + '[OK] ' + aws.out : RED + '[NO] Not installed  --  run: winget install Amazon.AWSCLI'}${RESET}`);

    if (aws.ok) {
      const ident = tryExec('aws sts get-caller-identity --output json');
      if (ident.ok) {
        try {
          const id = JSON.parse(ident.out);
          console.log(`  Identity:   ${GREEN}[OK] ${id.Arn}${RESET}`);
        } catch { console.log(`  Identity:   ${GREEN}[OK] Authenticated${RESET}`); }
      } else {
        console.log(`  Identity:   ${RED}[NO] Not authenticated  --  run: aws configure${RESET}`);
      }
    }
  }
  console.log('');
}

// -- GRANT/REVOKE PERMISSIONS ----------------------------------------------
function grantPermission(agent, tool, permission) {
  const perm = readJSON(PERM_FILE);
  if (!perm?.agents?.[agent]) { console.log(`${RED}Unknown agent: ${agent}${RESET}`); return; }
  if (!perm.agents[agent][tool]) perm.agents[agent][tool] = { enabled: true, permissions: [] };
  perm.agents[agent][tool].enabled = true;
  if (permission && !perm.agents[agent][tool].permissions.includes(permission)) {
    perm.agents[agent][tool].permissions.push(permission);
  }
  perm.global.lastUpdated = new Date().toISOString();
  writeJSON(PERM_FILE, perm);
  console.log(`${GREEN}[OK] Granted ${agent} -> ${tool}${permission ? ' -> ' + permission : ''}${RESET}`);
}

function revokePermission(agent, tool) {
  const perm = readJSON(PERM_FILE);
  if (!perm?.agents?.[agent]) { console.log(`${RED}Unknown agent: ${agent}${RESET}`); return; }
  if (perm.agents[agent][tool]) {
    perm.agents[agent][tool].enabled = false;
    perm.agents[agent][tool].permissions = [];
  }
  perm.global.lastUpdated = new Date().toISOString();
  writeJSON(PERM_FILE, perm);
  console.log(`${AMBER}[!][?]  Revoked ${agent} -> ${tool} access${RESET}`);
}

// -- SETUP WIZARD ----------------------------------------------------------
async function wizard() {
  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const conn = readJSON(CONN_FILE) || {};

  console.log(`\n${BOLD}${CYAN}+==============================================================+`);
  console.log(`|  [*]  ADLC Tool Connection Setup Wizard                       |`);
  console.log(`|  Tarun Vangari  --  Team Panchayat                               |`);
  console.log(`+==============================================================+${RESET}\n`);

  console.log(`${DIM}Configure connections for GitHub, PostgreSQL, Docker, and AWS.`);
  console.log(`Credentials are saved to connections.json (excluded from Git).${RESET}\n`);

  // -- GitHub ------------------------------------------------------
  const doGH = await askYN(rl, `${BOLD}[1/4] Configure GitHub?${RESET}`);
  if (doGH) {
    console.log(`\n  ${DIM}Get a token at: https://github.com/settings/tokens${RESET}`);
    console.log(`  ${DIM}Required scopes: repo, workflow, read:org${RESET}\n`);
    const method = await ask(rl, `  Connection method [token / mcp / gh-cli]:`, 'gh-cli');

    if (method === 'token') {
      conn.github.token    = await ask(rl, `  GitHub token (ghp_...):`, conn.github.token || '');
      conn.github.username = await ask(rl, `  GitHub username:`, conn.github.username || '');
      conn.github.org      = await ask(rl, `  GitHub org (or same as username):`, conn.github.org || conn.github.username);
      conn.github.defaultRepo = await ask(rl, `  Default repo name:`, conn.github.defaultRepo || 'adlc-agent-kit');
      conn.github.type     = 'token';
      conn.github.enabled  = true;
    } else if (method === 'mcp') {
      conn.mcp.github.serverUrl = await ask(rl, `  MCP server URL:`, conn.mcp?.github?.serverUrl || '');
      conn.mcp.github.enabled   = true;
      conn.github.enabled       = true;
      conn.github.type          = 'mcp';
      console.log(`\n  ${AMBER}To install GitHub MCP in Claude Code, run:${RESET}`);
      console.log(`  ${DIM}claude mcp add github${RESET}\n`);
    } else {
      // gh-cli
      conn.github.username    = await ask(rl, `  GitHub username:`, conn.github.username || '');
      conn.github.defaultRepo = await ask(rl, `  Default repo:`, conn.github.defaultRepo || 'adlc-agent-kit');
      conn.github.type    = 'gh-cli';
      conn.github.enabled = true;
      const test = tryExec('gh auth status');
      if (!test.ok) console.log(`\n  ${AMBER}[!][?]  Run 'gh auth login' to authenticate.${RESET}`);
    }
  }

  // -- PostgreSQL --------------------------------------------------
  const doDB = await askYN(rl, `\n${BOLD}[2/4] Configure PostgreSQL database?${RESET}`);
  if (doDB) {
    const method = await ask(rl, `  Connection method [direct / mcp]:`, 'direct');
    if (method === 'mcp') {
      conn.mcp.postgres.serverUrl = await ask(rl, `  MCP server URL:`, '');
      conn.mcp.postgres.enabled   = true;
      conn.database.type          = 'mcp';
      conn.database.enabled       = true;
      console.log(`\n  ${AMBER}To install Postgres MCP in Claude Code:${RESET}`);
      console.log(`  ${DIM}claude mcp add postgres${RESET}\n`);
    } else {
      conn.database.host     = await ask(rl, `  Host:`,     conn.database.host     || 'localhost');
      conn.database.port     = await ask(rl, `  Port:`,     conn.database.port     || '5432');
      conn.database.database = await ask(rl, `  Database:`, conn.database.database || 'adlc_db');
      conn.database.username = await ask(rl, `  Username:`, conn.database.username || 'postgres');
      conn.database.password = await ask(rl, `  Password:`, conn.database.password || '');
      conn.database.sslMode  = await ask(rl, `  SSL mode [disable/prefer/require]:`, 'prefer');
      conn.database.type     = 'postgresql';
      conn.database.enabled  = true;
    }
  }

  // -- Docker ------------------------------------------------------
  const doDocker = await askYN(rl, `\n${BOLD}[3/4] Configure Docker?${RESET}`);
  if (doDocker) {
    conn.docker.registryUrl      = await ask(rl, `  Registry URL (e.g. ghcr.io/username or Docker Hub):`, conn.docker.registryUrl || '');
    conn.docker.registryUsername = await ask(rl, `  Registry username:`, conn.docker.registryUsername || '');
    conn.docker.registryPassword = await ask(rl, `  Registry password/token:`, '');
    conn.docker.type             = 'local';
    conn.docker.enabled          = true;
    const test = tryExec('docker info');
    if (!test.ok) console.log(`  ${AMBER}[!][?]  Docker daemon not running  --  start Docker Desktop.${RESET}`);
  }

  // -- AWS ----------------------------------------------------------
  const doAWS = await askYN(rl, `\n${BOLD}[4/4] Configure AWS?${RESET}`);
  if (doAWS) {
    const method = await ask(rl, `  Auth method [profile / keys]:`, 'profile');
    conn.aws.region = await ask(rl, `  Region:`, conn.aws.region || 'us-east-1');
    if (method === 'profile') {
      conn.aws.profile = await ask(rl, `  AWS profile name:`, conn.aws.profile || 'default');
      conn.aws.type    = 'credentials';
    } else {
      conn.aws.accessKeyId     = await ask(rl, `  Access Key ID:`, '');
      conn.aws.secretAccessKey = await ask(rl, `  Secret Access Key:`, '');
      conn.aws.type = 'keys';
      console.log(`\n  ${RED}[!][?]  Avoid storing keys here  --  prefer AWS profiles${RESET}`);
    }
    conn.aws.enabled = true;
  }

  rl.close();

  // Save
  writeJSON(CONN_FILE, conn);
  console.log(`\n${GREEN}${BOLD}[OK] Connections saved to connections.json${RESET}`);
  console.log(`${DIM}(This file is in .gitignore and will NOT be pushed to GitHub)${RESET}\n`);

  // Run status
  showStatus();

  console.log(`${CYAN}${BOLD}Next steps:${RESET}`);
  console.log(`  Test connections:   node connect-tools.js --test github`);
  console.log(`  View permissions:   node connect-tools.js --permissions`);
  console.log(`  Grant permission:   node connect-tools.js --grant vikram github push`);
  console.log(`  Revoke permission:  node connect-tools.js --revoke keerthi aws\n`);
}

function showPermissions() {
  const perm = readJSON(PERM_FILE);
  if (!perm) { console.log(`${RED}No permissions file found.${RESET}`); return; }

  console.log(`\n${BOLD}${CYAN}Agent Tool Permissions${RESET}\n`);
  AGENTS.forEach(agent => {
    const a = perm.agents?.[agent] || {};
    console.log(`  ${BOLD}${agent.toUpperCase()}${RESET}  ${DIM}${a.notes || ''}${RESET}`);
    TOOLS.forEach(tool => {
      const t    = a[tool] || {};
      const icon = t.enabled ? `${GREEN}[OK]${RESET}` : `${DIM}[?] ${RESET}`;
      const perms = t.permissions?.length ? `[${t.permissions.join(', ')}]` : '';
      console.log(`    ${icon} ${tool.padEnd(12)} ${DIM}${perms}${RESET}`);
    });
    console.log('');
  });
}

// -- CLI ------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--status'))      showStatus();
else if (args.includes('--test'))   testConnection(args[args.indexOf('--test') + 1] || 'github');
else if (args.includes('--permissions')) showPermissions();
else if (args.includes('--grant'))  grantPermission(args[args.indexOf('--grant')+1], args[args.indexOf('--grant')+2], args[args.indexOf('--grant')+3]);
else if (args.includes('--revoke')) revokePermission(args[args.indexOf('--revoke')+1], args[args.indexOf('--revoke')+2]);
else wizard();
