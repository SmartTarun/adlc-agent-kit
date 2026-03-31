# Agent: rasool | Sprint: 02 | Date: 2026-03-31
"""Smart Resume Screener — DB schema

Adds 2 tables for the AI-powered resume screening tool.
SQLite via SQLAlchemy (no PostgreSQL for this project per Arjun decisions).
No auth, no user FK — anonymous sessions only.

Tables created:
  screening_sessions  — Job description + title per recruiter session
  resume_submissions  — Per-candidate score, skills, gaps, recommendation from Claude

Architecture decisions (Arjun 2026-03-31):
  - SQLite only (no PostgreSQL) — SQLAlchemy + Alembic
  - No authentication
  - claude-sonnet-4-6 scores each resume returning JSON
  - matched_skills + skill_gaps stored as JSON text columns (SQLite has no JSONB)
  - recommendation values: "Strong Hire" | "Hire" | "No Hire"
  - Docker Compose only — no Terraform

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── screening_sessions ──────────────────────────────────────────────────
    op.create_table(
        'screening_sessions',
        sa.Column('id',              sa.String(36),  nullable=False, primary_key=True),
        sa.Column('job_title',       sa.String(255), nullable=False),
        sa.Column('job_description', sa.Text(),      nullable=False),
        sa.Column('created_at',      sa.DateTime(),  nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_screening_sessions_created_at', 'screening_sessions', ['created_at'])

    # ── resume_submissions ──────────────────────────────────────────────────
    op.create_table(
        'resume_submissions',
        sa.Column('id',              sa.String(36),   nullable=False, primary_key=True),
        sa.Column('session_id',      sa.String(36),   sa.ForeignKey('screening_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('candidate_name',  sa.String(255),  nullable=False),
        sa.Column('resume_text',     sa.Text(),       nullable=False),
        sa.Column('score',           sa.Integer(),    nullable=True),   # 0-100, Claude-generated; NULL while pending
        sa.Column('matched_skills',  sa.Text(),       nullable=True),   # JSON array e.g. ["Python","FastAPI"]
        sa.Column('skill_gaps',      sa.Text(),       nullable=True),   # JSON array e.g. ["Kubernetes","Go"]
        sa.Column('recommendation',  sa.String(16),   nullable=True),   # "Strong Hire" | "Hire" | "No Hire"
        sa.Column('reasoning',       sa.Text(),       nullable=True),   # Claude's full explanation
        sa.Column('created_at',      sa.DateTime(),   nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_resume_submissions_session_id',     'resume_submissions', ['session_id'])
    op.create_index('ix_resume_submissions_score',          'resume_submissions', ['score'])
    op.create_index('ix_resume_submissions_recommendation', 'resume_submissions', ['recommendation'])
    op.create_index('ix_resume_submissions_created_at',     'resume_submissions', ['created_at'])


def downgrade() -> None:
    op.drop_table('resume_submissions')
    op.drop_table('screening_sessions')
