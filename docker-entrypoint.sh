#!/bin/sh
# Agent: Arjun | Sprint: 01 | Date: 2026-03-14
# Entrypoint for all agent containers

set -e

AGENT_NAME="${AGENT_NAME:-arjun}"
WORKSPACE="${WORKSPACE:-/workspace}"
PROMPT_FILE="${WORKSPACE}/prompts/${AGENT_NAME}-prompt.txt"
LOG_FILE="${WORKSPACE}/agent-logs/${AGENT_NAME}.log"
MEMORY_FILE="${WORKSPACE}/agent-memory/${AGENT_NAME}-memory.json"
STATUS_FILE="${WORKSPACE}/agent-status.json"

echo "============================================================"
echo " ADLC Agent Kit — Container Starting"
echo " Agent : ${AGENT_NAME}"
echo " Time  : $(date -Iseconds)"
echo "============================================================"

# ── Ensure workspace directories exist ───────────────────────────────────
mkdir -p "${WORKSPACE}/agent-logs"
mkdir -p "${WORKSPACE}/agent-memory"
mkdir -p "${WORKSPACE}/agent-logs"

# ── Guard: prompt file must exist ────────────────────────────────────────
if [ ! -f "${PROMPT_FILE}" ]; then
  echo "[ERROR] Prompt file not found: ${PROMPT_FILE}"
  echo "[ERROR] Make sure the workspace is correctly mounted."
  exit 1
fi

# ── Update agent-status.json to 'starting' ───────────────────────────────
node -e "
const fs = require('fs');
const path = '${STATUS_FILE}';
let s = {};
try { s = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
s['${AGENT_NAME}'] = {
  status: 'starting',
  progress: 0,
  task: 'Container initialising',
  blocker: '',
  container: true,
  updated: new Date().toISOString()
};
fs.writeFileSync(path, JSON.stringify(s, null, 2));
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
