# Agent: rasool | Sprint: 01 | Date: 2026-03-16
"""Initial schema — INFRAVIZ platform

Creates all 8 core tables for the INFRAVIZ AI-enabled IaC generator and
state management platform.

Tables:
  users             — dummy auth for Sprint-01 (OAuth deferred)
  projects          — top-level IaC project container
  iac_templates     — Claude-generated Terraform code artefacts
  state_files       — Terraform state metadata (content stored in S3)
  infra_resources   — AWS resources described/tracked per project
  llm_conversations — Full Claude prompt/response audit history
  deployments       — Deployment run history per template
  drift_records     — Desired-vs-actual state drift events

Key decisions (Arjun 2026-03-16 09:20):
  - State file content lives in S3; only metadata stored in DB
  - AWS-only, Terraform-only for Sprint-01
  - LLM: Claude claude-sonnet-4-6 via Anthropic API direct
  - Auth: dummy username/password; OAuth deferred to Sprint-02

Revision ID: 0001
Revises: (none — initial migration)
Create Date: 2026-03-16
"""

from __future__ import annotations

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# Alembic revision metadata
revision: str = "0001"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # TABLE: users
    # Dummy credential store for Sprint-01. OAuth / Cognito deferred.
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    # ------------------------------------------------------------------
    # TABLE: projects
    # Top-level container for all IaC artefacts, state files, resources.
    # ------------------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cloud_provider", sa.String(32), nullable=False, server_default="aws"),
        sa.Column("region", sa.String(32), nullable=False, server_default="us-east-1"),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_index("ix_projects_cloud_provider", "projects", ["cloud_provider"])
    op.create_index("ix_projects_created_at", "projects", ["created_at"])

    # ------------------------------------------------------------------
    # TABLE: iac_templates
    # Claude-generated Terraform code artefacts. Versioned per project.
    # ------------------------------------------------------------------
    op.create_table(
        "iac_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_type", sa.String(32), nullable=False, server_default="terraform"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("language", sa.String(32), nullable=False, server_default="hcl"),
        sa.Column("created_by_llm", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("llm_session_id", sa.String(128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_iac_templates_project_id", "iac_templates", ["project_id"])
    op.create_index("ix_iac_templates_created_by_llm", "iac_templates", ["created_by_llm"])
    op.create_index("ix_iac_templates_version", "iac_templates", ["project_id", "version"])

    # ------------------------------------------------------------------
    # TABLE: state_files
    # Terraform state metadata only. Actual state content lives in S3.
    # Decision: Arjun confirmed S3 storage + DB holds pointer/metadata.
    # ------------------------------------------------------------------
    op.create_table(
        "state_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("iac_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("state_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("backend_type", sa.String(32), nullable=False, server_default="s3"),
        sa.Column("s3_bucket", sa.String(255), nullable=True),
        sa.Column("s3_key", sa.String(1024), nullable=True),
        sa.Column("s3_url", sa.String(2048), nullable=True),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("resource_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_state_files_project_id", "state_files", ["project_id"])
    op.create_index("ix_state_files_template_id", "state_files", ["template_id"])
    op.create_index("ix_state_files_state_version", "state_files", ["project_id", "state_version"])
    op.create_index("ix_state_files_applied_at", "state_files", ["applied_at"])

    # ------------------------------------------------------------------
    # TABLE: infra_resources
    # AWS resources described or tracked per project (AWS-only Sprint-01).
    # ------------------------------------------------------------------
    op.create_table(
        "infra_resources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("state_file_id", UUID(as_uuid=True), sa.ForeignKey("state_files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resource_type", sa.String(128), nullable=False),
        sa.Column("resource_name", sa.String(255), nullable=False),
        sa.Column("cloud_provider", sa.String(32), nullable=False, server_default="aws"),
        sa.Column("region", sa.String(32), nullable=False, server_default="us-east-1"),
        sa.Column("account_id", sa.String(32), nullable=True),
        sa.Column("config", JSONB(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="planned"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_infra_resources_project_id", "infra_resources", ["project_id"])
    op.create_index("ix_infra_resources_state_file_id", "infra_resources", ["state_file_id"])
    op.create_index("ix_infra_resources_resource_type", "infra_resources", ["resource_type"])
    op.create_index("ix_infra_resources_status", "infra_resources", ["status"])
    op.create_index("ix_infra_resources_config_gin", "infra_resources", ["config"], postgresql_using="gin")

    # ------------------------------------------------------------------
    # TABLE: llm_conversations
    # Full Claude claude-sonnet-4-6 prompt/response audit trail.
    # session_id groups multi-turn refinement chains.
    # ------------------------------------------------------------------
    op.create_table(
        "llm_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(128), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("model_used", sa.String(64), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("response_text", sa.Text(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_llm_conversations_project_id", "llm_conversations", ["project_id"])
    op.create_index("ix_llm_conversations_session_id", "llm_conversations", ["session_id"])
    op.create_index("ix_llm_conversations_created_at", "llm_conversations", ["created_at"])

    # ------------------------------------------------------------------
    # TABLE: deployments
    # Deployment execution history per template.
    # IaC execution scope Sprint-01: generate+validate only (Tarun: "1").
    # This table records any apply/destroy runs if scope expands.
    # ------------------------------------------------------------------
    op.create_table(
        "deployments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("iac_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("state_file_id", UUID(as_uuid=True), sa.ForeignKey("state_files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deployed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(32), nullable=False, server_default="validate"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("logs", sa.Text(), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_deployments_project_id", "deployments", ["project_id"])
    op.create_index("ix_deployments_template_id", "deployments", ["template_id"])
    op.create_index("ix_deployments_deployed_by", "deployments", ["deployed_by"])
    op.create_index("ix_deployments_status", "deployments", ["status"])
    op.create_index("ix_deployments_started_at", "deployments", ["started_at"])

    # ------------------------------------------------------------------
    # TABLE: drift_records
    # Desired-vs-actual state diff events per resource.
    # ------------------------------------------------------------------
    op.create_table(
        "drift_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), sa.ForeignKey("infra_resources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("state_file_id", UUID(as_uuid=True), sa.ForeignKey("state_files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("drift_summary", JSONB(), nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_drift_records_project_id", "drift_records", ["project_id"])
    op.create_index("ix_drift_records_resource_id", "drift_records", ["resource_id"])
    op.create_index("ix_drift_records_state_file_id", "drift_records", ["state_file_id"])
    op.create_index("ix_drift_records_severity", "drift_records", ["severity"])
    op.create_index("ix_drift_records_resolved", "drift_records", ["resolved"])
    op.create_index("ix_drift_records_detected_at", "drift_records", ["detected_at"])
    op.create_index("ix_drift_records_summary_gin", "drift_records", ["drift_summary"], postgresql_using="gin")


def downgrade() -> None:
    # Drop in reverse FK dependency order
    op.drop_table("drift_records")
    op.drop_table("deployments")
    op.drop_table("llm_conversations")
    op.drop_table("infra_resources")
    op.drop_table("state_files")
    op.drop_table("iac_templates")
    op.drop_table("projects")
    op.drop_table("users")
