# Team Panchayat — ADLC Agent Startup Guide (Windows CMD)

---

## STEP 1 — First-Time Setup (do once)

Open CMD and run:
```
cd %USERPROFILE%\Downloads
setup-workspace.bat
```
This creates the full project at `C:\Users\<you>\TeamPanchayat\`

---

## STEP 2 — Start All Agent Windows

Double-click `start-agents.bat` from your Downloads folder.

This opens **7 CMD windows** at once:
```
┌─────────────────────────────────────────────┐
│  Window Title               │  Color         │
├─────────────────────────────┼────────────────┤
│  ADLC-Dashboard-Sync        │  Green         │
│  ARJUN-Orchestrator         │  Magenta       │
│  VIKRAM-CloudArchitect      │  Red           │
│  RASOOL-DatabaseAgent       │  Yellow        │
│  KIRAN-BackendEngineer      │  Cyan          │
│  KAVYA-UXDesigner           │  Magenta       │
│  ROHAN-FrontendEngineer     │  Blue          │
└─────────────────────────────────────────────┘
```

---

## STEP 3 — Open the Dashboard in Browser

Open this file in Chrome/Edge:
```
C:\Users\<YourName>\TeamPanchayat\sprint-dashboard.html
```
Keep it open — it auto-updates when agents write to `agent-status.json`.

To manually refresh dashboard at any time:
```
cd C:\Users\<YourName>\TeamPanchayat
node sync-dashboard.js
```

---

## STEP 4 — Paste Prompts to Each Agent Window

### ORDER matters — follow this sequence:

```
Phase 1 (paste all at same time — they work in parallel):
  → ARJUN window   : paste contents of prompts\arjun-prompt.txt
  → VIKRAM window  : paste contents of prompts\vikram-prompt.txt
  → RASOOL window  : paste contents of prompts\rasool-prompt.txt
  → KAVYA window   : paste contents of prompts\kavya-prompt.txt

Phase 2 (paste when Phase 1 agents confirm ready):
  → KIRAN window   : paste contents of prompts\kiran-prompt.txt  (after Rasool done)
  → ROHAN window   : paste contents of prompts\rohan-prompt.txt  (after Kavya done)

Phase 3 (paste only when ALL other agents are DONE):
  → KEERTHI window : paste contents of prompts\keerthi-prompt.txt
```

### How to paste a prompt file quickly:
```cmd
REM In any agent CMD window, run:
type C:\Users\<YourName>\TeamPanchayat\prompts\vikram-prompt.txt | clip
REM Then Ctrl+V into the Claude prompt
```

Or open the .txt file in Notepad, select all (Ctrl+A), copy, paste into CMD.

---

## STEP 5 — Monitoring Agent Progress

### Watch the Dashboard
Refresh `sprint-dashboard.html` in browser to see live progress.

### Check status from CMD:
```cmd
cd C:\Users\<YourName>\TeamPanchayat
type agent-status.json
```

### Force dashboard refresh:
```cmd
node sync-dashboard.js
```

### Switch between agent windows
Use `Alt+Tab` or click the taskbar icons — each window has a coloured title bar.

---

## STEP 6 — When an Agent Updates Their Status

Each agent is instructed to update `agent-status.json` after each task step.
The Dashboard Sync watcher (green window) auto-detects changes and refreshes the HTML.

If an agent gets **BLOCKED**, you'll see the red banner on the dashboard.
Click into that agent's window and give them additional instructions.

---

## STEP 7 — Sprint Complete

When all 6 agents show ✅ DONE:
- Dashboard shows 🟢 ON TRACK with 100%
- Arjun auto-broadcasts: "Ready to ship!"
- Keerthi's QA report is at: `C:\Users\<YourName>\TeamPanchayat\docs\qa-report.md`

---

## Quick Reference — Agent Windows

| Alt+Tab to... | Agent | Model | Owns |
|---|---|---|---|
| ARJUN | PM/Orchestrator | Opus | Everything — monitoring |
| VIKRAM | Cloud Architect | Sonnet | /infra/modules/ |
| RASOOL | DB Agent | Sonnet | /backend/migrations/ |
| KAVYA | UX Designer | Sonnet | /frontend/src/tokens/ |
| KIRAN | Backend Eng | Sonnet | /backend/app/ |
| ROHAN | Frontend Eng | Sonnet | /frontend/src/components/ |
| KEERTHI | QA Agent | Sonnet | Read-only + /docs/qa-report.md |

---

## Troubleshooting

**Agent window closed accidentally?**
```cmd
cd C:\Users\<YourName>\TeamPanchayat
claude --model claude-sonnet-4-5
```
Re-paste the agent's prompt from the prompts\ folder.

**Dashboard not updating?**
```cmd
cd C:\Users\<YourName>\TeamPanchayat
node sync-dashboard.js
```

**Agent forgot its role?**
Paste this reminder at the top of a new message:
```
Re-read CLAUDE.md and your original prompt. Continue from where you left off.
Your current status is in agent-status.json.
```

**Node.js not found?**
Download from https://nodejs.org — install LTS version, restart CMD.
