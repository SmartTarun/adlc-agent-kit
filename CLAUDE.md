# Team Panchayat — ADLC Project Standards
> All agents MUST read this file before starting any task.

## Project: {read from active-project.json}
**Sprint**: {read from active-project.json}
**Author**: Tarun Vangari (tarun.vangari@gmail.com)
**Role**: DevOps & Cloud Architect
**Owner**: Tarun Vangari
**Orchestrator**: Arjun (PM/Scrum Master)

---

## Folder Ownership — DO NOT CROSS BOUNDARIES

| Agent   | Owns                                      | Must NOT touch               |
|---------|-------------------------------------------|------------------------------|
| Vikram  | /infra/modules/                           | /backend, /frontend, /docs   |
| Rasool  | /backend/migrations/, /docs/db-schema.md  | /infra, /frontend            |
| Kiran   | /backend/app/routers/, /backend/app/schemas/, /backend/tests/ | /infra, /frontend, /migrations |
| Kavya   | /frontend/src/tokens/, /docs/component-spec.md | /infra, /backend        |
| Rohan   | /frontend/src/components/                 | /infra, /backend, /migrations|
| Keerthi | READ-ONLY everywhere + /docs/qa-report.md | No code changes allowed      |

---

## Tagging Standards (ALL resources)
Every AWS resource must have these tags:
```
Environment = dev | staging | prod
Owner       = TeamPanchayat
CostCenter  = ADLC-Sprint01
Project     = CostAnomalyPlatform
```

## Terraform Standards (Vikram)
- Terraform version: >= 1.7
- AWS provider: >= 5.0
- Backend: S3 + DynamoDB state locking
- All modules must have: main.tf, variables.tf, outputs.tf
- No hardcoded credentials — use AWS Secrets Manager or SSM
- Run `terraform fmt` and `terraform validate` before marking DONE

## Backend Standards (Kiran + Rasool)
- Python 3.11+
- FastAPI with Pydantic v2 schemas
- All endpoints must have OpenAPI docstrings
- Database: PostgreSQL via SQLAlchemy
- Migrations: Alembic only
- Tests: pytest, minimum 80% coverage

## Frontend Standards (Rohan + Kavya)
- React 18 + TypeScript
- Use design tokens from /frontend/src/tokens/tokens.css
- Dark mode first
- Charts: Recharts only
- No hardcoded colours — use CSS variables

## Agent Status Updates (ALL agents)
After completing each major step, update `/agent-status.json`:
```json
{
  "agentName": {
    "status": "wip|done|blocked",
    "progress": 0-100,
    "task": "current task description",
    "blocker": "describe blocker or empty string",
    "updated": "ISO timestamp"
  }
}
```

## Communication Rules
- Report progress to Arjun, not to each other directly
- Dependency handoffs: write a note in /agent-logs/{your-name}.log
- If blocked: immediately update status to "blocked" with blocker description
- Keerthi activates ONLY when Arjun confirms all 5 agents are DONE

## Quality Gates
- No TODO comments left in final code
- No console.log or print debug statements
- All files must have a top comment: `# Agent: {name} | Sprint: {sprint} | Date: {date}`

---

## Agent Memory Standards (ALL agents)

Every agent MUST read their memory file at the start of EVERY session:
```
agent-memory/{agentname}-memory.json
```

### Memory Schema
```json
{
  "agent": "name",
  "sprint": "{read from active-project.json}",
  "lastActive": "ISO timestamp",
  "sessionCount": 0,
  "currentTask": {
    "title": "task description",
    "status": "not_started | in_progress | blocked | done",
    "progressPercent": 0,
    "startedAt": "ISO timestamp",
    "lastStepCompleted": "description of last step"
  },
  "completedTasks": ["task1", "task2"],
  "filesCreated": ["path/to/file.tf"],
  "filesModified": ["path/to/file.py"],
  "keyDecisions": ["Used KMS for S3 encryption"],
  "pendingNextSteps": ["Next thing to do"],
  "dependenciesStatus": {
    "waitingFor": "agent or condition",
    "readyToUnblock": "agent that can now proceed"
  },
  "blockers": ["description of blocker"],
  "notes": "free text"
}
```

### Memory Rules
- Read memory FIRST — before reading CLAUDE.md or doing any work
- Update memory AFTER every major step — not just at the end
- Never redo work listed in filesCreated or completedTasks
- Set dependenciesStatus.readyToUnblock when your output enables another agent
- When restarting, increment sessionCount and set lastActive to now
