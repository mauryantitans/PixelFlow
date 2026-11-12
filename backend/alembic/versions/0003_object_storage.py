"""Optional object storage for image bytes (STORAGE_BACKEND=s3).

Adds ``storage_key`` to uploaded_images and processed_images and makes
``image_data`` nullable: rows stored in a bucket keep only the object key.
Idempotent (fresh databases already get both from the baseline).

Revision ID: 0003_object_storage
Revises: 0001_baseline
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

from app.core.migration_helpers import (
    add_column_if_missing,
    drop_column_if_present,
    has_column,
    set_nullable_if_needed,
)

revision = "0003_object_storage"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

_TABLES = ("uploaded_images", "processed_images")


def upgrade() -> None:
    for table in _TABLES:
        add_column_if_missing(table, sa.Column("storage_key", sa.String(), nullable=True))
        set_nullable_if_needed(table, "image_data", sa.LargeBinary(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in _TABLES:
        if has_column(table, "storage_key"):
            in_bucket = bind.execute(
                sa.text(f"SELECT count(*) FROM {table} WHERE storage_key IS NOT NULL")
            ).scalar()
            if in_bucket:
                raise RuntimeError(
                    f"{table} has {in_bucket} row(s) whose bytes are in object storage; "
                    "copy them back into image_data before downgrading."
                )
    for table in _TABLES:
        drop_column_if_present(table, "storage_key")
        set_nullable_if_needed(table, "image_data", sa.LargeBinary(), nullable=False)
