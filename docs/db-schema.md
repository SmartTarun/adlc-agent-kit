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

---

---

# Agent: rasool | Sprint: 01 | Date: 2026-03-28
# CBRE Unified Asset Intelligence Platform — DB Schema (Migration 0002)

**Project**: CBRE Unified Asset Intelligence Platform
**Database**: PostgreSQL
**ORM**: SQLAlchemy 2.0 + Alembic
**Migration file**: `backend/migrations/versions/0002_cbre_schema.py`
**Chains from**: `0001` (INFRAVIZ)

---

## Architecture Decisions

| Decision | Value | Authority |
|---|---|---|
| Auth for MVP | None — no user FK | Arjun 2026-03-28 |
| All data storage | PostgreSQL (no S3 for CBRE) | Arjun |
| ETL scheduler | APScheduler — RentCast hourly + CSV on startup | Arjun |
| LLM | `claude-sonnet-4-6` via Anthropic API, SSE streaming | Arjun |
| Region scope | US-only; North America CRE conventions | Tarun |
| Property types | Office Class A/B/C only for Sprint-01 | Tarun |
| Financial conventions | NOI = Revenue − OpEx; Cap Rate = NOI/Value; DSCR = NOI/DebtService | domain |
| DB credentials | `DATABASE_URL` env var — no hardcoded creds | CLAUDE.md |

---

## Table Summary

Table names match Kiran's ORM models in `backend/app/models/cbre.py` exactly.

| Table | Screen | Data Source |
|---|---|---|
| `properties` | All screens | Seed data + RentCast |
| `buildings` | ESG, Occupancy, Maintenance | Seed data |
| `tenants` | Lease Risk, Tenant Experience | Seed data |
| `leases` | Predictive Lease Risk Engine | Seed data + Claude risk scoring |
| `esg_data` | ESG & Carbon Tracker | EIA CBECS CSV (per building) |
| `occupancy_data` | Tenant Experience Hub | Kaggle Occupancy CSV (per building) |
| `maintenance_tickets` | Tenant Experience Hub | Seed data (per building) |
| `chat_sessions` | AI Deal Assistant | Claude RAG session headers |
| `chat_messages` | AI Deal Assistant | Claude RAG turn messages |
| `etl_runs` | ETL health / admin | APScheduler audit log |
| `market_data` | Portfolio Overview, Lease Risk | RentCast API (city/state level) |

---

## Table Schemas

### `properties`
Core property catalogue. One row per US office campus (may contain multiple buildings).
Matches: `backend/app/models/cbre.py :: Property`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `address` | VARCHAR(512) | NOT NULL | |
| `city` | VARCHAR(128) | NOT NULL | |
| `state` | VARCHAR(2) | NOT NULL, default `CA` | US state code |
| `class_type` | VARCHAR(1) | NOT NULL, default `A` | `A`, `B`, `C` |
| `property_type` | VARCHAR(64) | NOT NULL, default `office` | |
| `total_sqft` | FLOAT | NOT NULL, default `0` | |
| `asset_value` | NUMERIC(18,2) | NOT NULL, default `0` | USD |
| `noi` | NUMERIC(18,2) | NOT NULL, default `0` | Net Operating Income USD |
| `cap_rate` | FLOAT | NULLABLE | e.g. 0.065 = 6.5% |
| `occupancy_rate` | FLOAT | NULLABLE | 0.0–100.0 % |
| `year_built` | INTEGER | NULLABLE | |
| `rentcast_id` | VARCHAR(128) | UNIQUE, NULLABLE | RentCast external ID |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_properties_city_state`, `ix_properties_class_type`, `ix_properties_property_type`, `ix_properties_rentcast_id`

---

### `buildings`
Individual building within a property. ESG, occupancy, and maintenance data hang off buildings.
Matches: `backend/app/models/cbre.py :: Building`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `property_id` | UUID | FK → `properties.id` CASCADE | Parent property |
| `name` | VARCHAR(255) | NOT NULL | |
| `floors` | INTEGER | NOT NULL, default `1` | |
| `total_sqft` | FLOAT | NOT NULL, default `0` | |
| `year_built` | INTEGER | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_buildings_property_id`

