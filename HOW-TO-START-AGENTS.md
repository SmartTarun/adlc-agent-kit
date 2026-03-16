# Team Panchayat -- ADLC Agent Startup Guide

**Version**: 3.1 | **Date**: 2026-03-16 | **Author**: Tarun Vangari

---

## STEP 0 -- One-Time: Allow PowerShell Scripts

Open PowerShell and run this once:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## STEP 1 -- First-Time: Create Folder Structure

Double-click `setup-workspace.bat` (or run from CMD):
```cmd
setup-workspace.bat
```

This creates all required sub-folders inside the kit directory:
```
infra\modules\s3\
infra\modules\cloudwatch\
infra\modules\iam\
infra\modules\ecs\
backend\app\routers\
backend\app\schemas\
backend\migrations\
backend\tests\
frontend\src\components\
frontend\src\tokens\
docs\
agent-logs\
agent-memory\
prompts\
```

---

## STEP 2 -- First-Time: Authorize Agents

Double-click `authorize-agents.bat` (or run in PowerShell):
```powershell
.\authorize-agents.ps1
```

This one-time setup does 6 things:
1. Checks `claude` CLI is installed
2. Prompts for your `ANTHROPIC_API_KEY` (sk-ant-...)
3. Saves the key to Windows User environment variables (survives reboots)
4. Writes a `.env` file for Docker mode
5. Writes `.claude\settings.json` with all tool permissions pre-approved (no mid-session prompts)
6. Runs a live test: `claude --print "Reply AUTHORIZED"` to verify your key works

**If you do not have the claude CLI yet:**
```powershell
npm install -g @anthropic-ai/claude-code
```

---

## STEP 3 -- Launch All Agent Windows

There are TWO launch modes. Choose one:

### Option A -- AUTO-RUN (recommended: agents start immediately)

```cmd
start-agents.bat autorun
```
Or from PowerShell:
```powershell
.\start-agents.ps1 -AutoRun
```

Each agent window opens, reads its prompt file automatically, and begins working.
**No manual pasting required.** This is the mode to use when you have a requirement ready.

To auto-run a single agent only:
```cmd
start-agents.bat autorun vikram
```

### Option B -- INTERACTIVE (manual prompt paste)

```cmd
start-agents.bat
```
(double-click, or run with no arguments)

Windows open with an empty `claude` session. **You must paste the prompt manually into each window** from the `prompts\` folder. Use this when you want to control exactly when each agent starts.

---

Either mode opens **8 windows**:

| Window Title | Color | Role |
|---|---|---|
| ADLC-Dashboard | Green | dashboard-server.js on :3000 |
| ARJUN-Orchestrator | Magenta | PM / Discovery Interview |
| VIKRAM-CloudArchitect | Red | Terraform / AWS |
| RASOOL-DatabaseAgent | Yellow | PostgreSQL / Alembic |
| KIRAN-BackendEngineer | Cyan | FastAPI / Pydantic |
| KAVYA-UXDesigner | Magenta | Design Tokens / Gemini images |
| ROHAN-FrontendEngineer | Blue | React / Recharts |
| KEERTHI-QA | White | QA sign-off (last to activate) |

The dashboard browser tab opens automatically at **http://localhost:3000** after a few seconds.

---

## STEP 4 -- Open Dashboard

The dashboard opens automatically. If it does not:
```
http://localhost:3000
```

Keep it open -- it updates in real time via SSE. No manual refresh needed.

> Previous versions served a static HTML file. v3.1 serves from the Node.js dashboard
> server. Always use http://localhost:3000 (not a file:// path).

---

## STEP 5 -- Post a New Requirement

**Option A -- Dashboard wizard (recommended):**
1. Click **"+ New Requirement"** in the top bar
2. Fill in the 8 fields: Title, Sprint, Type, Priority, Description, Business Goal, Target Users, Deadline/Constraints
3. Click **"Post to Team"**

**Option B -- CLI wizard:**
```powershell
node new-project.js
```

All agents are notified immediately via group chat and `requirement.json`.

---

## STEP 6 -- PM Discovery Interview (Arjun)

After the requirement is posted, Arjun runs a **3-round interview** before any code is assigned. Watch the **Discovery Panel** in the dashboard (highlighted blue section).

```
Round 1 -- Vision (5 questions)
  Arjun asks about: problem, user personas, KPIs, MVP scope, out-of-scope

Round 2 -- Technical (5 questions)
  Arjun asks about: infrastructure, performance, integrations, security, data model

Round 3 -- Delivery & Risk (4 questions)
  Arjun asks about: deadline, top risks, acceptance criteria, hard constraints
