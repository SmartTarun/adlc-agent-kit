# ADLC-Agent-Kit -- Team Panchayat
**AI-Driven Development Lifecycle | Sprint Automation Kit**

| | |
|---|---|
| **Author** | Tarun Vangari |
| **Email** | tarun.vangari@gmail.com |
| **Role** | DevOps & Cloud Architect |
| **Version** | 3.1 |
| **Sprint** | 01 |
| **Date** | 2026-03-16 |

---

## Overview

ADLC-Agent-Kit orchestrates **7 named Claude AI agents** as Docker containers -- just like a Kubernetes or Docker Swarm cluster, but for AI. Each agent runs in its own container, shares a workspace volume, and is visualised on a **Kanban sprint board at `http://localhost:3000`** that updates in real-time via SSE.

v3.1 adds a one-click **authorization script** that pre-approves all agent tool permissions so you never get prompted mid-session. Arjun (PM) now runs a **structured PM Discovery Interview** (3 rounds, 14 questions) before any code is written -- ensuring the full product picture is captured before Vikram, Kiran, Rohan, Rasool, Kavya, and Keerthi begin work.

Agents have persistent memory, a shared group chat, real-time tool connections (GitHub, PostgreSQL, Docker, AWS), and a new-project wizard so every agent analyses requirements before any code is written.

---

## What's in this Kit

```
ADLC-Agent-Kit\
|
+-- README.md                      <- You are here
+-- CLAUDE.md                      <- Project standards (auto-read by all agents)
+-- HOW-TO-START-AGENTS.md         <- Step-by-step startup guide
+-- team-structure-and-gemini-flow.html  <- Visual team map + Gemini image pipeline
|
+-- == FIRST-TIME SETUP ==============================================
+-- setup-workspace.bat            <- STEP 1: Create folder structure
+-- authorize-agents.bat           <- STEP 2: Set API key + pre-approve permissions
+-- authorize-agents.ps1           <- STEP 2 (PowerShell version -- run by the .bat)
|
+-- == STARTUP =======================================================
+-- start-agents.bat               <- STEP 3: Launcher (opens all windows via PS)
+-- start-agents.ps1               <- STEP 3 alt: Run directly from PowerShell
|
+-- == LIVE DASHBOARD ================================================
+-- dashboard-server.js            <- HTTP server -> http://localhost:3000
+-- sprint-board.html              <- Kanban UI (auto-pushed via SSE)
+-- sync-dashboard.js              <- Manual sync fallback
|
+-- == AGENT STATE ===================================================
+-- agent-status.json              <- Shared progress tracker (all 7 agents write here)
+-- requirement.json               <- Active requirement + discovery answers + product brief
+-- agent-memory\                  <- Per-agent persistent memory
|   +-- arjun-memory.json
|   +-- vikram-memory.json
|   +-- rasool-memory.json
|   +-- kavya-memory.json
|   +-- kiran-memory.json
|   +-- rohan-memory.json
|   +-- keerthi-memory.json
+-- memory-manager.js              <- View, watch, reset agent memory
|
+-- == GROUP CHAT ====================================================
+-- group-chat.json                <- Shared team channel (all agents post here)
+-- group-chat-viewer.js           <- Live terminal chat viewer
|
+-- == NEW PROJECT WORKFLOW ==========================================
+-- new-project.js                 <- Interactive wizard + broadcasts to all agents
|
+-- == TOOL CONNECTIONS ==============================================
+-- connections.json               <- GitHub / PostgreSQL / Docker / AWS creds (gitignored)
+-- connect-tools.js               <- Interactive connection setup wizard
+-- tool-permissions.json          <- Per-agent tool access control
|
+-- == CLAUDE AUTH ===================================================
+-- .claude\settings.json          <- Pre-approved tool permissions (no prompts)
+-- .env                           <- API key (gitignored, written by authorize-agents.ps1)
+-- .env.template                  <- Template -- copy to .env and fill in your key
|
+-- == GITHUB ========================================================
+-- .gitignore
+-- .github\
|   +-- pull_request_template.md
|   +-- repo-meta.md
|
+-- == DOCKER MODE ===================================================
+-- Dockerfile.base                <- Agent base image (Node 20 + Claude Code CLI)
+-- Dockerfile.dashboard           <- Dashboard server image
+-- docker-compose.yml             <- All 8 services + shared workspace volume
+-- docker-entrypoint.sh           <- Agent startup (loads memory, runs claude CLI)
+-- docker-dashboard-server.js     <- Dashboard server with Docker API integration
+-- docker-start.ps1               <- Cluster launcher with pre-flight checks
+-- docker-stop.ps1                <- Graceful cluster shutdown
|
+-- == AGENT PROMPTS =================================================
    prompts\
    +-- arjun-prompt.txt           <- Orchestrator / PM (PM Discovery Interview)
    +-- vikram-prompt.txt          <- Cloud Architect / Terraform / AWS
    +-- rasool-prompt.txt          <- Database Agent / PostgreSQL
    +-- kavya-prompt.txt           <- UX Designer / Design Tokens + Gemini images
    +-- kiran-prompt.txt           <- Backend Engineer / FastAPI
    +-- rohan-prompt.txt           <- Frontend Engineer / React
    +-- keerthi-prompt.txt         <- QA Agent (activates LAST)
```