---

### `tenants`
Commercial tenant directory.
Matches: `backend/app/models/cbre.py :: Tenant`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `industry` | VARCHAR(128) | NULLABLE | |
| `credit_rating` | VARCHAR(8) | NULLABLE | e.g. `AA`, `A`, `BBB` |
| `contact_email` | VARCHAR(255) | NULLABLE | |
| `satisfaction_score` | FLOAT | NULLABLE | 0.0–10.0 |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_tenants_name`, `ix_tenants_industry`

---

### `leases`
Lease agreements with AI-generated risk scores. Powers the Predictive Lease Risk Engine.
Matches: `backend/app/models/cbre.py :: Lease`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `property_id` | UUID | FK → `properties.id` CASCADE | |
| `tenant_id` | UUID | FK → `tenants.id` CASCADE | |
| `unit_number` | VARCHAR(32) | NULLABLE | |
| `sqft` | FLOAT | NOT NULL, default `0` | |
| `start_date` | TIMESTAMPTZ | NOT NULL | |
| `end_date` | TIMESTAMPTZ | NOT NULL | Countdown source |
| `monthly_rent` | NUMERIC(12,2) | NOT NULL, default `0` | USD |
| `dscr` | FLOAT | NULLABLE | Debt Service Coverage Ratio |
| `risk_score` | FLOAT | NULLABLE | 0.0–100.0, Claude-generated |
| `risk_level` | VARCHAR(8) | NOT NULL, default `Low` | `High`, `Medium`, `Low` |
| `ai_recommendations` | TEXT | NULLABLE | Claude broker action |
| `is_active` | BOOLEAN | NOT NULL, default `true` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_leases_property_id`, `ix_leases_tenant_id`, `ix_leases_end_date`, `ix_leases_risk_level`, `ix_leases_is_active`

---

### `esg_data`
Monthly ESG / energy metrics per building (from EIA CBECS CSV). Powers ESG & Carbon Tracker.
Matches: `backend/app/models/cbre.py :: ESGData`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `building_id` | UUID | FK → `buildings.id` CASCADE | |
| `month_year` | VARCHAR(7) | NOT NULL | Format `YYYY-MM`, e.g. `2024-01` |
| `co2_emissions_tons` | FLOAT | NOT NULL, default `0` | CO2 equivalent metric tons |
| `energy_kwh` | FLOAT | NOT NULL, default `0` | Total electricity kWh |
| `energy_intensity_kwh_sqft` | FLOAT | NULLABLE | kWh per sqft |
| `co2_intensity_sqft` | FLOAT | NULLABLE | CO2 tons per sqft |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_esg_data_building_id`, `ix_esg_data_month_year` (composite: building_id + month_year)

---

### `occupancy_data`
Room-level occupancy sensor readings (from Kaggle CSV). Powers Tenant Experience Hub heatmap.
Matches: `backend/app/models/cbre.py :: OccupancyData`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `building_id` | UUID | FK → `buildings.id` CASCADE | |
| `floor` | INTEGER | NOT NULL | |
| `room_id` | VARCHAR(32) | NOT NULL | Sensor ID |
| `timestamp` | TIMESTAMPTZ | NOT NULL | Sensor reading time |
| `occupancy_ratio` | FLOAT | NOT NULL, default `0` | 0.0–1.0 |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_occupancy_data_building_id`, `ix_occupancy_data_floor_room` (composite), `ix_occupancy_data_timestamp`

---

