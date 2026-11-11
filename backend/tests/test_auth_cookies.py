"""HTTP-level tests for httpOnly-cookie auth + CSRF double-submit protection.

Uses the TestClient fixture (in-memory SQLite, get_db overridden). The client
keeps a cookie jar across requests, so logging in lets subsequent requests
authenticate via the cookie exactly as a browser would.
"""

USER = {
    "email": "cookie.user@example.com",
    "username": "cookieuser",
    "full_name": "Cookie User",
    "password": "StrongPassw0rd!",
}


def _register_and_login(client):
    r = client.post("/api/auth/register", json=USER)
    assert r.status_code == 201, r.text
    user_id = r.json()["id"]
    r = client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert r.status_code == 200, r.text
    return user_id, r


def test_login_sets_cookies_and_returns_user_not_tokens(client):
    _, r = _register_and_login(client)
    body = r.json()
    # The user record comes back; tokens must NOT be in the body.
    assert body["email"] == USER["email"]
    assert "access_token" not in body
    assert "refresh_token" not in body
    # All three auth cookies are set.
    assert r.cookies.get("pf_access")
    assert r.cookies.get("pf_refresh")
    assert r.cookies.get("pf_csrf")


def test_me_authenticates_via_cookie(client):
    _register_and_login(client)
    r = client.get("/api/auth/me")  # cookie sent automatically by the jar
    assert r.status_code == 200, r.text
    assert r.json()["email"] == USER["email"]


def test_me_unauthenticated_without_cookie(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_csrf_blocks_cookie_write_without_header(client):
    _register_and_login(client)
    # Cookie-authenticated mutating request with no X-CSRF-Token must be rejected.
    r = client.post("/api/auth/logout")
    assert r.status_code == 403
    assert "CSRF" in r.json().get("error", "")


def test_refresh_rotates_with_csrf_header(client):
    _register_and_login(client)
    csrf = client.cookies.get("pf_csrf")
    r = client.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True
    # New cookies issued; /me still works afterwards.
    assert r.cookies.get("pf_access")
    assert client.get("/api/auth/me").status_code == 200


def test_logout_clears_cookies_with_csrf(client):
    _register_and_login(client)
    csrf = client.cookies.get("pf_csrf")
    r = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200, r.text
    # The access cookie is expired/cleared by the response.
    set_cookie = r.headers.get("set-cookie", "")
    assert "pf_access=" in set_cookie


def test_bearer_token_still_works_for_api_clients(client):
    """Non-browser clients can still authenticate with an Authorization header."""
    from app.utils.auth import create_access_token

    user_id, _ = _register_and_login(client)
    # Drop cookies so only the bearer header is in play.
    client.cookies.clear()
    token = create_access_token(data={"sub": str(user_id)})
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == USER["email"]


def test_csrf_rejection_still_carries_cors_headers(client):
    """A 403 from the CSRF middleware must include CORS headers; otherwise the
    browser hides it and the frontend reports a generic network error."""
    _register_and_login(client)
    r = client.post("/api/auth/logout", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 403
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert r.headers.get("access-control-allow-credentials") == "true"
