"""Browser error reports: logged, size-capped, throttled, CSRF-exempt."""

import logging

from app.api.routes import client_errors


def test_reports_are_logged(client, caplog):
    client_errors._recent.clear()
    with caplog.at_level(logging.WARNING, logger="pixelflow.client"):
        r = client.post(
            "/api/client-errors",
            json={"kind": "error", "message": "boom", "stack": "at x", "path": "/app"},
        )
    assert r.status_code == 204
    assert "boom" in caplog.text and "/app" in caplog.text


def test_reports_are_capped_and_throttled(client, caplog):
    client_errors._recent.clear()
    assert client.post("/api/client-errors", json={"message": "x" * 5000}).status_code == 422
    for _ in range(client_errors.MAX_PER_MINUTE):
        client.post("/api/client-errors", json={"message": "again"})
    with caplog.at_level(logging.WARNING, logger="pixelflow.client"):
        r = client.post("/api/client-errors", json={"message": "dropped"})
    assert r.status_code == 204 and "dropped" not in caplog.text


def test_monitoring_is_off_without_a_dsn(monkeypatch):
    from app.utils import monitoring

    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert monitoring.init_monitoring() is False
