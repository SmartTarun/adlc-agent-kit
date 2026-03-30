# ADLC-Agent-Kit — Team Panchayat
**AI-Driven Development Lifecycle | Multi-Project Sprint Automation**

| | |
|---|---|
| **Author** | Tarun Vangari (tarun.vangari@gmail.com) |
| **Role** | DevOps & Cloud Architect |
| **Version** | 5.0 |
| **Models** | Arjun: Claude Opus 4.6 · All others: Claude Sonnet 4.6 |

---

## Overview

ADLC-Agent-Kit runs **7 named AI agents** — each with a distinct role, folder boundary, and activation gate. A **live Kanban dashboard** at `http://localhost:3000` shows real-time progress via SSE. Every project is isolated in its own folder under `projects/` and never committed to GitHub — your codebase stays clean.

**v5.0 highlights:**
- **Multi-LLM support** — Claude CLI (default), Ollama (local), Hybrid (Ollama draft → Claude upgrade), OpenAI-compatible (Azure OpenAI, OpenAI, custom endpoints)
- **Ollama feedback loop** — configurable max iterations + quality threshold for iterative local LLM improvement
- **Auto-launch Arjun** — creating a new project immediately starts the PM discovery agent
- **Architecture & DB Schema Canvas** — visual canvas views for Vikram and Rasool
- **Enriched agent context** — all LLM modes inject KEY FILES paths + REQUIREMENT SNAPSHOT so agents always know exactly where to read/write
- **Project Hub** — select an existing project or start a new one on dashboard load
- **Topbar overflow menu** — secondary actions collapsed into `⋯ More` so `+ New Project` and `🚀 Launch Agents` are always visible
- **Domain-aware discovery** — CRE, Investment/Financial, Data Analytics, General

---

## Agents — Team Panchayat

| Agent | Model | Role | Activates When |
|---|---|---|---|
| **Arjun** | Opus 4.6 | PM / Orchestrator | Always first — auto-launched on new project |
| **Vikram** | Sonnet 4.6 | Cloud Architect | After discovery, if infra needed |
| **Rasool** | Sonnet 4.6 | Database Agent | After discovery, if DB needed |
| **Kavya** | Sonnet 4.6 | UX Designer | After discovery (always) |
| **Kiran** | Sonnet 4.6 | Backend Engineer | After sprint approval, if API needed |
| **Rohan** | Sonnet 4.6 | Frontend Engineer | After sprint approval, if frontend needed |
| **Keerthi** | Sonnet 4.6 | QA Agent | After all builders are DONE |

---

## Quick Start

```powershell
# 1. Set your API key (first time only)
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# 2. Start the dashboard
cd C:\Users\<you>\Downloads\ADLC-Agent-Kit
node dashboard-server.js

# 3. Open http://localhost:3000
#    -> Project Hub loads automatically
#    -> Fill in the New Project form — Arjun auto-launches on creation
#    -> Or select an existing project to resume
```

---

## LLM Modes

Configure the active LLM mode via the **LLM Settings** panel in the dashboard (`⚙ LLM` button).

### Claude CLI (Default)
Uses your local `claude` CLI with `ANTHROPIC_API_KEY`. No extra config needed.

### Ollama — Local LLM
Runs agents entirely on your local machine with any Ollama model.

| Setting | Description |
|---|---|
| Ollama Endpoint | Default: `http://localhost:11434` |
| Model | e.g. `qwen2.5-coder:7b`, `llama3.1:8b`, `mistral` |
| Enable Feedback Loop | Re-runs the agent if output quality is below threshold |
| Max Iterations | How many re-try rounds (1–5) |
| Re-try Threshold | Quality score (0–100) below which Claude re-prompts the model |

```powershell
# Install Ollama (Windows)
winget install Ollama.Ollama

# Pull a model
ollama pull qwen2.5-coder:7b

# Start Ollama server (runs on :11434 by default)
ollama serve
```

### Hybrid — Ollama Draft + Claude Upgrade
Ollama generates a first draft; if its quality score is below the configured threshold, Claude Sonnet/Opus automatically rewrites and improves it. Combines local speed with cloud quality.

