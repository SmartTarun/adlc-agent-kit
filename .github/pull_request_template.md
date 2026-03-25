## 📋 PR Summary
<!-- Describe what this PR changes and why -->

## 🤖 Agent Responsible
<!-- Which agent made or owns these changes? -->
- [ ] Vikram (Infra / Terraform)
- [ ] Rasool (Database / Migrations)
- [ ] Kiran (Backend / API)
- [ ] Kavya (UX / Design Tokens)
- [ ] Rohan (Frontend / React)
- [ ] Keerthi (QA Sign-off)
- [ ] Arjun (Orchestration / Config)
- [ ] Tarun (Manual / Architecture)

## 🗂️ Files Changed
<!-- List key files added or modified -->
- 

## ✅ Pre-Merge Checklist
<!-- All boxes must be checked before merging -->

### Code Quality
- [ ] No hardcoded credentials or secrets
- [ ] No TODO comments left in code
- [ ] No `console.log` or `print` debug statements
- [ ] Top comment added: `# Agent: {name} | Sprint: {sprint} | Date: {date}`

### Terraform (if applicable — Vikram)
- [ ] `terraform fmt` passed
- [ ] `terraform validate` passed
- [ ] All AWS resources tagged: `Owner=TeamPanchayat`, `CostCenter=ADLC-{sprint from active-project.json}`
- [ ] No hardcoded credentials — using SSM / Secrets Manager

### Backend (if applicable — Kiran / Rasool)
- [ ] Pydantic v2 schemas used
- [ ] OpenAPI docstrings on all endpoints
- [ ] Alembic migration tested (up + down)
- [ ] pytest coverage ≥ 80%

### Frontend (if applicable — Rohan / Kavya)
- [ ] Design tokens used — no hardcoded colours
- [ ] Dark mode tested
- [ ] Recharts used for all charts
- [ ] TypeScript — no `any` types

### QA
- [ ] Keerthi has reviewed and signed off (for production PRs)
- [ ] `agent-status.json` updated to reflect `"done"` status

## 🔗 Linked Task / Sprint Item
<!-- Azure DevOps / GitHub issue number -->
Closes #

## 📸 Screenshots (if UI change)
<!-- Attach before/after screenshots for frontend changes -->

---
*ADLC-Agent-Kit · Team Panchayat · Author: Tarun Vangari*
