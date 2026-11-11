"""The connection indicator polls /api/health: it must be cheap, uncached and
never rate limited (every visitor behind Render's proxy shares one IP)."""


def test_health_is_not_cached(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
    assert r.headers.get("cache-control") == "no-store"


def test_health_is_exempt_from_rate_limiting(client):
    # Default limit is 100 requests/min per client+path; go well past it.
    codes = {client.get("/api/health").status_code for _ in range(150)}
    assert codes == {200}
