"""Migrations run at startup: they must build a fresh database, adopt one created
by create_all() before migrations existed (production), and be idempotent."""

from pathlib import Path

import sqlalchemy as sa

import app.models.db_models  # noqa: F401
from alembic.config import Config
from alembic.script import ScriptDirectory
from app.core.database import Base, run_migrations

BACKEND = Path(__file__).resolve().parents[1]


def _head() -> str:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(cfg).get_current_head()


def _version(engine) -> str:
    with engine.connect() as c:
        return c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()


def _schema(engine) -> dict:
    insp = sa.inspect(engine)
    return {
        t: sorted(c["name"] for c in insp.get_columns(t))
        for t in insp.get_table_names()
        if t != "alembic_version"
    }


def test_fresh_database_gets_the_full_schema(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    run_migrations(engine)
    assert _version(engine) == _head()
    expected = {t.name: sorted(c.name for c in t.columns) for t in Base.metadata.sorted_tables}
    assert _schema(engine) == expected


def test_existing_create_all_database_is_adopted(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(bind=engine)  # how production databases were made
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO users (email, username, hashed_password, is_active, is_admin) VALUES ('a@b.c','a','x',1,0)"
            )
        )
    run_migrations(engine)
    assert _version(engine) == _head()
    with engine.connect() as c:  # data survives
        assert c.execute(sa.text("SELECT count(*) FROM users")).scalar_one() == 1


def test_migrations_are_idempotent(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'twice.db'}")
    run_migrations(engine)
    before = _schema(engine)
    run_migrations(engine)
    assert _schema(engine) == before and _version(engine) == _head()