```

**How to answer:**
- Type your answer in the Discovery Panel textarea in the dashboard
- Click "Send to Arjun"
- Arjun posts the next question automatically

**Fast-track**: In Arjun's agent window, type:
```
Skip questions -- here is the full context: [paste everything you know]
```

**RULE: No agent starts coding until Arjun sets `discoveryComplete = true`.**

---

## STEP 7 -- Paste Prompts to Agent Windows

Arjun self-starts from `prompts\arjun-prompt.txt`. For other agents, paste the prompt into their window. Follow this order:

```
Phase 1 -- Paste all at once (they work in parallel):
  ARJUN window    <- prompts\arjun-prompt.txt   (already auto-started)
  VIKRAM window   <- prompts\vikram-prompt.txt
  RASOOL window   <- prompts\rasool-prompt.txt
  KAVYA window    <- prompts\kavya-prompt.txt

Phase 2 -- Paste after Phase 1 agents confirm they are ready:
  KIRAN window    <- prompts\kiran-prompt.txt   (after Rasool: DB schema done)
  ROHAN window    <- prompts\rohan-prompt.txt   (after Kavya: design tokens done)

Phase 3 -- Paste ONLY when all other agents are DONE:
  KEERTHI window  <- prompts\keerthi-prompt.txt
```

**How to copy a prompt file quickly:**
```powershell
# In PowerShell (copies file content to clipboard):
Get-Content prompts\vikram-prompt.txt | Set-Clipboard
# Then Ctrl+V into the Claude agent window
```

Or open the .txt in Notepad, Ctrl+A, Ctrl+C, paste into the window.

---

## STEP 8 -- Monitor Progress

### Dashboard (recommended)
- Kanban board shows all 7 agents as cards in Queue / In Progress / Done columns
- Group chat panel shows real-time messages from all agents
- Requirement banner shows how many agents have submitted their inputs (e.g. `3/7`)

### CLI monitoring
```powershell
# Watch group chat live
node group-chat-viewer.js --watch

# Check agent inputs for current requirement
node new-project.js --inputs

# Check requirement status
node new-project.js --status

# View agent memory state
node memory-manager.js
node memory-manager.js vikram       # one agent
node memory-manager.js --watch      # live
```

---

## STEP 9 -- Approve the Sprint Plan

Once all agents have submitted inputs, Arjun generates a sprint plan.

**Option A -- Dashboard:** Click **"Approve Sprint Plan"** button in the requirement banner.

**Option B -- CLI:**
```powershell
node new-project.js --approve
```

This sets `approvedByTarun = true` in `requirement.json` and moves all 5 build agents to WIP status. Sprint execution begins immediately.

---

## STEP 10 -- Sprint Complete

When all 6 build agents show DONE on the dashboard:
- Arjun auto-broadcasts: "Sprint complete. Ready for QA."
- Keerthi activates and runs full QA sign-off
- QA report saved to: `docs\qa-report.md`

---

## Quick Reference -- Agent Ownership

| Agent | Model | Owns | Depends On |
|---|---|---|---|
| ARJUN | Claude Opus | Orchestration, discovery, planning | Nothing -- runs first |
| VIKRAM | Claude Sonnet | `/infra/modules/` | Product brief from Arjun |
| RASOOL | Claude Sonnet | `/backend/migrations/` | Product brief from Arjun |
| KAVYA | Claude Sonnet | `/frontend/src/tokens/` | Product brief from Arjun |
| KIRAN | Claude Sonnet | `/backend/app/` | Rasool: DB schema |
| ROHAN | Claude Sonnet | `/frontend/src/components/` | Kavya: design tokens |
| KEERTHI | Claude Sonnet | Read-only + `/docs/qa-report.md` | All 6 agents DONE |

---

## Troubleshooting

**Agent window closed accidentally?**
```powershell
# Reopen a window manually:
claude --dangerously-skip-permissions
# Re-paste the agent's prompt from prompts\ folder
```

**Dashboard not loading at http://localhost:3000?**
```powershell
# Check if dashboard-server.js is running, if not:
node dashboard-server.js
# Then open http://localhost:3000
```

**Chat messages not appearing in dashboard?**
The dashboard reads `group-chat.json -> messages[]`. Verify the file is valid JSON:
```powershell
node -e "console.log(JSON.parse(require('fs').readFileSync('group-chat.json','utf8')).messages.length + ' messages')"
```

**API key not working?**
```powershell
# Re-run authorization:
.\authorize-agents.ps1
```

**Permission prompts still appearing?**
Check `.claude\settings.json` exists and contains the `permissions.allow` array:
```powershell
type .claude\settings.json
```

**Agent forgot its role?**
Paste this at the top of a new message in the agent window:
```
Re-read CLAUDE.md and your original prompt from prompts\<name>-prompt.txt.
Continue from where you left off. Your current status is in agent-status.json.
```

**PowerShell says "not digitally signed"?**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Node.js not found?**
Download from https://nodejs.org -- install LTS version, then restart your terminal.

**Docker containers not starting?**
```powershell
# Check Docker Desktop is running, then:
docker compose ps
docker compose logs arjun
```
