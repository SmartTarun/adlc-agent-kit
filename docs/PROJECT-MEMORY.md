# PROJECT MEMORY — CBRE
> Auto-maintained by Arjun. Read this file to resume a session.
> Last updated: 2026-03-25T16:02:00.000Z

## Identity
| Field       | Value |
|-------------|-------|
| Project ID  | proj-cbre_platform-01 |
| Name        | CBRE |
| Sprint      | 01 |
| Status      | QA — Session 7 — Keerthi nudged, awaiting qa-plan.md + E2E tests |
| Directory   | /workspace |
| Started     | 2026-03-16T08:28:00.000Z |

## What We Are Building
CBRE Unified Asset Intelligence Platform is an AI-powered IaC generation platform for cloud architects. Users design infrastructure visually on a React Flow canvas or describe it in natural language, and Claude (claude-sonnet-4-6) generates production-ready Terraform code along with architecture documentation, cost estimates, compliance checklists, and deployment guides. Includes workspace management, Terraform validation, and a CLI terminal with streaming responses. Sprint-01 scope: AWS-only, generate+validate only, dummy auth, dark mode first.

## Key Decisions Made
- LLM: claude-sonnet-4-6 via Anthropic API direct (NOT Bedrock Sprint-01)
- Auth: Dummy username/password. JWT in localStorage. Demo: admin / cbre_platform2026
- Database: PostgreSQL via SQLAlchemy async + Alembic (8 tables)
- Frontend: React 18 + TypeScript + Vite + React Flow + CSS Variables (tokens.css). NO Tailwind.
- Backend: FastAPI + Python 3.11 + Anthropic SDK + SQLAlchemy async + Pydantic v2
- Infra: Terraform >= 1.7, AWS (us-east-1), S3+DynamoDB state backend
- State storage: S3 for Terraform state content, metadata-only in PostgreSQL
- Streaming: SSE ENABLED — TerminalView streams. Canvas/Dashboard use structured JSON.
- IaC scope: Generate + Validate only. No apply/destroy Sprint-01.
- AI pipeline: 7-step (Requirements → Architecture → Terraform → Diagram → Cost → Compliance → Deployment)

## Sprint Goal
Demo-ready CBRE Unified Asset Intelligence Platform: cloud architects can (1) drag AWS services onto canvas → generate Terraform via Claude, (2) type NL prompt → get Terraform + docs, (3) use Terminal CLI with streaming, (4) save/load workspaces, (5) validate Terraform. Deadline: 2026-04-01.

## Agent Progress
| Agent   | Status  | Last Task | Notes |
|---------|---------|-----------|-------|
| Arjun   | WIP     | Orchestrating QA phase | Session 7 active — Keerthi nudged with prioritised QA brief |
| Vikram  | DONE    | 11 Terraform modules delivered | backend_state, iam, rds_aurora, lambda, api_gateway, s3_frontend, cloudfront, secrets_manager, ecs, cloudwatch, s3 |
| Rasool  | DONE    | All 8 ORM models + Alembic migration | 8 tables, full SQLAlchemy graph, db-schema.md |
| Kavya   | DONE    | tokens.css + component-spec.md (19 components) | CBRE Unified Asset Intelligence Platform 4-view spec, IaC + node tokens |
| Kiran   | DONE    | FastAPI backend: 6 routers, 19 endpoints, Claude SSE, 30+ tests | claude-sonnet-4-6 wired |
| Rohan   | DONE    | AuthPage, CanvasView, DashboardView, TerminalView | React Flow + 9-tab panel, SSE streaming |
| Keerthi | WIP     | QA — Session 7 nudge sent | 10% progress. Awaiting qa-plan.md, e2e_integration.py, demo-script.md |

## Completed Tasks
- [x] Vikram: 11 Terraform modules in /workspace/infra/modules/
- [x] Kavya: tokens.css (dark-first, IaC/node tokens) + component-spec.md (19 components)
- [x] Rasool: Alembic env.py + migration 0001 (8 tables) + 8 ORM models + db-schema.md
- [x] Kiran: FastAPI main.py + 6 routers + 5 schemas + Claude 7-step + SSE + 30+ pytest tests
- [x] Rohan: AuthPage + CanvasView (React Flow 24 nodes, 9-tab panel) + DashboardView + TerminalView + App.tsx + api/client.ts + types/index.ts + AuthContext.tsx

