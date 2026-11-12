"""
Helpers for idempotent Alembic migrations.

PixelFlow databases come in two shapes: fresh ones (built by the migrations)
and older production ones that were created with ``Base.metadata.create_all``
before migrations existed. Migrations use these helpers so both converge on
the same schema: a column or table is only added when it is missing.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


def has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def has_column(table: str, column: str) -> bool:
    if not has_table(table):
        return False
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def add_column_if_missing(table: str, column: sa.Column) -> None:
    if has_table(table) and not has_column(table, column.name):
        with op.batch_alter_table(table) as batch:
            batch.add_column(column)


def drop_column_if_present(table: str, column: str) -> None:
    if has_column(table, column):
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)


def column_is_nullable(table: str, column: str) -> bool | None:
    """True/False for an existing column, None when the table or column is missing."""
    if not has_table(table):
        return None
    for c in sa.inspect(op.get_bind()).get_columns(table):
        if c["name"] == column:
            return bool(c["nullable"])
    return None


def set_nullable_if_needed(
    table: str, column: str, existing_type: sa.types.TypeEngine, nullable: bool = True
) -> None:
    """Change a column's NULL constraint only when it differs (batch mode: SQLite + PostgreSQL)."""
    current = column_is_nullable(table, column)
    if current is not None and current != nullable:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(column, existing_type=existing_type, nullable=nullable)
