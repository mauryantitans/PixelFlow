"""Saved-pipeline limits and URL handling."""

from app.models.db_models import User
from app.utils.auth import create_access_token, get_password_hash


def _user(db, n, admin=False):
    u = User(
        email=f"p{n}@example.com",
        username=f"p{n}",
        hashed_password=get_password_hash("Passw0rd!x"),
        is_admin=admin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


PIPE = {"name": "p", "pipeline_data": [{"name": "Grayscale", "params": {}}]}


def test_duplicate_respects_the_free_pipeline_limit(client, db):
    h = _user(db, 1)
    ids = [
        client.post("/api/pipelines/", json=PIPE, headers=h).json()["id"] for _ in range(3)
    ]  # default limit 3
    assert client.post("/api/pipelines/", json=PIPE, headers=h).status_code == 403
    r = client.post(f"/api/pipelines/{ids[0]}/duplicate?new_name=copy", headers=h)
    assert r.status_code == 403  # used to succeed and exceed the limit
    assert len(client.get("/api/pipelines/", headers=h).json()) == 3


def test_pipelines_without_trailing_slash_are_not_redirected(client, db):
    h = _user(db, 2)
    r = client.post("/api/pipelines", json=PIPE, headers=h, follow_redirects=False)
    assert r.status_code == 201
    r = client.get("/api/pipelines", headers=h, follow_redirects=False)
    assert r.status_code == 200 and len(r.json()) == 1