### `maintenance_tickets`
Open and resolved maintenance requests per building. Powers Tenant Experience Hub ticket list.
Matches: `backend/app/models/cbre.py :: MaintenanceTicket`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `building_id` | UUID | FK → `buildings.id` CASCADE | |
| `tenant_id` | UUID | FK → `tenants.id` SET NULL, NULLABLE | |
| `title` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | NULLABLE | |
| `status` | VARCHAR(32) | NOT NULL, default `open` | `open`, `in_progress`, `resolved` |
| `priority` | VARCHAR(16) | NOT NULL, default `medium` | `low`, `medium`, `high`, `critical` |
| `reported_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `resolved_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_maintenance_tickets_building_id`, `ix_maintenance_tickets_tenant_id`, `ix_maintenance_tickets_status`, `ix_maintenance_tickets_priority`

---

### `chat_sessions`
AI Deal Assistant session header. Groups many `chat_messages` turns.
Matches: `backend/app/models/cbre.py :: ChatSession`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `session_id` | VARCHAR(128) | UNIQUE, NOT NULL | UUID string generated by client |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_chat_sessions_session_id`, `ix_chat_sessions_created_at`

---

### `chat_messages`
Individual turn (user or assistant) within an AI Deal Assistant session.
FK is on `session_id` string (not UUID) to match ORM design.
Matches: `backend/app/models/cbre.py :: ChatMessage`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `session_id` | VARCHAR(128) | FK → `chat_sessions.session_id` CASCADE | |
| `role` | VARCHAR(16) | NOT NULL | `user`, `assistant` |
| `content` | TEXT | NOT NULL | |
| `tokens_used` | INTEGER | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

**Indexes**: `ix_chat_messages_session_id`, `ix_chat_messages_role`, `ix_chat_messages_created_at`

---

### `etl_runs`
ETL pipeline execution audit log. Written by APScheduler on every RentCast pull and CSV import.
Matches: `backend/app/models/cbre.py :: ETLRun`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `source` | VARCHAR(64) | NOT NULL | `rentcast`, `eia_cbecs`, `kaggle`, `census_acs` |
| `status` | VARCHAR(32) | NOT NULL, default `running` | `running`, `success`, `failed` |
| `records_processed` | INTEGER | NOT NULL, default `0` | |
| `error_message` | TEXT | NULLABLE | |
| `started_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `completed_at` | TIMESTAMPTZ | NULLABLE | |

**Indexes**: `ix_etl_runs_source`, `ix_etl_runs_status`, `ix_etl_runs_started_at`

---

### `market_data`
US commercial real estate market metrics from RentCast API. City/state-level — no property FK.
Matches: `backend/app/models/cbre.py :: MarketData`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `city` | VARCHAR(128) | NOT NULL | |
| `state` | VARCHAR(2) | NOT NULL | |
| `property_type` | VARCHAR(64) | NOT NULL, default `office` | |
| `avg_cap_rate` | FLOAT | NULLABLE | |
| `avg_rent_sqft` | FLOAT | NULLABLE | USD per sqft |
| `avg_occupancy` | FLOAT | NULLABLE | 0.0–1.0 |
| `source` | VARCHAR(32) | NOT NULL, default `rentcast` | |
| `captured_at` | TIMESTAMPTZ | NOT NULL, default NOW() | ETL pull timestamp |

**Indexes**: `ix_market_data_city_state`, `ix_market_data_property_type`, `ix_market_data_captured_at`, `ix_market_data_source`

---

## ERD (Text) — CBRE

```
properties
  ├── buildings (property_id)
  │     ├── esg_data (building_id)
  │     ├── occupancy_data (building_id)
  │     └── maintenance_tickets (building_id → tenants)
  └── leases (property_id)
        └── tenants (tenant_id)

chat_sessions
  └── chat_messages (session_id)   — RAG queries all tables above

etl_runs    (audit log — no FK)
market_data (city/state level — no FK)
```

---

## Running CBRE Migration

```bash
# Run all migrations (0001 INFRAVIZ + 0002 CBRE)
export DATABASE_URL=postgresql://user:pass@localhost:5432/cbre
cd backend
alembic upgrade head

# Run only migration 0002
alembic upgrade 0002

