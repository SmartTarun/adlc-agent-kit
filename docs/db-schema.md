# Agent: rasool | Sprint: 01 | Date: 2026-03-16
# INFRAVIZ — Database Schema Documentation

**Project**: InfraViz — AI-powered IaC Generation Platform
**Database**: PostgreSQL (Aurora Serverless v2, us-east-1)
**ORM**: SQLAlchemy (async) + Alembic migrations
**Migration file**: `backend/migrations/versions/0001_initial_schema.py`

---

## Architecture Decisions

| Decision | Value | Authority |
|---|---|---|
| State file content storage | S3 — metadata-only in DB | Arjun 2026-03-16 |
| Auth strategy | Dummy username/password, JWT in localStorage | Tarun |
| Cloud scope (Sprint-01) | AWS-only | Arjun |
| IaC engine | Terraform-only (generate + validate, no apply) | Arjun |
| LLM | `claude-sonnet-4-6` via Anthropic API direct | Arjun |
| DB credentials | `DATABASE_URL` env var only — no hardcoded creds | CLAUDE.md |

---

## Table Summary

| Table | Purpose | Key Relationships |
|---|---|---|
| `users` | Dummy auth store (Sprint-01) | Referenced by `projects`, `deployments` |
| `projects` | Top-level IaC workspace container | Parent of all other tables |
| `iac_templates` | Claude-generated Terraform artefacts | Belongs to `projects` |
| `state_files` | Terraform state metadata (S3 pointer) | Belongs to `projects`, links to `iac_templates` |
| `infra_resources` | AWS resources tracked per project | Belongs to `projects`, optionally to `state_files` |
| `llm_conversations` | Claude prompt/response audit trail | Belongs to `projects` |
| `deployments` | Validate/apply run history | Belongs to `projects`, `iac_templates`, `state_files` |
| `drift_records` | Desired-vs-actual drift events | Belongs to `projects`, `infra_resources`, `state_files` |

---

## Table Schemas

### `users`
Dummy credential store for Sprint-01. OAuth / Cognito deferred to Sprint-02.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | Auto-generated |
| `username` | VARCHAR(64) | UNIQUE, NOT NULL | Login identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User email |
| `hashed_password` | VARCHAR(255) | NOT NULL | bcrypt hash |
| `is_active` | BOOLEAN | NOT NULL, default `true` | Soft disable |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_users_email`, `ix_users_username`

---

### `projects`
Top-level container for all IaC artefacts. Maps to a user "workspace" in the UI.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `name` | VARCHAR(128) | NOT NULL | Workspace name |
| `description` | TEXT | NULLABLE | |
| `cloud_provider` | VARCHAR(32) | NOT NULL, default `aws` | `aws` only Sprint-01 |
| `region` | VARCHAR(32) | NOT NULL, default `us-east-1` | AWS region |
| `owner_id` | UUID | FK → `users.id` SET NULL | Project owner |
| `is_active` | BOOLEAN | NOT NULL, default `true` | Soft delete |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_projects_owner_id`, `ix_projects_cloud_provider`, `ix_projects_created_at`

---

### `iac_templates`
Claude-generated Terraform code artefacts. Each generate call creates a new versioned record.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | Parent workspace |
| `template_type` | VARCHAR(32) | NOT NULL, default `terraform` | Extensible for future IaC types |
| `content` | TEXT | NOT NULL | HCL content (full Terraform output) |
| `version` | INTEGER | NOT NULL, default `1` | Increments per project |
| `language` | VARCHAR(32) | NOT NULL, default `hcl` | |
| `created_by_llm` | BOOLEAN | NOT NULL, default `true` | AI vs manual |
| `llm_session_id` | VARCHAR(128) | NULLABLE | Links to `llm_conversations.session_id` |
| `is_active` | BOOLEAN | NOT NULL, default `true` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_iac_templates_project_id`, `ix_iac_templates_created_by_llm`, `ix_iac_templates_version` (composite: `project_id, version`)

---

### `state_files`
Terraform state **metadata** only. Actual `.tfstate` file content lives in S3.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | Parent workspace |
| `template_id` | UUID | FK → `iac_templates.id` SET NULL | Linked template |
| `state_version` | INTEGER | NOT NULL, default `1` | |
| `backend_type` | VARCHAR(32) | NOT NULL, default `s3` | `s3` only Sprint-01 |
| `s3_bucket` | VARCHAR(255) | NULLABLE | S3 bucket name |
| `s3_key` | VARCHAR(1024) | NULLABLE | S3 object key path |
| `s3_url` | VARCHAR(2048) | NULLABLE | Full S3 URL |
| `checksum` | VARCHAR(64) | NULLABLE | SHA256 of state content |
| `resource_count` | INTEGER | NULLABLE | Parsed from state |
| `status` | VARCHAR(32) | NOT NULL, default `active` | `active`, `archived`, `corrupt` |
| `applied_at` | TIMESTAMPTZ | NULLABLE | When state was applied |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_state_files_project_id`, `ix_state_files_template_id`, `ix_state_files_state_version` (composite), `ix_state_files_applied_at`

---