| Setting | Description |
|---|---|
| Ollama Model | Draft model (local) |
| Claude Model | Upgrade model — default `claude-sonnet-4-6` |
| Quality Threshold | Score 0–100; drafts below this are upgraded by Claude |

### OpenAI-Compatible (Azure OpenAI / OpenAI / Custom)
Any endpoint that speaks the OpenAI Chat Completions API.

| Setting | Description |
|---|---|
| Endpoint URL | e.g. `https://<resource>.openai.azure.com/openai/deployments/<deploy>/chat/completions?api-version=2024-02-01` |
| API Key | Your Azure / OpenAI / custom key |
| Model | Deployment name or model ID |
| Enable Feedback Loop | Same iterative quality loop as Ollama mode |

---

## The Flow

```
1. Dashboard loads  →  Project Hub appears
   - Existing projects listed (click to continue + load group chat)
   - New Project form: fill title + description → submit

2. Create a new project  →  Arjun auto-launches in 500ms
   - Arjun reads the project requirement from PROJECT_ROOT (not /workspace/)
   - Posts discovery questions to group chat

3. Arjun asks 5 targeted questions (domain-aware)
   - CRE: property types, financial metrics, data sources, reports, roles
   - Investment: asset classes, DCF/IRR models, risk metrics
   - Data: sources, KPIs, update frequency, visualisations, alerting
   - General: infra, integrations, data model, constraints

4. Answer Arjun's questions in group chat  →  discoveryComplete = true
   - Team Discovery panel appears
   - Only required agents get activated (e.g. CRE: all 5; frontend-only: Kavya + Rohan)

5. Fill each agent's domain questions  →  agents post proposals

6. Arjun compiles sprint plan  →  click "Approve Sprint Plan"
   - Builders activate: Kiran, Rohan (and others per requiredAgents)
   - Keerthi activates only after all builders reach DONE

7. (Optional) Click 🎨 Design on Kavya's card  →  UX Design Review screen
   - Left: live design feedback chat
   - Right: design canvas with flow steps, tokens, components, approval

8. (Optional) Click 🏗 Canvas on Vikram's card  →  Architecture Canvas
   - Visual AWS/infra topology generated from Vikram's output

9. (Optional) Click 🗄 Schema on Rasool's card  →  DB Schema Canvas
   - Visual entity-relationship diagram from Rasool's schema
```

---

## Project State — Local Only

These files **never go to GitHub** (gitignored). Each machine keeps its own state:

| File | Purpose |
|---|---|
| `active-project.json` | Which project is currently active |
| `projects/<id>/requirement.json` | Discovery answers, product brief, approval state |
| `projects/<id>/agent-status.json` | Live progress of all 7 agents |
| `projects/<id>/group-chat.json` | All agent + Tarun conversation history |
| `projects/` | Generated code for each project |
| `agent-memory/` | Per-agent persistent memory across sessions |

The repo only contains the **kit** — prompts, dashboard, Docker config, templates.

---

## Agent Context Injection

Every agent launch (regardless of LLM mode) receives a **RUNTIME CONTEXT** block prepended to its prompt:

```
=== RUNTIME CONTEXT (injected by dashboard-server) ===
WORKSPACE_ROOT    : /path/to/ADLC-Agent-Kit
PROJECT_ROOT      : /path/to/ADLC-Agent-Kit/projects/<id>
PROJECT_ID        : proj-<timestamp>
PROJECT_NAME      : My Project Name
SPRINT            : 01
TODAY             : 2026-03-30

── KEY FILES (use these exact paths) ──
  requirement.json  : /projects/<id>/requirement.json
  agent-status.json : /projects/<id>/agent-status.json
  group-chat.json   : /projects/<id>/group-chat.json
  active-project    : /ADLC-Agent-Kit/active-project.json

── CURRENT REQUIREMENT SNAPSHOT ──
  title            : My Project Name
  type             : new_project
  status           : pending_analysis
  discoveryComplete: false
  approvedByTarun  : false
=== END RUNTIME CONTEXT ===
```

This ensures agents always read/write from the correct project folder — not stale root-level files.

---

## Domain-Aware Discovery

Arjun detects project type from your description and applies the right lens:

### Commercial Real Estate (CRE)
Arjun knows regional conventions for:
- **USA/Canada** — Cap Rate, NOI, DSCR, CoStar, 1031 exchange, CMBS
- **UK/Europe** — NIY, ERV, WAULT, EGi, SDLT, FRI leases
- **Australia/NZ** — WALE, NLA, CoreLogic, LVR, IO loans
- **Middle East** — Ijara/Murabaha, freehold zones, DIFC/ADGM
- **India** — RERA, carpet vs super built-up, Embassy/Mindspace REITs
- **SEA** — URA, TDSR, 99yr leasehold, NAPIC

### Investment / Financial
DCF, Monte Carlo, IRR/NPV, sensitivity analysis, scenario modelling, Sharpe/VaR/Sortino, Excel/PDF pro-forma output

### Data Analytics
KPI dashboards, data pipelines, real-time/batch ingestion, anomaly detection, alerting

---

## Folder Boundaries

| Agent | Owns | Must NOT touch |
|---|---|---|
| Vikram | `/infra/modules/` | /backend, /frontend, /docs |
| Rasool | `/backend/migrations/`, `/docs/db-schema.md` | /infra, /frontend |
| Kiran | `/backend/app/routers/`, `/backend/app/schemas/`, `/backend/tests/` | /infra, /frontend |
| Kavya | `/frontend/src/tokens/`, `/docs/component-spec.md` | /infra, /backend |
| Rohan | `/frontend/src/components/` | /infra, /backend |
| Keerthi | Read-only + `/docs/qa-report.md` | No code changes |

---

## Dashboard Features

| Feature | Description |
|---|---|
| **Project Hub** | Select existing project or create new — Arjun auto-launches on creation |
| **Group Chat** | Live conversation between Tarun and all agents, per-project |
| **Kanban Board** | Agent cards in Queue / WIP / Done columns, live via SSE |
| **Discovery Panel** | Arjun's active questions + your answer box |
| **Team Discovery Panel** | Domain-specific questions from required agents |
| **⚙ LLM Settings** | Switch between Claude / Ollama / Hybrid / OpenAI-compat per session |
| **🎨 UX Design Review** | Kavya's full design canvas — flow, tokens, components, approval |
| **🏗 Architecture Canvas** | Visual infra topology from Vikram's output |
| **🗄 DB Schema Canvas** | Visual ER diagram from Rasool's schema |
| **Approve Sprint** | Button appears after all required agents post proposals |
| **⋯ More** | Overflow menu for secondary actions — topbar stays clean |

---

## Docker Cluster Mode

Two compose files are provided — choose based on your LLM preference:

```powershell
# Claude API mode (default)
.\docker-start.ps1 -Build
.\docker-start.ps1

# Ollama local LLM mode
docker compose -f docker-compose.yml -f docker-compose.hybrid.yml up --build

# Stop
.\docker-stop.ps1

# Logs
docker compose logs -f arjun
docker compose ps
```

**Prerequisites:** Docker Desktop for Windows + `.env` file with `ANTHROPIC_API_KEY=sk-ant-...`

---

## Tech Standards (enforced by CLAUDE.md)

| Area | Standard |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy, Alembic |
| Frontend | React 18 + TypeScript, CSS tokens, Recharts only, dark mode first |
| Infra | Terraform >= 1.7, AWS provider >= 5.0, S3+DynamoDB backend |
| Tests | pytest, minimum 80% coverage |
| LLM | Always `claude-sonnet-4-6` (never hardcode another model) |
| AWS Tags | Environment, Owner=TeamPanchayat, CostCenter=ADLC-{sprint}, Project={name} |

---

## Pushing to GitHub

```powershell
git add dashboard-server.js sprint-board.html prompts/ templates/
git commit -m "feat: description of changes"
git push origin main
```

> Project state files (`active-project.json`, `requirement.json`, `agent-status.json`, `group-chat.json`, `projects/`) are gitignored — only kit files are committed.

---

*Tarun Vangari — tarun.vangari@gmail.com | DevOps & Cloud Architect*
*ADLC-Agent-Kit v5.0 | Team Panchayat | 2026*
