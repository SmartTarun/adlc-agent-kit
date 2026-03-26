# ADLC-Agent-Kit — Team Panchayat
**AI-Driven Development Lifecycle | Multi-Project Sprint Automation**

| | |
|---|---|
| **Author** | Tarun Vangari (tarun.vangari@gmail.com) |
| **Role** | DevOps & Cloud Architect |
| **Version** | 4.0 |
| **Models** | Arjun: Claude Opus 4.6 · All others: Claude Sonnet 4.6 |

---

## Overview

ADLC-Agent-Kit runs **7 named Claude AI agents** as Docker containers — each with a distinct role, folder boundary, and activation gate. A **live Kanban dashboard** at `http://localhost:3000` shows real-time progress via SSE. Every project is isolated in its own folder under `projects/` and never committed to GitHub — your codebase stays clean.

**v4.0 highlights:**
- **Project Hub** — select an existing project or start a new one on dashboard load
- **Fast PM Discovery** — Arjun asks 5 questions max (1 round), domain-aware
- **Domain detection** — CRE, Investment/Financial, Data Analytics, General
- **Global CRE knowledge** — regional conventions for US, UK, AU, UAE, India, SEA
- **Dynamic Team Discovery** — only agents needed for your project type get activated
- **UX Design Review screen** — Kavya's design canvas with live feedback chat
- **Local-only project state** — `active-project.json`, `requirement.json`, `agent-status.json` are gitignored

---

## Agents — Team Panchayat

| Agent | Model | Role | Activates When |
|---|---|---|---|
| **Arjun** | Opus 4.6 | PM / Orchestrator | Always first |
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
#    -> Select an existing project OR fill in the New Project form
#    -> Start Arjun in a second terminal:
claude --model claude-opus-4-6 < prompts/arjun-prompt.txt
```

---

## The Flow

```
1. Dashboard loads  →  Project Hub appears
   - Existing projects listed on the left (click to continue + load group chat)
   - New Project form on the right

2. Create a new project  →  fill in title + description
   - Be specific — Arjun detects the domain from your description
   - Domains: CRE | Investment | Data Analytics | General

3. Arjun starts  →  posts ONE message with 5 targeted questions
   - CRE projects: property types, financial metrics, data sources, reports, roles
   - Investment: asset classes, calculation models, time horizons, risk metrics
   - Data: sources, KPIs, update frequency, visualisations, alerting
   - General: infra, integrations, data model, constraints

4. Answer Arjun's questions in group chat  →  discoveryComplete = true
   - Team Discovery panel appears on dashboard
   - Only required agents get tabs (e.g. CRE always needs all 5; frontend-only needs kavya + rohan)

5. Fill each agent's domain questions  →  agents post proposals

6. Arjun compiles sprint plan  →  click "Approve Sprint Plan"
   - Builders activate: Kiran, Rohan (and others per requiredAgents)
   - Keerthi activates only after all builders reach DONE

7. (Optional) Click 🎨 Design on Kavya's card  →  UX Design Review screen
   - Left 1/4: live design feedback chat
   - Right 3/4: design canvas with flow steps, tokens, components, approval
```

---

## Project State — Local Only

These files **never go to GitHub** (gitignored). Each machine keeps its own state:

| File | Purpose |
|---|---|
| `active-project.json` | Which project is currently active |
| `requirement.json` | Discovery answers, product brief, approval state |
| `agent-status.json` | Live progress of all 7 agents |
| `group-chat.json` | All agent + Tarun conversation history |
| `projects/` | Generated code for each project |
| `agent-memory/` | Per-agent persistent memory across sessions |

The repo only contains the **kit** — prompts, dashboard, Docker config, templates.

---

## Domain-Aware Discovery

Arjun detects project type from your description and applies the right lens:

### Commercial Real Estate (CRE)
Arjun knows regional conventions for:
- 🇺🇸 **USA/Canada** — Cap Rate, NOI, DSCR, CoStar, 1031 exchange, CMBS
- 🇬🇧 **UK/Europe** — NIY, ERV, WAULT, EGi, SDLT, FRI leases
- 🇦🇺 **Australia/NZ** — WALE, NLA, CoreLogic, LVR, IO loans
- 🇦🇪 **Middle East** — Ijara/Murabaha, freehold zones, DIFC/ADGM
- 🇮🇳 **India** — RERA, carpet vs super built-up, Embassy/Mindspace REITs
- 🇸🇬 **SEA** — URA, TDSR, 99yr leasehold, NAPIC

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
| **Project Hub** | Select existing project or create new — auto-loads on startup when no project active |
| **Group Chat** | Live conversation between Tarun and all agents, per-project |
| **Kanban Board** | Agent cards in Queue / WIP / Done columns, live via SSE |
| **Discovery Panel** | Arjun's active questions + your answer box |
| **Team Discovery Panel** | Domain-specific questions from required agents before sprint starts |
| **🎨 UX Design Review** | Kavya's full design canvas — flow, tokens, components, approval |
| **Approve Sprint** | Button appears after all required agents post proposals |
| **+ New Project** | Opens Project Hub at any time |

---

## Docker Cluster Mode

```powershell
# First time — build images
.\docker-start.ps1 -Build

# Subsequent starts
.\docker-start.ps1

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
git add .
git commit -m "feat: description of changes"
git push origin main
```

> Project state files are gitignored — only kit files (prompts, dashboard, Docker config) are committed.

---

*Tarun Vangari — tarun.vangari@gmail.com | DevOps & Cloud Architect*
*ADLC-Agent-Kit v4.0 | Team Panchayat | 2026*
