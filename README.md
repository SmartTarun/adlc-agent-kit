# ADLC-Agent-Kit — Team Panchayat
**AI-Driven Development Lifecycle | Sprint Automation Kit**

| | |
|---|---|
| **Author** | Tarun Vangari |
| **Email** | tarun.vangari@gmail.com |
| **Role** | DevOps & Cloud Architect |
| **Version** | 1.0 |
| **Sprint** | 01 |
| **Date** | 2026-03-14 |

---

## What's in this Kit

```
ADLC-Agent-Kit\
│
├── README.md                  ← You are here
├── CLAUDE.md                  ← Project standards (auto-read by all agents)
├── agent-status.json          ← Shared state — agents write progress here
├── sprint-dashboard.html      ← Live sprint dashboard (open in browser)
├── sync-dashboard.js          ← Auto-syncs dashboard from agent-status.json
│
├── setup-workspace.bat        ← STEP 1: Run once to create project folders
├── start-agents.bat           ← STEP 2: Launch all agent windows (via PowerShell)
├── start-agents.ps1           ← STEP 2 alt: Run directly from PowerShell
├── HOW-TO-START-AGENTS.md     ← Full step-by-step guide
│
└── prompts\
    ├── arjun-prompt.txt       ← Orchestrator (paste into Arjun window)
    ├── vikram-prompt.txt      ← Cloud Architect / Terraform
    ├── rasool-prompt.txt      ← Database Agent / PostgreSQL
    ├── kavya-prompt.txt       ← UX Designer / Design Tokens
    ├── kiran-prompt.txt       ← Backend Engineer / FastAPI
    ├── rohan-prompt.txt       ← Frontend Engineer / React
    └── keerthi-prompt.txt     ← QA Agent (activate LAST)
```

---

## Quick Start (Windows PowerShell)

```powershell
# Step 1 — First time setup (creates project folders)
.\setup-workspace.bat

# Step 2 — Launch all agents
.\start-agents.ps1

# Step 3 — Open dashboard in browser
# C:\Users\<you>\TeamPanchayat\sprint-dashboard.html
```

---

## Agent Order

```
Phase 1 — Start in parallel:
  Arjun (Orchestrator) + Vikram + Rasool + Kavya

Phase 2 — Start after Phase 1 signals ready:
  Kiran (needs Rasool's DB schema)
  Rohan (needs Kavya's design tokens)

Phase 3 — Start only when ALL others are DONE:
  Keerthi (QA sign-off)
```

---

## Reusing for a New Sprint

1. Update sprint number in `CLAUDE.md`
2. Reset `agent-status.json` — set all agents back to `"status": "queue", "progress": 0`
3. Update task descriptions in each `prompts\*.txt` file
4. Run `start-agents.ps1` again

---

*Created by Tarun Vangari — tarun.vangari@gmail.com*
