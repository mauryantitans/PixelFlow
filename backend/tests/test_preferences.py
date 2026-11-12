"""Appearance preferences saved to the account."""

from app.models.db_models import User
from app.utils.auth import create_access_token, get_password_hash


def _user(db):
    u = User(
        email="prefs@example.com", username="prefs", hashed_password=get_password_hash("Passw0rd!x")
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


def test_preferences_are_saved_and_merged(client, db):
    h = _user(db)
    assert client.get("/api/auth/me", headers=h).json()["preferences"] is None
    r = client.put(
        "/api/auth/me/preferences", json={"ui_theme": "verdant", "mode": "dark"}, headers=h
    )
    assert r.status_code == 200 and r.json()["preferences"] == {
        "ui_theme": "verdant",
        "mode": "dark",
    }
    # Sending one key keeps the other.
    r = client.put("/api/auth/me/preferences", json={"mode": "light"}, headers=h)
    assert r.json()["preferences"] == {"ui_theme": "verdant", "mode": "light"}
    assert client.get("/api/auth/me", headers=h).json()["preferences"]["mode"] == "light"


def test_preferences_are_validated_and_need_sign_in(client, db):
    h = _user(db)
    assert (
        client.put("/api/auth/me/preferences", json={"mode": "sepia"}, headers=h).status_code == 422
    )
    assert (
        client.put("/api/auth/me/preferences", json={"ui_theme": "<script>"}, headers=h).status_code
        == 422
    )
    client.cookies.clear()
    assert client.put("/api/auth/me/preferences", json={"mode": "dark"}).status_code in (401, 403)