# Rollback CBRE (back to INFRAVIZ only)
alembic downgrade 0001
```

---

## Files

| File | Purpose |
|---|---|
| `backend/migrations/versions/0001_initial_schema.py` | INFRAVIZ — 8 tables |
| `backend/migrations/versions/0002_cbre_schema.py` | CBRE — 11 tables + indexes |
| `docs/db-schema.md` | This file |

---

*Delivered by RASOOL — Database Agent | Sprint-01 | CBRE Unified Asset Intelligence Platform*


---

# Agent: rasool | Sprint: 02 | Date: 2026-03-31
# Smart Resume Screener — DB Schema (Migration 0003)

**Project**: Smart Resume Screener
**Database**: SQLite (file: `screener.db`, volume-mounted at `./data`)
**ORM**: SQLAlchemy 2.0 + Alembic
**Migration file**: `backend/migrations/versions/0003_smart_resume_screener.py`
**Chains from**: `0002` (CBRE)

---

## Architecture Decisions

| Decision | Value | Authority |
|---|---|---|
| Database | SQLite — not PostgreSQL | Arjun 2026-03-31 |
| Auth | None | Arjun |
| LLM scoring | `claude-sonnet-4-6` returns JSON per resume | Arjun |
| JSON columns | TEXT (SQLite has no JSONB) | Rasool |
| Deployment | Docker Compose only — no Terraform | Arjun |
| DB credentials | No credentials needed for SQLite | N/A |

---

## Table Summary

| Table | Purpose |
|---|---|
| `screening_sessions` | One row per recruiter session (job title + JD) |
| `resume_submissions` | One row per candidate resume; holds Claude's score + reasoning |

---

## Table Schemas

### `screening_sessions`
Created by the Upload screen when a recruiter submits a job description.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | VARCHAR(36) | PK, NOT NULL | UUID string |
| `job_title` | VARCHAR(255) | NOT NULL | e.g. "Senior Python Engineer" |
| `job_description` | TEXT | NOT NULL | Full JD text pasted by recruiter |
| `created_at` | DATETIME | NOT NULL, default NOW() | |

**Indexes**: `ix_screening_sessions_created_at`

---

### `resume_submissions`
One row per candidate resume. Claude scores are written back after API call completes.
`score` is NULL while Claude is processing; set to 0-100 on completion.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | VARCHAR(36) | PK, NOT NULL | UUID string |
| `session_id` | VARCHAR(36) | FK → `screening_sessions.id` CASCADE | Parent session |
| `candidate_name` | VARCHAR(255) | NOT NULL | Entered by recruiter |
| `resume_text` | TEXT | NOT NULL | Plain text of resume |
| `score` | INTEGER | NULLABLE | 0-100, NULL while pending |
| `matched_skills` | TEXT | NULLABLE | JSON array e.g. `["Python","FastAPI"]` |
| `skill_gaps` | TEXT | NULLABLE | JSON array e.g. `["Kubernetes"]` |
| `recommendation` | VARCHAR(16) | NULLABLE | `"Strong Hire"` \| `"Hire"` \| `"No Hire"` |
| `reasoning` | TEXT | NULLABLE | Claude's full explanation paragraph |
| `created_at` | DATETIME | NOT NULL, default NOW() | |

**Indexes**: `ix_resume_submissions_session_id`, `ix_resume_submissions_score`, `ix_resume_submissions_recommendation`, `ix_resume_submissions_created_at`

---

## ERD (Text) — Smart Resume Screener

```
screening_sessions
  └── resume_submissions (session_id)
        Claude API → score + matched_skills + skill_gaps + recommendation + reasoning
```

---

## Running Migration

```bash
# SQLite — DATABASE_URL auto-configured in docker-compose.yml
export DATABASE_URL=sqlite:///./data/screener.db
cd backend
alembic upgrade head     # runs 0001 → 0002 → 0003

# Run only migration 0003
alembic upgrade 0003

# Rollback Smart Resume Screener tables
alembic downgrade 0002
```

---

## Files

| File | Purpose |
|---|---|
| `backend/migrations/versions/0003_smart_resume_screener.py` | 2 tables + 5 indexes |
| `docs/db-schema.md` | This file |

---

*Delivered by RASOOL — Database Agent | Sprint-02 | Smart Resume Screener*
