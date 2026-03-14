# ADLC-Agent-Kit — Team Panchayat
**AI-Driven Development Lifecycle | Sprint Automation Kit**

| | |
|---|---|
| **Author** | Tarun Vangari |
| **Email** | tarun.vangari@gmail.com |
| **Role** | DevOps & Cloud Architect |
| **Version** | 2.0 |
| **Sprint** | 01 |
| **Date** | 2026-03-14 |

---

## Overview

ADLC-Agent-Kit orchestrates **7 named Claude AI agents** in parallel across your full software stack — infrastructure, backend, frontend, database, UX, and QA — all coordinated by a central orchestrator (Arjun) and tracked on a **live web dashboard at `http://localhost:3000`**.

Agents have persistent memory, a shared group chat, real-time tool connections (GitHub, PostgreSQL, Docker, AWS), and a new-project wizard so every agent analyses requirements before any code is written.

---

## What's in this Kit

```
ADLC-Agent-Kit\
│
├── README.md                      ← You are here
├── CLAUDE.md                      ← Project standards (auto-read by all agents)
├── PUSH-TO-GITHUB.md              ← Git push guide
├── HOW-TO-START-AGENTS.md         ← Step-by-step startup guide
├── ADLC-Agent-Kit-Installation-Guide.docx
│
├── ── STARTUP ──────────────────────────────────────────────────
├── setup-workspace.bat            ← STEP 1: Creates project folder structure
├── start-agents.bat               ← STEP 2: Launcher (opens all windows via PS)
├── start-agents.ps1               ← STEP 2 alt: Run directly from PowerShell
│
├── ── LIVE DASHBOARD ───────────────────────────────────────────
├── dashboard-server.js            ← HTTP server → http://localhost:3000
├── sprint-dashboard.html          ← Dashboard UI (auto-pushed via SSE)
├── sync-dashboard.js              ← Manual sync fallback
│
├── ── AGENT STATE ──────────────────────────────────────────────
├── agent-status.json              ← Shared progress tracker (all agents write here)
├── agent-memory\                  ← Per-agent persistent memory
│   ├── arjun-memory.json
│   ├── vikram-memory.json
│   ├── rasool-memory.json
│   ├── kavya-memory.json
│   ├── kiran-memory.json
│   ├── rohan-memory.json
│   └── keerthi-memory.json
├── memory-manager.js              ← View, watch, reset agent memory
│
├── ── GROUP CHAT ───────────────────────────────────────────────
├── group-chat.json                ← Shared team channel (all agents post here)
├── group-chat-viewer.js           ← Live terminal chat viewer
│
├── ── NEW PROJECT WORKFLOW ─────────────────────────────────────
├── requirement.json               ← Tarun posts new requirements here
├── new-project.js                 ← Interactive wizard + broadcasts to all agents
│
├── ── TOOL CONNECTIONS ─────────────────────────────────────────
├── connections.json               ← GitHub / PostgreSQL / Docker / AWS creds (gitignored)
├── connect-tools.js               ← Interactive connection setup wizard
├── tool-permissions.json          ← Per-agent tool access control
│
├── ── GITHUB ───────────────────────────────────────────────────
├── .gitignore
├── .github\
│   ├── pull_request_template.md
│   ├── repo-meta.md
│   └── ISSUE_TEMPLATE\
│       ├── bug_report.md
│       └── new_agent.md
│
└── ── AGENT PROMPTS ────────────────────────────────────────────
    prompts\
    ├── arjun-prompt.txt           ← Orchestrator (Claude Opus)
    ├── vikram-prompt.txt          ← Cloud Architect / Terraform / AWS
    ├── rasool-prompt.txt          ← Database Agent / PostgreSQL
    ├── kavya-prompt.txt           ← UX Designer / Design Tokens
    ├── kiran-prompt.txt           ← Backend Engineer / FastAPI
    ├── rohan-prompt.txt           ← Frontend Engineer / React
    └── keerthi-prompt.txt         ← QA Agent (activates LAST)
```

---

## Agents — Team Panchayat

| Agent | Model | Role | Owns |
|---|---|---|---|
| **Arjun** | Claude Opus | PM / Orchestrator | Everything — monitoring & coordination |
| **Vikram** | Claude Sonnet | Cloud Architect | `/infra/modules/` — Terraform, AWS |
| **Rasool** | Claude Sonnet | Database Agent | `/backend/migrations/`, DB schema |
| **Kavya** | Claude Sonnet | UX Designer | `/frontend/src/tokens/`, component specs |
| **Kiran** | Claude Sonnet | Backend Engineer | `/backend/app/` — FastAPI, Pydantic |
| **Rohan** | Claude Sonnet | Frontend Engineer | `/frontend/src/components/` — React |
| **Keerthi** | Claude Sonnet | QA Agent | Read-only + `/docs/qa-report.md` |

---

## Quick Start (Windows PowerShell)

```powershell
# ── First time only ──────────────────────────────────────────
# Allow PowerShell scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Create project folder structure
cd $env:USERPROFILE\Downloads
.\setup-workspace.bat

# Set up tool connections (GitHub, DB, Docker, AWS)
cd $env:USERPROFILE\TeamPanchayat
node connect-tools.js

# ── Every sprint ─────────────────────────────────────────────
# Launch all agent windows + live dashboard
.\start-agents.ps1

# Open live dashboard in browser
# → http://localhost:3000
```

