# Agent: rasool | Sprint: 01 | Date: 2026-03-16
# INFRAVIZ — PostgreSQL Database Schema

## Overview

**Database engine:** PostgreSQL (Aurora Serverless v2 — `us-east-1`)
**Migration tool:** Alembic 1.x + SQLAlchemy async
**Migration file:** `backend/migrations/versions/0001_initial_schema.py`

InfraViz stores workspace metadata, AI-generated Terraform artefacts, and LLM conversation history in PostgreSQL. Terraform state *content* is stored in S3; only the pointer/metadata is in the DB (Arjun decision 2026-03-16).

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| State content | S3 (`state_files.s3_key`) | State files can be large; S3 is cheaper and durable |
| Auth Sprint-01 | Dummy `users` table (bcrypt hash) | OAuth deferred to Sprint-02 |
| Cloud scope | `cloud_provider = 'aws'` default | AWS-only Sprint-01 |
| IaC scope | `action = 'validate'` default | Generate + Validate only; no apply/destroy |
| LLM model | `model_used = 'claude-sonnet-4-6'` | Claude claude-sonnet-4-6 via Anthropic API |

---

## Table List

| # | Table | Rows (est. demo) | Purpose |
|---|---|---|---|
| 1 | `users` | < 10 | Dummy auth credentials |
| 2 | `projects` | < 100 | Top-level IaC workspace container |
| 3 | `iac_templates` | < 500 | Claude-generated Terraform files, versioned |
| 4 | `state_files` | < 200 | Terraform state metadata + S3 pointer |
| 5 | `infra_resources` | < 2000 | AWS resources per project |
| 6 | `llm_conversations` | < 5000 | Full Claude prompt/response audit trail |
| 7 | `deployments` | < 500 | Terraform validate/apply run history |
| 8 | `drift_records` | < 1000 | Desired-vs-actual drift events |

---

## Table Definitions

### 1. `users`

Dummy credential store for Sprint-01. OAuth/Cognito deferred.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `username` | VARCHAR(64) | NOT NULL | — | UNIQUE |
| `email` | VARCHAR(255) | NOT NULL | — | UNIQUE |
| `hashed_password` | VARCHAR(255) | NOT NULL | — | bcrypt hash |
| `is_active` | BOOLEAN | NOT NULL | `true` | soft-disable |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_users_email`, `ix_users_username`

---

### 2. `projects`

Top-level container for all IaC artefacts, state files, and resources.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `name` | VARCHAR(128) | NOT NULL | — | workspace name |
| `description` | TEXT | NULL | — | optional description |
| `cloud_provider` | VARCHAR(32) | NOT NULL | `'aws'` | AWS-only Sprint-01 |
| `region` | VARCHAR(32) | NOT NULL | `'us-east-1'` | AWS region |
| `owner_id` | UUID | NULL | — | FK → `users.id` SET NULL |
| `is_active` | BOOLEAN | NOT NULL | `true` | soft-delete |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_projects_owner_id`, `ix_projects_cloud_provider`, `ix_projects_created_at`

---

### 3. `iac_templates`

