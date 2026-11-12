"""Admins reach other users' images only through the PIN-protected admin endpoints."""

import io

from PIL import Image

from app.models.db_models import User
from app.utils.auth import create_access_token, get_password_hash


def _user(db, n, admin=False):
    u = User(
        email=f"ia{n}@example.com",
        username=f"ia{n}",
        hashed_password=get_password_hash("Passw0rd!x"),
        is_admin=admin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


def test_admin_cannot_read_or_process_another_users_image_directly(client, db):
    owner = _user(db, 1)
    admin = _user(db, 2, admin=True)
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (1, 2, 3)).save(buf, "PNG")
    image_id = client.post(
        "/api/images/upload",
        files={"file": ("a.png", buf.getvalue(), "image/png")},
        data={"session_id": "ia-s"},
        headers=owner,
    ).json()["image"]["id"]

    assert client.get(f"/api/images/image/{image_id}", headers=owner).status_code == 200
    assert client.get(f"/api/images/image/{image_id}", headers=admin).status_code == 403
    assert client.get("/api/images/session/ia-s/images", headers=admin).status_code == 403
    live = {
        "image_id": image_id,
        "session_id": "ia-s",
        "pipeline": [{"name": "Invert", "params": {}}],
    }
    assert client.post("/api/processing/process-live", json=live, headers=admin).status_code == 403
