"""Share a saved pipeline by link: owner-only, public read, revocable, cleaned up on delete."""

from app.models.db_models import SharedPipeline, User
from app.utils.auth import create_access_token, get_password_hash

PIPE = {
    "name": "Vintage",
    "description": "warm",
    "pipeline_data": [{"name": "Sepia", "params": {}}],
}


def _user(db, n, admin=False):
    u = User(
        email=f"s{n}@example.com",
        username=f"sharer{n}",
        hashed_password=get_password_hash("Passw0rd!x"),
        is_admin=admin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u, {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


def test_owner_shares_and_anyone_can_open_the_link(client, db):
    _, h = _user(db, 1)
    pid = client.post("/api/pipelines/", json=PIPE, headers=h).json()["id"]
    assert client.get(f"/api/pipelines/{pid}/share", headers=h).json() == {"share": None}

    share = client.post(f"/api/pipelines/{pid}/share", headers=h).json()["share"]
    assert share["path"] == f"/p/{share['token']}" and len(share["token"]) >= 16
    # Creating again returns the same link.
    assert (
        client.post(f"/api/pipelines/{pid}/share", headers=h).json()["share"]["token"]
        == share["token"]
    )

    client.cookies.clear()
    r = client.get(f"/api/pipelines/shared/{share['token']}")  # no auth
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Vintage" and body["pipeline_data"][0]["name"] == "Sepia"
    assert body["author"] == "sharer1" and "s1@example.com" not in r.text  # no email leak
    assert client.get(f"/api/pipelines/shared/{share['token']}").json()["view_count"] == 2


def test_only_the_owner_can_share_or_unshare(client, db):
    _, owner = _user(db, 2)
    _, other = _user(db, 3)
    pid = client.post("/api/pipelines/", json=PIPE, headers=owner).json()["id"]
    assert client.post(f"/api/pipelines/{pid}/share", headers=other).status_code == 403
    assert client.delete(f"/api/pipelines/{pid}/share", headers=other).status_code == 403
    assert client.post("/api/pipelines/99999/share", headers=owner).status_code == 404


def test_turning_sharing_off_breaks_the_link(client, db):
    _, h = _user(db, 4)
    pid = client.post("/api/pipelines/", json=PIPE, headers=h).json()["id"]
    token = client.post(f"/api/pipelines/{pid}/share", headers=h).json()["share"]["token"]
    assert client.delete(f"/api/pipelines/{pid}/share", headers=h).status_code == 204
    assert client.get(f"/api/pipelines/shared/{token}").status_code == 404
    assert client.get("/api/pipelines/shared/not-a-token").status_code == 404


def test_deleting_the_pipeline_or_user_removes_the_link(client, db):
    _, h = _user(db, 5)
    pid = client.post("/api/pipelines/", json=PIPE, headers=h).json()["id"]
    client.post(f"/api/pipelines/{pid}/share", headers=h)
    assert client.delete(f"/api/pipelines/{pid}", headers=h).status_code == 204
    assert db.query(SharedPipeline).count() == 0

    # Admin "delete user" uses bulk deletes; links must go too.
    victim, vh = _user(db, 6)
    pid2 = client.post("/api/pipelines/", json=PIPE, headers=vh).json()["id"]
    client.post(f"/api/pipelines/{pid2}/share", headers=vh)
    admin, ah = _user(db, 7, admin=True)
    from app.utils import admin_pin

    client.post("/api/admin/pin/set", json={"pin": "2468"}, headers=ah)
    r = client.delete(f"/api/admin/database/users/{victim.id}?confirm=DELETE_USER", headers=ah)
    assert r.status_code == 200, r.text
    assert db.query(SharedPipeline).count() == 0
    admin_pin._failures.clear()
