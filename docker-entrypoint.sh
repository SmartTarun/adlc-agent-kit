#!/bin/sh
# Agent: Arjun | Sprint: 01 | Date: 2026-03-25
# Entrypoint for all agent containers

set -e

AGENT_NAME="${AGENT_NAME:-arjun}"
WORKSPACE="${WORKSPACE:-/workspace}"
PROMPT_FILE="${WORKSPACE}/prompts/${AGENT_NAME}-prompt.txt"
LOG_FILE="${WORKSPACE}/agent-logs/${AGENT_NAME}.log"
MEMORY_FILE="${WORKSPACE}/agent-memory/${AGENT_NAME}-memory.json"
STATUS_FILE="${WORKSPACE}/agent-status.json"
REQUIREMENT_FILE="${WORKSPACE}/requirement.json"

echo "============================================================"
echo " ADLC Agent Kit — Container Starting"
echo " Agent : ${AGENT_NAME}"
echo " Time  : $(date -Iseconds)"
echo "============================================================"

# ── Ensure workspace directories exist ───────────────────────────────────
mkdir -p "${WORKSPACE}/agent-logs"
mkdir -p "${WORKSPACE}/agent-memory"

# ── Guard: prompt file must exist ────────────────────────────────────────
if [ ! -f "${PROMPT_FILE}" ]; then
  echo "[ERROR] Prompt file not found: ${PROMPT_FILE}"
  echo "[ERROR] Make sure the workspace is correctly mounted."
  exit 1
fi

# ── Specialist agents wait for sprint approval (Arjun runs immediately) ──
if [ "${AGENT_NAME}" != "arjun" ]; then
  echo "[gate] Specialist agent — waiting for Arjun to complete discovery and get sprint approved..."

  node -e "
  const fs = require('fs');
  let s = {};
  try { s = JSON.parse(fs.readFileSync('${STATUS_FILE}', 'utf8')); } catch(e) {}
  s['${AGENT_NAME}'] = {
    status: 'standby',
    progress: 0,
    task: 'Waiting for PM discovery and sprint approval',
    blocker: 'approvedByTarun not yet true in requirement.json',
    container: true,
    updated: new Date().toISOString()
  };
  fs.writeFileSync('${STATUS_FILE}', JSON.stringify(s, null, 2));
  console.log('[status] Set ${AGENT_NAME} -> standby');
  "

  WAITED=0
  MAX_WAIT=3600
  while [ "${WAITED}" -lt "${MAX_WAIT}" ]; do
    APPROVED=$(node -e "
      try {
        const r = JSON.parse(require('fs').readFileSync('${REQUIREMENT_FILE}', 'utf8'));
        process.stdout.write(r.approvedByTarun === true ? 'true' : 'false');
      } catch(e) { process.stdout.write('false'); }
    " 2>/dev/null)

    if [ "${APPROVED}" = "true" ]; then
      echo "[gate] Sprint approved! ${AGENT_NAME} activating..."
      break
    fi

    sleep 15
    WAITED=$((WAITED + 15))
    if [ $((WAITED % 60)) -eq 0 ]; then
      echo "[gate] Still waiting for sprint approval... (${WAITED}s elapsed)"
    fi
  done

  if [ "${APPROVED}" != "true" ]; then
    echo "[gate] Timed out waiting for sprint approval after ${MAX_WAIT}s. Exiting."
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
  progress: 0,
  task: 'Container initialising',
  blocker: '',
  container: true,
  updated: new Date().toISOString()
};
fs.writeFileSync('${STATUS_FILE}', JSON.stringify(s, null, 2));
console.log('[status] Set ${AGENT_NAME} -> starting');
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
echo "[agent] Starting claude CLI for ${AGENT_NAME}..."
echo "============================================================"

PROMPT=$(cat "${PROMPT_FILE}")

exec claude \
  --print "${PROMPT}" \
  --dangerously-skip-permissions \
  2>&1 | tee -a "${LOG_FILE}"
