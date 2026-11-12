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
