"""users.preferences: appearance (theme + mode) saved to the account.

Revision ID: 0004_user_preferences
Revises: 0003_object_storage
Create Date: 2026-11-12
"""

import sqlalchemy as sa

from app.core.migration_helpers import add_column_if_missing, drop_column_if_present

revision = "0004_user_preferences"
down_revision = "0003_object_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing("users", sa.Column("preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    drop_column_if_present("users", "preferences")