---

## Agents -- Team Panchayat

| Agent | Model | Role | Owns |
|---|---|---|---|
| **Arjun** | Claude Opus | PM / Orchestrator | Discovery interview, sprint planning, coordination |
| **Vikram** | Claude Sonnet | Cloud Architect | `/infra/modules/` -- Terraform, AWS, ECS |
| **Rasool** | Claude Sonnet | Database Agent | `/backend/migrations/`, DB schema, PostgreSQL |
| **Kavya** | Claude Sonnet | UX Designer | `/frontend/src/tokens/`, component specs, Gemini images |
| **Kiran** | Claude Sonnet | Backend Engineer | `/backend/app/` -- FastAPI, Pydantic, OpenAPI |
| **Rohan** | Claude Sonnet | Frontend Engineer | `/frontend/src/components/` -- React, Recharts |
| **Keerthi** | Claude Sonnet | QA Agent | Read-only everywhere + `/docs/qa-report.md` |

---

## Quick Start (Windows -- First Time)

```powershell
# ---- First time only ------------------------------------------------

# 1. Allow PowerShell scripts (run once, as yourself not admin)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 2. Create project folder structure (double-click or run from CMD)
setup-workspace.bat

# 3. Authorize all agents (sets API key + pre-approves all tool permissions)
#    Double-click authorize-agents.bat  OR run in PowerShell:
.\authorize-agents.ps1
#    You will be prompted for your ANTHROPIC_API_KEY (sk-ant-...)
#    The key is saved to User environment variables (persists across reboots)
#    .claude\settings.json is written with all permissions pre-approved

# 4. (Optional) Set up tool connections (GitHub, DB, Docker, AWS)
node connect-tools.js

# ---- Every sprint ---------------------------------------------------

# 5. Launch all agent windows + live dashboard
.\start-agents.ps1

# 6. Open the live dashboard
# -> http://localhost:3000   (opens automatically after agents start)

# 7. Post a new requirement via the dashboard wizard
#    Click "+ New Requirement" in the top bar
#    Fill in the 8-field form and click "Post to Team"

# 8. Arjun runs the PM Discovery Interview (see below)
#    Answer Arjun's questions in the discovery panel in the dashboard

# 9. Once discovery is complete, click "Approve Sprint Plan"
#    All 5 build agents begin execution
```

---

## PM Discovery Interview

Before any code is written, Arjun runs a **structured 3-round interview** to capture the full product picture:

```
Round 1 -- Vision (5 questions)
  What problem does this solve?
  Who are the user personas?
  What are the success KPIs?
  What is in MVP scope vs out of scope?

Round 2 -- Technical (5 questions)
  What infrastructure / cloud constraints exist?
  What are the performance requirements?
  What external integrations are needed?
  What are the security / compliance requirements?
  What is the data model at a high level?

Round 3 -- Delivery & Risk (4 questions)
  What is the hard deadline?
  What are the top 3 risks?
  What are the acceptance criteria?
  Are there any non-negotiable constraints?
```

Arjun saves all answers to `requirement.json` under `discoveryAnswers.round1/2/3` and compiles a `productBrief` before briefing each agent with role-specific context.

