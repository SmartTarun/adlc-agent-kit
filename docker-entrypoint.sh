#!/bin/sh
# Agent: Arjun | Sprint: dynamic | Date: 2026-03-25
# Entrypoint for all agent containers — role-based activation gates

set -e

AGENT_NAME="${AGENT_NAME:-arjun}"
WORKSPACE="${WORKSPACE:-/workspace}"
PROJECTS_DIR="${PROJECTS_DIR:-/projects}"
PROMPT_FILE="${WORKSPACE}/prompts/${AGENT_NAME}-prompt.txt"
LOG_FILE="${WORKSPACE}/agent-logs/${AGENT_NAME}.log"
MEMORY_FILE="${WORKSPACE}/agent-memory/${AGENT_NAME}-memory.json"
STATUS_FILE="${WORKSPACE}/agent-status.json"
REQUIREMENT_FILE="${WORKSPACE}/requirement.json"

# ── Agent role classification ─────────────────────────────────────────────
# pm         : arjun        — starts immediately
# team-lead  : kavya, vikram, rasool — wait for PM discovery complete
# builder    : kiran, rohan — wait for full sprint approval
# qa         : keerthi      — wait for sprint execution complete

get_role() {
  case "${AGENT_NAME}" in
    arjun)   echo "pm" ;;
    kavya|vikram|rasool) echo "team-lead" ;;
    kiran|rohan)         echo "builder" ;;
    keerthi)             echo "qa" ;;
    *)                   echo "builder" ;;
  esac
}

ROLE=$(get_role)

echo "============================================================"
echo " ADLC Agent Kit — Container Starting"
echo " Agent : ${AGENT_NAME} (${ROLE})"
echo " Time  : $(date -Iseconds)"
echo "============================================================"

# ── Ensure workspace directories exist ───────────────────────────────────
mkdir -p "${WORKSPACE}/agent-logs"
mkdir -p "${WORKSPACE}/agent-memory"
mkdir -p "${PROJECTS_DIR}"

# ── Guard: prompt file must exist ────────────────────────────────────────
if [ ! -f "${PROMPT_FILE}" ]; then
  echo "[ERROR] Prompt file not found: ${PROMPT_FILE}"
  echo "[ERROR] Make sure the workspace is correctly mounted."
  exit 1
fi

# ── Set standby status helper ────────────────────────────────────────────
set_standby() {
  STANDBY_TASK="$1"
  STANDBY_BLOCKER="$2"
  node -e "
  const fs = require('fs');
  let s = {};
  try { s = JSON.parse(fs.readFileSync('${STATUS_FILE}', 'utf8')); } catch(e) {}
  s['${AGENT_NAME}'] = {
    status: 'standby',
    role: '${ROLE}',
    progress: 0,
    task: '${STANDBY_TASK}',
    blocker: '${STANDBY_BLOCKER}',
    container: true,
    updated: new Date().toISOString()
  };
  fs.writeFileSync('${STATUS_FILE}', JSON.stringify(s, null, 2));
  " 2>/dev/null
}

# ── Poll helper — check a JSON field ─────────────────────────────────────
check_field() {
  FIELD_PATH="$1"   # e.g. "discoveryComplete"
  EXPECTED="$2"     # e.g. "true"
  node -e "
    try {
      const r = JSON.parse(require('fs').readFileSync('${REQUIREMENT_FILE}', 'utf8'));
      const keys = '${FIELD_PATH}'.split('.');
      let val = r;
      for (const k of keys) { val = val && val[k]; }
      process.stdout.write(String(val) === '${EXPECTED}' ? 'yes' : 'no');
    } catch(e) { process.stdout.write('no'); }
  " 2>/dev/null
}

# ── Gate: Team Leads wait for PM discovery complete ───────────────────────
if [ "${ROLE}" = "team-lead" ]; then
  echo "[gate] Team lead — waiting for PM discovery to complete..."
  set_standby "Waiting for PM (Arjun) to complete discovery" "requirement.discoveryComplete not yet true"

  WAITED=0; MAX_WAIT=7200
  while [ "${WAITED}" -lt "${MAX_WAIT}" ]; do
    READY=$(check_field "discoveryComplete" "true")
    if [ "${READY}" = "yes" ]; then
      echo "[gate] PM discovery complete — ${AGENT_NAME} activating for team discovery!"
      break
    fi
    sleep 20
    WAITED=$((WAITED + 20))
    [ $((WAITED % 120)) -eq 0 ] && echo "[gate] Waiting for PM discovery... (${WAITED}s)"
  done

  if [ "${READY}" != "yes" ]; then
    echo "[gate] Timed out (${MAX_WAIT}s). Exiting."
    exit 1
  fi