### `infra_resources`
AWS resources described or tracked per project. Populated by parsing Terraform plans and imported state files.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | |
| `state_file_id` | UUID | FK → `state_files.id` SET NULL | Source state |
| `resource_type` | VARCHAR(128) | NOT NULL | e.g. `aws_s3_bucket` |
| `resource_name` | VARCHAR(255) | NOT NULL | Terraform logical name |
| `cloud_provider` | VARCHAR(32) | NOT NULL, default `aws` | |
| `region` | VARCHAR(32) | NOT NULL, default `us-east-1` | |
| `account_id` | VARCHAR(32) | NULLABLE | AWS account ID |
| `config` | JSONB | NULLABLE | Resource config snapshot |
| `status` | VARCHAR(32) | NOT NULL, default `planned` | `planned`, `active`, `destroyed` |
| `last_synced_at` | TIMESTAMPTZ | NULLABLE | Last live-sync time |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_infra_resources_project_id`, `ix_infra_resources_state_file_id`, `ix_infra_resources_resource_type`, `ix_infra_resources_status`, `ix_infra_resources_config_gin` (GIN on `config`)

---

### `llm_conversations`
Full Claude `claude-sonnet-4-6` prompt/response audit trail. `session_id` groups multi-turn chains.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | |
| `session_id` | VARCHAR(128) | NOT NULL | Groups turns (e.g. UUID v4) |
| `turn_index` | INTEGER | NOT NULL, default `0` | Ordering within session |
| `role` | VARCHAR(16) | NOT NULL, default `user` | `user` or `assistant` |
| `model_used` | VARCHAR(64) | NOT NULL, default `claude-sonnet-4-6` | |
| `prompt_text` | TEXT | NULLABLE | User prompt |
| `response_text` | TEXT | NULLABLE | Claude response |
| `tokens_used` | INTEGER | NULLABLE | Token count from API |
| `latency_ms` | INTEGER | NULLABLE | Round-trip ms |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_llm_conversations_project_id`, `ix_llm_conversations_session_id`, `ix_llm_conversations_created_at`

---

### `deployments`
Deployment/validation run history. Sprint-01 scope: `validate` only (no `apply`/`destroy`).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | |
| `template_id` | UUID | FK → `iac_templates.id` SET NULL | Template being run |
| `state_file_id` | UUID | FK → `state_files.id` SET NULL | Resulting state |
| `deployed_by` | UUID | FK → `users.id` SET NULL | Triggering user |
| `action` | VARCHAR(32) | NOT NULL, default `validate` | `validate`, `plan`, `apply` |
| `status` | VARCHAR(32) | NOT NULL, default `pending` | `pending`, `running`, `success`, `failed` |
| `logs` | TEXT | NULLABLE | CLI output |
| `exit_code` | INTEGER | NULLABLE | Process exit code |
| `started_at` | TIMESTAMPTZ | NULLABLE | |
| `completed_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_deployments_project_id`, `ix_deployments_template_id`, `ix_deployments_deployed_by`, `ix_deployments_status`, `ix_deployments_started_at`

---

### `drift_records`
Desired-vs-actual state diff events per resource. Populated by drift detection logic.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `project_id` | UUID | FK → `projects.id` CASCADE | |
| `resource_id` | UUID | FK → `infra_resources.id` CASCADE | Affected resource |
| `state_file_id` | UUID | FK → `state_files.id` SET NULL | Reference state |
| `detected_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `drift_summary` | JSONB | NULLABLE | `{field, expected, actual}` diff |
| `severity` | VARCHAR(16) | NOT NULL, default `medium` | `low`, `medium`, `high`, `critical` |
| `resolved` | BOOLEAN | NOT NULL, default `false` | |
| `resolved_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_drift_records_project_id`, `ix_drift_records_resource_id`, `ix_drift_records_state_file_id`, `ix_drift_records_severity`, `ix_drift_records_resolved`, `ix_drift_records_detected_at`, `ix_drift_records_summary_gin` (GIN on `drift_summary`)

---

## ERD (Text)

```
users
  └── projects (owner_id)
        ├── iac_templates (project_id)
        │     └── state_files (template_id) ──→ [S3 content]
        ├── state_files (project_id)
        │     └── infra_resources (state_file_id)
        │           └── drift_records (resource_id)
        ├── llm_conversations (project_id)
        └── deployments (project_id, template_id, state_file_id, deployed_by→users)
```

---

## Running Migrations

```bash
# Local development
export DATABASE_URL=postgresql://infraviz:pass@localhost:5432/infraviz
cd backend
alembic upgrade head

# AWS (Lambda / ECS) — DATABASE_URL injected from SSM /infraviz/db-url
alembic upgrade head

# Rollback
alembic downgrade -1

# Generate new migration after model changes
alembic revision --autogenerate -m "describe_change"
```

---

## Files

| File | Purpose |
|---|---|
| `backend/migrations/alembic.ini` | Alembic config (DATABASE_URL injected at runtime) |
| `backend/migrations/env.py` | Migration environment — reads `DATABASE_URL` env var |
| `backend/migrations/versions/0001_initial_schema.py` | All 8 tables + indexes |
| `backend/app/database.py` | Async SQLAlchemy engine + session factory (Kiran) |
| `docs/db-schema.md` | This file |

---

*Delivered by RASOOL — Database Agent | Sprint-01 | INFRAVIZ*
