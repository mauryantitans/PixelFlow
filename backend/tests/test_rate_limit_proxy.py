"""Rate limiting uses the real client IP behind trusted proxies."""

from types import SimpleNamespace

from app.core.security_config import RateLimiting
from app.middleware.rate_limit import client_ip_for


def _req(peer, xff=None):
    headers = {"x-forwarded-for": xff} if xff else {}
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers)


def test_default_uses_the_tcp_peer(monkeypatch):
    monkeypatch.setattr(RateLimiting, "TRUSTED_PROXY_HOPS", 0)
    assert client_ip_for(_req("10.0.0.1", "1.2.3.4")) == "10.0.0.1"


def test_behind_render_and_vercel(monkeypatch):
    monkeypatch.setattr(RateLimiting, "TRUSTED_PROXY_HOPS", 2)
    # client-spoofed entry, real client (written by Vercel), Vercel (written by Render)
    assert client_ip_for(_req("10.0.0.1", "6.6.6.6, 203.0.113.7, 76.76.21.9")) == "203.0.113.7"


def test_missing_header_falls_back_to_the_peer(monkeypatch):
    monkeypatch.setattr(RateLimiting, "TRUSTED_PROXY_HOPS", 1)
    assert client_ip_for(_req("10.0.0.1")) == "10.0.0.1"