---

## Live Dashboard

The dashboard runs at **`http://localhost:3000`** and updates in real-time via Server-Sent Events (SSE). No manual browser refresh needed — as soon as any agent writes progress, the dashboard updates automatically.

```
dashboard-server.js watches:
  ├── agent-status.json     → progress bars update live
  ├── group-chat.json       → chat message count updates
  ├── requirement.json      → requirement status badge
  └── agent-memory/*.json   → per-agent memory state
```

---

## New Project / Feature Workflow

When you have a new requirement, use the wizard instead of directly assigning tasks:

```powershell
# 1. Post your requirement (interactive wizard)
node new-project.js

# 2. Each agent reads requirement.json and posts analysis to group-chat
#    Watch all agents respond live:
node group-chat-viewer.js --watch

# 3. Check all agent inputs
node new-project.js --inputs

# 4. Arjun generates sprint plan → you approve
node new-project.js --approve

# 5. Sprint starts — all agents begin building
```

This ensures every agent (Vikram, Rasool, Kavya, Kiran, Rohan, Keerthi) gives their input — effort estimate, approach, questions — **before any code is written**.

---

## Agent Memory

Every agent saves its state between sessions. When restarted, each agent:
- Reads its own `agent-memory/<name>-memory.json`
- Resumes from `pendingNextSteps` — skips already-completed work
- Knows which files it already created
- Knows which agents it is waiting for / can unblock

```powershell
node memory-manager.js              # Summary of all agents
node memory-manager.js vikram       # Detailed view of one agent
node memory-manager.js --watch      # Live watch mode
node memory-manager.js --reset all  # Reset for new sprint
node memory-manager.js --reset kiran
```

---

## Group Chat

All agents communicate via `group-chat.json`. Every status update, handoff, blocker, and question is posted here.

```powershell
node group-chat-viewer.js           # Full chat history
node group-chat-viewer.js --watch   # Live feed
node group-chat-viewer.js --last 20 # Last 20 messages
```

Message types: `message` · `status_update` · `handoff` · `blocker` · `done` · `question` · `requirement` · `analysis` · `plan` · `broadcast`

---

## Tool Connections

```powershell
node connect-tools.js                    # Interactive setup wizard
node connect-tools.js --status          # View connection status
node connect-tools.js --test github     # Test GitHub connection
node connect-tools.js --test db         # Test PostgreSQL connection
node connect-tools.js --test docker     # Test Docker daemon
```

| Tool | Connect Method | Used By |
|---|---|---|
| **GitHub** | Token / `gh` CLI / MCP | Vikram, Kiran, Rohan, Rasool, Kavya, Keerthi |
| **PostgreSQL** | Direct / MCP | Rasool (write), Kiran (read), Keerthi (read) |
| **Docker** | Local socket | Vikram (build), Keerthi (smoke test) |
| **AWS** | Profile / Keys | Vikram (Terraform) |

> `connections.json` is in `.gitignore` — credentials are never pushed to GitHub.

### Per-Agent Permissions

```powershell
node connect-tools.js --permissions                  # View all
node connect-tools.js --grant  vikram github push    # Grant access
node connect-tools.js --revoke keerthi aws           # Revoke access
```

---

## Agent Prompt Order

```
Phase 1 — Start all in parallel:
  Arjun + Vikram + Rasool + Kavya

Phase 2 — After Phase 1 ready:
  Kiran  (waits for Rasool DB schema)
  Rohan  (waits for Kavya design tokens)

Phase 3 — After ALL are DONE:
  Keerthi (QA sign-off)
```

---

## All Commands Reference

```powershell
# ── Dashboard ─────────────────────────────────────────────────
node dashboard-server.js            # Start live server on :3000
node dashboard-server.js --port 8080
node sync-dashboard.js              # Manual one-time sync
node sync-dashboard.js --watch      # Watch mode fallback

# ── Group Chat ────────────────────────────────────────────────
node group-chat-viewer.js --watch
node group-chat-viewer.js --last 30

# ── Memory ───────────────────────────────────────────────────
node memory-manager.js
node memory-manager.js vikram
node memory-manager.js --watch
node memory-manager.js --reset all

# ── New Project ───────────────────────────────────────────────
node new-project.js
node new-project.js --status
node new-project.js --inputs
node new-project.js --approve

# ── Tool Connections ──────────────────────────────────────────
node connect-tools.js
node connect-tools.js --status
node connect-tools.js --test github
node connect-tools.js --test db
node connect-tools.js --test docker
node connect-tools.js --grant  <agent> <tool> <permission>
node connect-tools.js --revoke <agent> <tool>
node connect-tools.js --permissions
```

---

## Reusing for a New Sprint

```powershell
# 1. Reset agent memories
node memory-manager.js --reset all

# 2. Post new requirement
node new-project.js

# 3. Launch agents
.\start-agents.ps1
```

---

## Pushing to GitHub

```powershell
cd $env:USERPROFILE\Downloads\ADLC-Agent-Kit
git add .
git commit -m "feat: sprint-02 updates"
git push origin main
```

Full guide: see `PUSH-TO-GITHUB.md`

---

*Created by Tarun Vangari — tarun.vangari@gmail.com | DevOps & Cloud Architect*
*ADLC-Agent-Kit v2.0 | Team Panchayat | 2026-03-14*