Claude-generated Terraform (HCL) artefacts. Versioned per project.
Each generation call creates a new version row; `is_active` marks the current one.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `template_type` | VARCHAR(32) | NOT NULL | `'terraform'` | e.g. `terraform` |
| `content` | TEXT | NOT NULL | — | full HCL / multi-file JSON |
| `version` | INTEGER | NOT NULL | `1` | increments per project |
| `language` | VARCHAR(32) | NOT NULL | `'hcl'` | |
| `created_by_llm` | BOOLEAN | NOT NULL | `true` | AI-generated flag |
| `llm_session_id` | VARCHAR(128) | NULL | — | links to `llm_conversations.session_id` |
| `is_active` | BOOLEAN | NOT NULL | `true` | current active version |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_iac_templates_project_id`, `ix_iac_templates_created_by_llm`, `ix_iac_templates_version (project_id, version)`

---

### 4. `state_files`

Terraform state *metadata* only. Actual `.tfstate` content is stored in S3.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `template_id` | UUID | NULL | — | FK → `iac_templates.id` SET NULL |
| `state_version` | INTEGER | NOT NULL | `1` | monotonic per project |
| `backend_type` | VARCHAR(32) | NOT NULL | `'s3'` | always s3 Sprint-01 |
| `s3_bucket` | VARCHAR(255) | NULL | — | S3 bucket name |
| `s3_key` | VARCHAR(1024) | NULL | — | S3 object key |
| `s3_url` | VARCHAR(2048) | NULL | — | presigned or public URL |
| `checksum` | VARCHAR(64) | NULL | — | SHA-256 of state content |
| `resource_count` | INTEGER | NULL | — | count from state |
| `status` | VARCHAR(32) | NOT NULL | `'active'` | `active` / `superseded` |
| `applied_at` | TIMESTAMPTZ | NULL | — | when state was applied |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_state_files_project_id`, `ix_state_files_template_id`, `ix_state_files_state_version (project_id, state_version)`, `ix_state_files_applied_at`

---

### 5. `infra_resources`

Individual AWS resources described or discovered per project.
`config` JSONB stores resource-specific properties (e.g., instance type, AMI, CIDR).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `state_file_id` | UUID | NULL | — | FK → `state_files.id` SET NULL |
| `resource_type` | VARCHAR(128) | NOT NULL | — | e.g. `aws_instance`, `aws_s3_bucket` |
| `resource_name` | VARCHAR(255) | NOT NULL | — | Terraform resource label |
| `cloud_provider` | VARCHAR(32) | NOT NULL | `'aws'` | |
| `region` | VARCHAR(32) | NOT NULL | `'us-east-1'` | |
| `account_id` | VARCHAR(32) | NULL | — | AWS account ID |
| `config` | JSONB | NULL | — | resource-specific config |
| `status` | VARCHAR(32) | NOT NULL | `'planned'` | `planned` / `applied` / `destroyed` |
| `last_synced_at` | TIMESTAMPTZ | NULL | — | last sync from live state |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_infra_resources_project_id`, `ix_infra_resources_state_file_id`, `ix_infra_resources_resource_type`, `ix_infra_resources_status`, `ix_infra_resources_config_gin` (GIN on `config`)

---

### 6. `llm_conversations`

Full prompt/response audit trail for every Claude `claude-sonnet-4-6` call.
`session_id` groups a multi-turn refinement chain (Canvas, Dashboard, Terminal all produce separate sessions).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `session_id` | VARCHAR(128) | NOT NULL | — | UUID string per generation session |
| `turn_index` | INTEGER | NOT NULL | `0` | 0-based turn order within session |
| `role` | VARCHAR(16) | NOT NULL | `'user'` | `user` / `assistant` / `system` |
| `model_used` | VARCHAR(64) | NOT NULL | `'claude-sonnet-4-6'` | model identifier |
| `prompt_text` | TEXT | NULL | — | user prompt or system prompt |
| `response_text` | TEXT | NULL | — | assistant response |
| `tokens_used` | INTEGER | NULL | — | total tokens (prompt + completion) |
| `latency_ms` | INTEGER | NULL | — | end-to-end latency |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_llm_conversations_project_id`, `ix_llm_conversations_session_id`, `ix_llm_conversations_created_at`

> **Note:** `llm_conversations` has no `updated_at` — conversation turns are immutable once written.

---

### 7. `deployments`

