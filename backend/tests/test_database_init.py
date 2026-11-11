"""init_db retries transient connection errors and fails with a clear message."""

import logging

import pytest
from sqlalchemy.exc import OperationalError

from app.core import database


def _dns_error():
    return OperationalError(
        "SELECT 1",
        {},
        Exception(
            'could not translate host name "dpg-gone-a" to address: Name or service not known'
        ),
    )


def test_init_db_retries_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def flaky_create_all(bind=None):
        calls["n"] += 1
        if calls["n"] < 3:
            raise _dns_error()

    monkeypatch.setattr(database.Base.metadata, "create_all", flaky_create_all)
    monkeypatch.setattr(database.time, "sleep", lambda s: None)

    database.init_db(retries=5, base_delay=0)
    assert calls["n"] == 3


def test_init_db_gives_up_with_actionable_message(monkeypatch, caplog):
    def always_fail(bind=None):
        raise _dns_error()

    monkeypatch.setattr(database.Base.metadata, "create_all", always_fail)
    monkeypatch.setattr(database.time, "sleep", lambda s: None)
    monkeypatch.setattr(
        database.settings,
        "DATABASE_URL",
        "postgresql://user:s3cret@dpg-gone-a/pixelflow",
        raising=False,
    )

    with caplog.at_level(logging.ERROR, logger="app.core.database"):
        with pytest.raises(OperationalError):
            database.init_db(retries=2, base_delay=0)

    text = caplog.text
    assert "after 2 attempts" in text
    assert "does not resolve" in text
    assert "s3cret" not in text  # password is never logged
    assert "dpg-gone-a" in text
