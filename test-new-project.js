/**
 * test-new-project.js
 * Unit tests for new project creation via POST /api/requirement
 * Uses Node.js built-in test runner (node:test) — no dependencies needed.
 *
 * Run: node test-new-project.js
 */

const { test, describe, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const http    = require('node:http');
const fs      = require('node:fs');
const path    = require('node:path');
const os      = require('node:os');

// ── Helpers ──────────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts    = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    const req = http.request(url, opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Test setup ────────────────────────────────────────────────────────────────
// We start the real dashboard-server on a random port and hit it over HTTP.
// The server reads/writes files relative to its own ROOT (__dirname).

const TEST_PORT  = 3099;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess;

before(async () => {
  const { spawn } = require('node:child_process');
  serverProcess = spawn(process.execPath, ['dashboard-server.js', '--port', String(TEST_PORT)], {
    cwd: path.join(__dirname),
    env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait until the server logs its ready banner
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start in time')), 10000);
    const onData = chunk => {
      if (chunk.toString().includes('ADLC Live Dashboard')) { clearTimeout(timeout); resolve(); }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onData);
    serverProcess.on('error', reject);
  });
});

after(() => {
  if (serverProcess) serverProcess.kill();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/requirement — new project creation', () => {

  test('returns ok:true and a projectId with default options', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:       'Test Dashboard Project',
      description: 'Automated unit test project',
      type:        'new_project',
    });

    assert.equal(res.status, 200, 'HTTP status should be 200');
    assert.equal(res.body.ok, true, 'response.ok should be true');
    assert.ok(res.body.requirementId.startsWith('REQ-'), 'requirementId should start with REQ-');
    assert.ok(res.body.projectId, 'projectId should be present');
  });

  test('requirement.json is created with correct defaults', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:       'Default Options Test',
      description: 'Testing default field population',
      type:        'new_project',
    });

    assert.equal(res.status, 200);
    const projectDir = path.join(__dirname, 'projects', res.body.projectId);
    const req = readJSON(path.join(projectDir, 'requirement.json'));

    assert.equal(req.title,            'Default Options Test');
    assert.equal(req.type,             'new_project');
    assert.equal(req.priority,         'medium',           'default priority should be medium');
    assert.equal(req.status,           'pending_analysis', 'status should be pending_analysis');
    assert.equal(req.discoveryComplete, false,             'discoveryComplete should be false');
    assert.equal(req.approvedByTarun,  false,             'approvedByTarun should be false');
    assert.equal(req.sprintPlan,       '',                'sprintPlan should be empty');
    assert.deepEqual(req.techConstraints, [],             'techConstraints should default to []');
    assert.ok(req.requirementId.startsWith('REQ-'),      'requirementId should be set');
    assert.ok(req.postedAt,                               'postedAt should be set');
  });

  test('agent-status.json resets all agents to queue', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:       'Agent Status Reset Test',
      description: 'Checking agent status initialisation',
      type:        'new_project',
      sprint:      '02',
    });

    assert.equal(res.status, 200);
    const projectDir = path.join(__dirname, 'projects', res.body.projectId);
    const status = readJSON(path.join(projectDir, 'agent-status.json'));

    const agents = ['arjun','vikram','rasool','kavya','kiran','rohan','keerthi'];
    for (const agent of agents) {
      assert.ok(status.agents[agent],                         `${agent} should exist in agent-status`);
      assert.equal(status.agents[agent].status, 'queue',     `${agent} status should be queue`);
      assert.equal(status.agents[agent].progress, 0,         `${agent} progress should be 0`);
    }
    assert.equal(status.sprint, '02', 'sprint should be set from payload');
  });

  test('group-chat.json contains discovery message tagged to tarun only', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:       'Chat Message Test',
      description: 'Verifying discovery-only tagging',
      type:        'new_project',
    });

    assert.equal(res.status, 200);
    const projectDir = path.join(__dirname, 'projects', res.body.projectId);
    const chat = readJSON(path.join(projectDir, 'group-chat.json'));

    const arjunMsg = chat.messages.find(m => m.from === 'ARJUN' && m.type === 'discovery');
    assert.ok(arjunMsg, 'Arjun should post a discovery message');
    assert.ok(arjunMsg.tags.includes('tarun'),      'discovery message should be tagged tarun');
    assert.ok(!arjunMsg.tags.includes('all-agents'), 'discovery message must NOT tag all-agents');

    const allAgentsBroadcast = chat.messages.find(
      m => m.tags && m.tags.includes('all-agents') && m.type !== 'requirement'
    );
    assert.equal(allAgentsBroadcast, undefined, 'no all-agents broadcast should be sent before discovery');
  });

  test('active-project.json switches to the new project', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:       'Active Project Switch Test',
      description: 'Verify active project is updated',
      type:        'new_project',
      sprint:      '03',
    });

    assert.equal(res.status, 200);
    const ap = readJSON(path.join(__dirname, 'active-project.json'));
    assert.ok(ap.current.includes(res.body.projectId), 'active-project.json should point to new project');
    assert.equal(ap.name, 'Active Project Switch Test');
  });

  test('techConstraints parses comma-separated string', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:           'Constraints Parse Test',
      description:     'Testing techConstraints parsing',
      type:            'new_project',
      techConstraints: 'AWS, PostgreSQL, React',
    });

    assert.equal(res.status, 200);
    const projectDir = path.join(__dirname, 'projects', res.body.projectId);
    const req = readJSON(path.join(projectDir, 'requirement.json'));
    assert.deepEqual(req.techConstraints, ['AWS', 'PostgreSQL', 'React']);
  });

  test('techConstraints accepts array directly', async () => {
    const res = await post(`${SERVER_URL}/api/requirement`, {
      title:           'Constraints Array Test',
      description:     'Testing techConstraints array input',
      type:            'new_project',
      techConstraints: ['Docker', 'Terraform'],
    });

    assert.equal(res.status, 200);
    const projectDir = path.join(__dirname, 'projects', res.body.projectId);
    const req = readJSON(path.join(projectDir, 'requirement.json'));
    assert.deepEqual(req.techConstraints, ['Docker', 'Terraform']);
  });

  test('returns 400 when body is malformed JSON', async () => {
    const res = await new Promise((resolve, reject) => {
      const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const req  = http.request(`${SERVER_URL}/api/requirement`, opts, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write('{bad json');
      req.end();
    });

    assert.equal(res.status, 400, 'malformed JSON should return 400');
    assert.ok(res.body.error, 'error field should be present');
  });

});
