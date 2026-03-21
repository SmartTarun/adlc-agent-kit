# Agent: rasool | Sprint: 01 | Date: 2026-03-16
"""
Alembic migration environment configuration.
Reads DATABASE_URL from environment variable — no hardcoded credentials.
Compatible with Aurora Serverless v2 PostgreSQL (us-east-1).
"""

import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic Config object — provides access to values within alembic.ini
config = context.config

# Logging setup from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject DATABASE_URL from environment into Alembic config
# Set via SSM Parameter Store (/infraviz/db-url) or local .env for development
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "For local dev: export DATABASE_URL=postgresql://user:pass@host:5432/infraviz. "
        "For AWS: read from SSM /infraviz/db-url via Lambda env injection."
    )

config.set_main_option("sqlalchemy.url", database_url)

# Import metadata from models if doing auto-generate (optional, offline mode only)
target_metadata = None


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    Configures context with just a URL — no Engine created.
    Useful for generating SQL scripts without a live DB connection.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.
    Creates an Engine and associates a connection with the context.
    This is the default mode for CI/CD and local runs.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
