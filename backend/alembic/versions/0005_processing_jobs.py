"""processing_jobs: batch runs processed in the background.

Revision ID: 0005_processing_jobs
Revises: 0004_user_preferences
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import has_table

revision = "0005_processing_jobs"
down_revision = "0004_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if has_table("processing_jobs"):
        return
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("pipeline", sa.JSON(), nullable=False),
        sa.Column("image_ids", sa.JSON(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("results", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    for col in ("id", "session_id", "user_id", "status", "created_at"):
        op.create_index(f"ix_processing_jobs_{col}", "processing_jobs", [col])


def downgrade() -> None:
    if has_table("processing_jobs"):
        op.drop_table("processing_jobs")