**Fast-track mode**: Tell Arjun "skip questions -- here is the full context: ..." and he will accept a dump of answers all at once.

**RULE: No agent receives task assignments until `discoveryComplete = true`.**

---

## New Project / Feature Workflow

```
1. Click "+ New Requirement" in the dashboard   (or: node new-project.js)
2. Fill in the 8-field form and click "Post to Team"
3. Arjun announces in group chat and begins Round 1 discovery questions
4. Answer each round in the dashboard discovery panel
5. Arjun compiles product brief and briefs all 5 build agents
6. Each agent posts their input (effort estimate, approach, questions)
7. Arjun generates sprint plan
8. Click "Approve Sprint Plan" in the dashboard   (or: node new-project.js --approve)
9. Sprint starts -- all 5 build agents begin execution in parallel
10. Keerthi activates only after all 5 are DONE
```

```powershell
# CLI alternative to the dashboard wizard:
node new-project.js              # interactive wizard
node new-project.js --status     # current requirement status
node new-project.js --inputs     # all agent inputs received so far
node new-project.js --approve    # approve the sprint plan
```

---

## Live Dashboard

The dashboard runs at **`http://localhost:3000`** and updates in real-time via Server-Sent Events (SSE). No manual browser refresh needed.

```
dashboard-server.js watches:
  +-- agent-status.json     -> Kanban cards update live (Queue / WIP / Done)
  +-- group-chat.json       -> Group chat panel updates live
  +-- requirement.json      -> Requirement banner + discovery panel
  +-- agent-memory/*.json   -> Per-agent memory state
```

### Sprint Board Features

| Feature | How to Use |
|---|---|
| **Kanban columns** | Agents auto-sort into Queue / In Progress / Done |
| **New Requirement** | Click "+ New Requirement" in top bar -- opens 8-field wizard |
| **Discovery panel** | Arjun's active interview question + your answer textarea |
| **Requirement banner** | Shows REQ ID, priority, status, agent input count |
| **Approve Sprint** | "Approve Sprint Plan" button appears when all inputs received |
| **Group chat** | Type in the bottom bar and press Enter |
| **Container health** | Green/yellow/red health badge on each card (Docker mode) |
| **Live logs** | Click Logs on any card -- right panel streams stdout/stderr (Docker mode) |

---

## Agent Memory

Every agent saves its state between sessions. When restarted, each agent:
- Reads its own `agent-memory/<name>-memory.json`
- Resumes from `pendingNextSteps` -- skips already-completed work
- Knows which files it already created
- Knows which agents it is waiting for or can unblock

```powershell
node memory-manager.js              # Summary of all agents
node memory-manager.js vikram       # Detailed view of one agent
node memory-manager.js --watch      # Live watch mode
node memory-manager.js --reset all  # Reset for new sprint
node memory-manager.js --reset kiran
```

---

## Group Chat

All agents communicate via `group-chat.json`. Every status update, handoff, blocker, question, and discovery answer is posted here.

```powershell
node group-chat-viewer.js           # Full chat history
node group-chat-viewer.js --watch   # Live feed
node group-chat-viewer.js --last 20 # Last 20 messages
```

Message types: `message` | `status_update` | `handoff` | `blocker` | `done` | `question` | `requirement` | `analysis` | `plan` | `broadcast` | `discovery`

---

## Tool Connections

```powershell
node connect-tools.js                   # Interactive setup wizard
node connect-tools.js --status         # View connection status
node connect-tools.js --test github    # Test GitHub connection
node connect-tools.js --test db        # Test PostgreSQL connection
node connect-tools.js --test docker    # Test Docker daemon
```

| Tool | Connect Method | Used By |
|---|---|---|
| **GitHub** | Token / `gh` CLI / MCP | Vikram, Kiran, Rohan, Rasool, Kavya, Keerthi |
| **PostgreSQL** | Direct / MCP | Rasool (write), Kiran (read), Keerthi (read) |
| **Docker** | Local socket | Vikram (build), Keerthi (smoke test) |
| **AWS** | Profile / Keys | Vikram (Terraform) |
| **Gemini** | API Key (GEMINI_API_KEY) | Kavya (AI image generation) |

> `connections.json` and `.env` are in `.gitignore` -- credentials are never pushed to GitHub.

