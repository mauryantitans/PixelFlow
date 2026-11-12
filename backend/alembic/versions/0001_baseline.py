"""Baseline: the schema as it stood when migrations were introduced (1.2.0).

Creates any missing tables and never touches existing ones, so it is safe on a
fresh database and on production databases created earlier by create_all().

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def _baseline_metadata() -> sa.MetaData:
    # The models module is the source of truth for the baseline tables. Later
    # migrations add to it with the idempotent helpers, so a fresh database
    # (which gets the current models here) and an old one converge.
    from app.core.database import Base
    import app.models.db_models  # noqa: F401  (register every table)

    return Base.metadata


def upgrade() -> None:
    _baseline_metadata().create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    raise RuntimeError("The baseline can't be downgraded; restore a backup instead.")