fi

# ── Gate: Builders wait for full sprint approval ──────────────────────────
if [ "${ROLE}" = "builder" ]; then
  echo "[gate] Builder — waiting for full sprint approval (PM + team discovery + Tarun sign-off)..."
  set_standby "Waiting for sprint approval (all team discovery + Tarun sign-off)" "requirement.approvedByTarun not yet true"

  WAITED=0; MAX_WAIT=7200
  while [ "${WAITED}" -lt "${MAX_WAIT}" ]; do
    READY=$(check_field "approvedByTarun" "true")
    if [ "${READY}" = "yes" ]; then
      echo "[gate] Sprint approved — ${AGENT_NAME} activating to build!"
      break
    fi
    sleep 20
    WAITED=$((WAITED + 20))
    [ $((WAITED % 120)) -eq 0 ] && echo "[gate] Waiting for sprint approval... (${WAITED}s)"
  done

  if [ "${READY}" != "yes" ]; then
    echo "[gate] Timed out (${MAX_WAIT}s). Exiting."
    exit 1
  fi
fi

# ── Gate: QA waits for sprint execution complete ──────────────────────────
if [ "${ROLE}" = "qa" ]; then
  echo "[gate] QA agent — waiting for all build agents to complete..."
  set_standby "QA on standby — waiting for build agents to finish" "Not all build agents are done yet"

  WAITED=0; MAX_WAIT=14400
  while [ "${WAITED}" -lt "${MAX_WAIT}" ]; do
    ALL_DONE=$(node -e "
      try {
        const s = JSON.parse(require('fs').readFileSync('${STATUS_FILE}', 'utf8'));
        const builders = ['vikram','rasool','kavya','kiran','rohan'];
        const done = builders.every(a => s[a] && s[a].status === 'done');
        process.stdout.write(done ? 'yes' : 'no');
      } catch(e) { process.stdout.write('no'); }
    " 2>/dev/null)

    if [ "${ALL_DONE}" = "yes" ]; then
      echo "[gate] All build agents done — Keerthi activating for QA!"
      break
    fi
    sleep 30
    WAITED=$((WAITED + 30))
    [ $((WAITED % 180)) -eq 0 ] && echo "[gate] QA waiting for build agents... (${WAITED}s)"
  done

  if [ "${ALL_DONE}" != "yes" ]; then
    echo "[gate] Timed out (${MAX_WAIT}s). Exiting."
    exit 1
  fi
fi

# ── Update agent-status.json to 'starting' ───────────────────────────────
node -e "
const fs = require('fs');
let s = {};
try { s = JSON.parse(fs.readFileSync('${STATUS_FILE}', 'utf8')); } catch(e) {}
s['${AGENT_NAME}'] = {
  status: 'starting',
  role: '${ROLE}',
  progress: 0,
  task: 'Container initialising',
  blocker: '',
  container: true,
  updated: new Date().toISOString()
};
fs.writeFileSync('${STATUS_FILE}', JSON.stringify(s, null, 2));
console.log('[status] Set ${AGENT_NAME} (${ROLE}) -> starting');
"

# ── Load and display memory summary ──────────────────────────────────────
if [ -f "${MEMORY_FILE}" ]; then
  echo "[memory] Loading previous session memory..."
  node -e "
    const m = require('${MEMORY_FILE}');
    console.log('[memory] Sessions:', m.sessionCount || 0);
    console.log('[memory] Last active:', m.lastActive || 'never');
    if (m.currentTask && m.currentTask.title) {
      console.log('[memory] Resuming task:', m.currentTask.title, '(' + (m.currentTask.progressPercent||0) + '%)');
    }
  " 2>/dev/null || true
else
  echo "[memory] No previous session — starting fresh"
fi

# ── Rotate log file if > 5MB ─────────────────────────────────────────────
if [ -f "${LOG_FILE}" ]; then
  LOG_SIZE=$(wc -c < "${LOG_FILE}" 2>/dev/null || echo 0)
  if [ "${LOG_SIZE}" -gt 5242880 ]; then
    mv "${LOG_FILE}" "${LOG_FILE}.$(date +%Y%m%d%H%M%S).bak"
    echo "[log] Rotated previous log file"
  fi
fi

# ── Run the Claude Code agent ─────────────────────────────────────────────
echo "[agent] Starting claude CLI for ${AGENT_NAME} (${ROLE})..."
echo "============================================================"

PROMPT=$(cat "${PROMPT_FILE}")

exec claude \
  --print "${PROMPT}" \
  --dangerously-skip-permissions \
  2>&1 | tee -a "${LOG_FILE}"