---

## Agent Prompt Order

```
Phase 1 -- Start all in parallel:
  Arjun + Vikram + Rasool + Kavya

  NOTE: Arjun runs PM Discovery Interview first.
        Vikram/Rasool/Kavya wait for product brief before building.

Phase 2 -- After Phase 1 ready:
  Kiran  (waits for Rasool DB schema)
  Rohan  (waits for Kavya design tokens)

Phase 3 -- After ALL are DONE:
  Keerthi (QA sign-off)
```

---

## All Commands Reference

```powershell
# -- First-Time Setup --------------------------------------------------
setup-workspace.bat                      # Create folder structure
.\authorize-agents.ps1                   # Set API key + pre-approve permissions

# -- Dashboard ---------------------------------------------------------
node dashboard-server.js                 # Start live server on :3000
node dashboard-server.js --port 8080
node sync-dashboard.js                   # Manual one-time sync
node sync-dashboard.js --watch           # Watch mode fallback

# -- Group Chat --------------------------------------------------------
node group-chat-viewer.js --watch
node group-chat-viewer.js --last 30

# -- Memory -----------------------------------------------------------
node memory-manager.js
node memory-manager.js vikram
node memory-manager.js --watch
node memory-manager.js --reset all

# -- New Project -------------------------------------------------------
node new-project.js
node new-project.js --status
node new-project.js --inputs
node new-project.js --approve

# -- Tool Connections --------------------------------------------------
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

## v3 -- Docker Cluster Mode

In v3, every agent runs as a **Docker container** orchestrated by Docker Compose. The sprint board UI mirrors a Kubernetes/Swarm dashboard -- showing container health, CPU%, memory, uptime, live log streaming, and one-click scaling.

### Prerequisites

- Docker Desktop for Windows (latest)
- `.env` file with `ANTHROPIC_API_KEY=sk-ant-...` (created automatically by `authorize-agents.ps1`)

### Start the Cluster

```powershell
# First time -- build images and start
.\docker-start.ps1 -Build

# Subsequent starts
.\docker-start.ps1

# Start with Keerthi QA active
.\docker-start.ps1 -qa

# Start single agent only
.\docker-start.ps1 -Agent vikram
```

Open **http://localhost:3000** -- the sprint board loads automatically.

### Docker Commands

```powershell
.\docker-start.ps1                         # Start cluster
.\docker-stop.ps1                          # Stop cluster
.\docker-stop.ps1 -Restart                 # Restart all containers
.\docker-stop.ps1 -Agent kiran             # Stop single agent
docker compose logs -f arjun               # Follow agent logs
docker compose ps                          # Show all container statuses
docker compose up --scale kiran=2 -d       # Scale Kiran to 2 replicas
docker compose --profile qa up keerthi -d  # Activate Keerthi QA
```

### Deploy to AWS ECS Fargate (Production)

Vikram's Terraform module deploys the entire cluster to AWS:

```powershell
cd infra/modules/ecs

# Store API key in SSM (never in Terraform state)
aws ssm put-parameter --name /panchayat/anthropic_api_key `
  --value "sk-ant-..." --type SecureString

# Push Docker images to ECR
docker build -t panchayat-agent -f Dockerfile.base .
docker tag panchayat-agent:latest <account>.dkr.ecr.us-east-1.amazonaws.com/panchayat:agent-latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/panchayat:agent-latest

# Deploy with Terraform
terraform init
terraform plan -var="environment=prod" -var="ecr_repository_url=<ecr-url>" -var="vpc_id=vpc-xxx"
terraform apply
```

After apply, Terraform outputs the ALB URL for the sprint board:
```
dashboard_url = "http://panchayat-prod-alb-xxxxxxxx.us-east-1.elb.amazonaws.com"
```

---

## Reusing for a New Sprint

```powershell
# 1. Reset agent memories
node memory-manager.js --reset all

# 2. Post new requirement via dashboard or CLI
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

> `.env` and `connections.json` are in `.gitignore` -- your API keys are never committed.

---

*Created by Tarun Vangari -- tarun.vangari@gmail.com | DevOps & Cloud Architect*
*ADLC-Agent-Kit v3.1 | Team Panchayat | 2026-03-16*