Terraform execution run history. Sprint-01 scope: `validate` only.
`action` column is pre-seeded to `'validate'`; extend to `apply/destroy` in Sprint-02.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `template_id` | UUID | NULL | — | FK → `iac_templates.id` SET NULL |
| `state_file_id` | UUID | NULL | — | FK → `state_files.id` SET NULL |
| `deployed_by` | UUID | NULL | — | FK → `users.id` SET NULL |
| `action` | VARCHAR(32) | NOT NULL | `'validate'` | `validate` / `plan` / `apply` |
| `status` | VARCHAR(32) | NOT NULL | `'pending'` | `pending` / `running` / `success` / `failed` |
| `logs` | TEXT | NULL | — | Terraform stdout/stderr |
| `exit_code` | INTEGER | NULL | — | process exit code |
| `started_at` | TIMESTAMPTZ | NULL | — | execution start |
| `completed_at` | TIMESTAMPTZ | NULL | — | execution end |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_deployments_project_id`, `ix_deployments_template_id`, `ix_deployments_deployed_by`, `ix_deployments_status`, `ix_deployments_started_at`

---

### 8. `drift_records`

Desired-vs-actual state diff events. Detected when `.tfstate` import differs from current `infra_resources`.
`drift_summary` JSONB holds the full diff payload.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `gen_random_uuid()` | PK |
| `project_id` | UUID | NOT NULL | — | FK → `projects.id` CASCADE |
| `resource_id` | UUID | NOT NULL | — | FK → `infra_resources.id` CASCADE |
| `state_file_id` | UUID | NULL | — | FK → `state_files.id` SET NULL |
| `detected_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `drift_summary` | JSONB | NULL | — | full diff payload |
| `severity` | VARCHAR(16) | NOT NULL | `'medium'` | `low` / `medium` / `high` / `critical` |
| `resolved` | BOOLEAN | NOT NULL | `false` | |
| `resolved_at` | TIMESTAMPTZ | NULL | — | when resolved |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `now()` | |

**Indexes:** `ix_drift_records_project_id`, `ix_drift_records_resource_id`, `ix_drift_records_state_file_id`, `ix_drift_records_severity`, `ix_drift_records_resolved`, `ix_drift_records_detected_at`, `ix_drift_records_summary_gin` (GIN on `drift_summary`)

---

## Entity Relationship Summary

```
users (1) ──────────────────────────────┐
                                         │ owner_id
projects (1) ──────────┬────────────────┘
    │                  │                deployed_by
    │ CASCADE           │                    │
    ├── iac_templates   ├── state_files       ├── deployments
    │       │           │       │              │       │
    │       │ SET NULL  │       │ SET NULL     │ SET NULL
    │       └───────────┘       └──────────────┘
    │
    ├── infra_resources
    │       │
    │       │ CASCADE
    │       └── drift_records ── state_files (SET NULL)
    │
    └── llm_conversations
```

---

## Index Strategy Summary

| Index Type | Tables | Purpose |
|---|---|---|
| B-tree on FK columns | All tables | JOIN performance |
| B-tree on `created_at` | `projects`, `llm_conversations`, `deployments` | Time-range queries |
| B-tree on `status` | `deployments`, `infra_resources`, `drift_records` | Status filter queries |
| Composite B-tree | `iac_templates (project_id, version)`, `state_files (project_id, state_version)` | Version lookup |
| GIN on JSONB | `infra_resources.config`, `drift_records.drift_summary` | JSONB containment queries |

---

## Migration Files

| File | Purpose |
|---|---|
| `backend/migrations/alembic.ini` | Alembic config — `DATABASE_URL` injected at runtime from env/SSM |
| `backend/migrations/env.py` | Alembic env — reads `DATABASE_URL`, supports online + offline modes |
| `backend/migrations/versions/0001_initial_schema.py` | All 8 tables + indexes — initial migration |

---

## Running Migrations

```bash
# Local development
export DATABASE_URL=postgresql://infraviz:password@localhost:5432/infraviz
alembic upgrade head

# Check current revision
alembic current

# Rollback
alembic downgrade -1
```

For AWS Aurora: `DATABASE_URL` is injected automatically from SSM parameter `/infraviz/db-url` via Lambda environment.
