"""Email verification: users.email_verified and users.email_verified_at.

Idempotent (fresh databases already get both columns from the baseline, which
builds the current models). Accounts that sign in with Google are marked
verified, since Google has verified the address.

Revision ID: 0002_email_verification
Revises: 0001_baseline
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import add_column_if_missing, drop_column_if_present, has_column

revision = "0002_email_verification"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add_column_if_missing(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    if has_column("users", "email_verified"):
        op.execute(
            sa.text(
                "UPDATE users SET email_verified = :t "
                "WHERE oauth_provider = 'google' AND email_verified = :f"
            ).bindparams(t=True, f=False)
        )


def downgrade() -> None:
    drop_column_if_present("users", "email_verified_at")
    drop_column_if_present("users", "email_verified")
