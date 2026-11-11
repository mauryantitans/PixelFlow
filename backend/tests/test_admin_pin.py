"""The admin PIN is enforced by the server, can't be overwritten without the
current PIN, and wrong guesses are throttled."""

import pytest

from app.models.db_models import User
from app.utils import admin_pin
from app.utils.auth import create_access_token, get_password_hash


@pytest.fixture()
def admin(db):
    u = User(
        email="pin.admin@example.com",
        username="pinadmin",
        hashed_password=get_password_hash("Passw0rd!x"),
        is_admin=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    admin_pin._failures.clear()
    return u


def _h(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def test_user_data_needs_the_pin(client, admin):
    r = client.get("/api/admin/database/users", headers=_h(admin))
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "pin_required"
    # The overview counts stay visible; the user-data variant needs the PIN.
    assert client.get("/api/admin/database/overview", headers=_h(admin)).status_code == 200
    assert (
        client.get(
            "/api/admin/database/overview?include_user_data=true", headers=_h(admin)
        ).status_code
        == 403
    )


def test_setting_and_verifying_the_pin_unlocks_user_data(client, admin):
    assert (
        client.post("/api/admin/pin/set", json={"pin": "2468"}, headers=_h(admin)).status_code
        == 200
    )
    # Setting the PIN also grants access (cookie scoped to /api/admin).
    assert client.get("/api/admin/database/users", headers=_h(admin)).status_code == 200

    client.cookies.clear()
    assert client.get("/api/admin/database/users", headers=_h(admin)).status_code == 403
    assert (
        client.post("/api/admin/pin/verify", json={"pin": "2468"}, headers=_h(admin)).status_code
        == 200
    )
    assert client.get("/api/admin/database/users", headers=_h(admin)).status_code == 200
    assert client.get("/api/admin/database/sessions", headers=_h(admin)).status_code == 200


def test_pin_cookie_is_bound_to_the_admin(client, db, admin):
    other = User(
        email="pin.other@example.com", username="pinother", hashed_password="x", is_admin=True
    )
    db.add(other)
    db.commit()
    client.post("/api/admin/pin/set", json={"pin": "2468"}, headers=_h(admin))
    # Same browser cookie, different admin token -> not accepted.
    assert client.get("/api/admin/database/users", headers=_h(other)).status_code == 403


def test_changing_the_pin_requires_the_current_one(client, admin):
    client.post("/api/admin/pin/set", json={"pin": "2468"}, headers=_h(admin))
    client.cookies.clear()
    assert (
        client.post("/api/admin/pin/set", json={"pin": "1111"}, headers=_h(admin)).status_code
        == 401
    )
    r = client.post(
        "/api/admin/pin/set", json={"pin": "1111", "current_pin": "2468"}, headers=_h(admin)
    )
    assert r.status_code == 200
    assert (
        client.post("/api/admin/pin/verify", json={"pin": "1111"}, headers=_h(admin)).status_code
        == 200
    )


def test_wrong_pins_are_throttled(client, admin):
    client.post("/api/admin/pin/set", json={"pin": "2468"}, headers=_h(admin))
    for _ in range(admin_pin.MAX_PIN_FAILURES):
        assert (
            client.post(
                "/api/admin/pin/verify", json={"pin": "0000"}, headers=_h(admin)
            ).status_code
            == 401
        )
    # Locked out, even with the right PIN.
    r = client.post("/api/admin/pin/verify", json={"pin": "2468"}, headers=_h(admin))
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_pin_must_be_digits(client, admin):
    assert (
        client.post("/api/admin/pin/set", json={"pin": "abcd"}, headers=_h(admin)).status_code
        == 422
    )