## Pending / Next Steps
- [ ] Keerthi: Integration test plan + E2E tests + demo script + final sign-off
- [ ] E2E: POST /auth/login → canvas drag → POST /iac/generate → 9 tabs render
- [ ] SSE: TerminalView → POST /llm/stream → streaming verified
- [ ] DB: alembic upgrade head runs clean on all 8 tables
- [ ] Final demo walkthrough before 2026-04-01

## Files Created
### Backend (/workspace/backend/)
- app/main.py — FastAPI app factory, CORS, router mounts, demo user seed
- app/config.py — settings via env vars
- app/database.py — SQLAlchemy async engine + session
- app/models/ — 8 ORM models: user, project, iac_template, state_file, llm_conversation, infra_resource, deployment, drift_record
- app/schemas/ — 5 Pydantic v2 modules: auth, project, iac, state, llm
- app/routers/ — 6 routers: health, auth, projects, iac, state, llm (19 endpoints total)
- migrations/ — alembic.ini + env.py + versions/0001_initial_schema.py
- tests/ — 6 test modules, 30+ pytest tests
- requirements.txt

### Frontend (/workspace/frontend/)
- src/components/AuthPage/ — AuthPage.tsx + CSS
- src/components/CanvasView/ — CanvasView.tsx, ServiceNode.tsx, GroupNode.tsx + CSS
- src/components/DashboardView/ — DashboardView.tsx + CSS
- src/components/TerminalView/ — TerminalView.tsx + CSS
- src/App.tsx — BrowserRouter + AuthProvider + protected routes
- src/api/client.ts — axios + iacApi, workspaceApi, stateApi, llmApi, agentApi
- src/types/index.ts — TypeScript interfaces
- src/context/AuthContext.tsx — auth context, dummy credentials
- src/tokens/tokens.css — full CSS variable system (dark-first)
- package.json, vite.config.ts, tsconfig.json

### Infra (/workspace/infra/)
- main.tf, variables.tf, outputs.tf
- modules/backend_state/ — S3 + DynamoDB state locking (DEPLOY FIRST)
- modules/iam/ — Lambda execution role + policies
- modules/rds_aurora/ — Aurora PostgreSQL Serverless v2
- modules/lambda/ — FastAPI Lambda handler
- modules/api_gateway/ — HTTP API v2
- modules/s3/ — General-purpose S3 (Terraform state content)
- modules/s3_frontend/ — React SPA bucket
- modules/cloudfront/ — CDN distribution
- modules/secrets_manager/ — Anthropic API key + JWT secret
- modules/ecs/ — Fargate cluster (7 agent task definitions)
- modules/cloudwatch/ — Log groups, alarms, dashboard

### Docs (/workspace/docs/)
- component-spec.md — 19-component spec for all 4 CBRE Unified Asset Intelligence Platform views
- db-schema.md — full PostgreSQL schema documentation
- PROJECT-MEMORY.md — this file

## Blockers
- None. All 5 build agents DONE. Keerthi now QA lead.

## Notes for Next Session
- Session 7 (2026-03-25): Arjun nudged Keerthi with prioritised brief — qa-plan.md, e2e_integration.py, demo-script.md
- All build agents (Vikram, Kavya, Rasool, Kiran, Rohan) confirmed DONE across sessions 3–7
- Keerthi is at 10% — critical path item. Check keerthi status immediately on next session
- Demo credentials: admin / cbre_platform2026
- LLM endpoint: ANTHROPIC_API_KEY must be set in environment
- Run order for infra: backend_state module first, then root module
- Deadline: 2026-04-01 (hard)
- Sprint is in QA phase — no new features, only testing + fixes
- Check /workspace/docs/qa-plan.md and /workspace/tests/e2e_integration.py for Keerthi output
