"""Migrations run at startup: they must build a fresh database, adopt one created
by create_all() before migrations existed (production), and be idempotent."""

from pathlib import Path

import pytest
import sqlalchemy as sa

import app.models.db_models  # noqa: F401
from alembic import command
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


# --- 0003_object_storage ------------------------------------------------------

_IMAGE_TABLES = ("uploaded_images", "processed_images")


def _pre_object_storage_metadata() -> sa.MetaData:
    """The models as they were before object storage: no storage_key, image_data NOT NULL."""
    old = sa.MetaData()
    for table in Base.metadata.sorted_tables:
        columns = []
        for column in table.columns:
            if table.name in _IMAGE_TABLES and column.name == "storage_key":
                continue
            copy = column._copy()
            if table.name in _IMAGE_TABLES and column.name == "image_data":
                copy.nullable = False
            columns.append(copy)
        sa.Table(table.name, old, *columns)
    return old


def _nullable(engine, table: str, column: str) -> bool:
    return next(c["nullable"] for c in sa.inspect(engine).get_columns(table) if c["name"] == column)


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.attributes["skip_logging_config"] = True
    return cfg


def test_pre_object_storage_database_is_upgraded_and_keeps_its_images(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'pre_storage.db'}")
    _pre_object_storage_metadata().create_all(bind=engine)
    assert not _nullable(engine, "uploaded_images", "image_data")
    with engine.begin() as c:
        c.execute(sa.text("INSERT INTO sessions (id, expires_at) VALUES ('s1', '2030-01-01')"))
        c.execute(
            sa.text(
                "INSERT INTO uploaded_images (id, session_id, filename, image_data, width, height,"
                " format, size_bytes, mime_type) VALUES ('i1','s1','a.png',:b,1,1,'PNG',3,'image/png')"
            ),
            {"b": b"abc"},
        )
        c.execute(
            sa.text(
                "INSERT INTO processed_images (id, session_id, original_image_id, image_data,"
                " pipeline_data) VALUES ('p1','s1','i1',:b,'[]')"
            ),
            {"b": b"xyz"},
        )

    run_migrations(engine)

    assert _version(engine) == _head()
    for table in _IMAGE_TABLES:
        assert "storage_key" in _schema(engine)[table]
        assert _nullable(engine, table, "image_data")
    with engine.connect() as c:
        assert c.execute(sa.text("SELECT image_data FROM uploaded_images")).scalar_one() == b"abc"
        assert c.execute(sa.text("SELECT image_data FROM processed_images")).scalar_one() == b"xyz"
    expected = {t.name: sorted(c.name for c in t.columns) for t in Base.metadata.sorted_tables}
    assert _schema(engine) == expected
    run_migrations(engine)  # and again: nothing left to do
    assert _schema(engine) == expected


def test_object_storage_downgrade_refuses_to_strand_bucket_rows(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'down.db'}")
    run_migrations(engine)
    cfg = _alembic_config()
    with engine.begin() as c:
        c.execute(sa.text("INSERT INTO sessions (id, expires_at) VALUES ('s1', '2030-01-01')"))
        c.execute(
            sa.text(
                "INSERT INTO uploaded_images (id, session_id, filename, storage_key, width, height,"
                " format, size_bytes, mime_type) VALUES ('i1','s1','a','k',1,1,'PNG',1,'image/png')"
            )
        )

    # Step below the later revisions first, so the refusal under test is the
    # only thing that happens in the failing transaction.
    with engine.begin() as c:
        cfg.attributes["connection"] = c
        command.downgrade(cfg, "0003_object_storage")

    with pytest.raises(RuntimeError, match="object storage"):
        with engine.begin() as c:
            cfg.attributes["connection"] = c
            command.downgrade(cfg, "0001_baseline")

    with engine.begin() as c:
        c.execute(sa.text("DELETE FROM uploaded_images"))
    with engine.begin() as c:
        cfg.attributes["connection"] = c
        command.downgrade(cfg, "0001_baseline")
    assert "storage_key" not in _schema(engine)["uploaded_images"]
    assert not _nullable(engine, "uploaded_images", "image_data")
