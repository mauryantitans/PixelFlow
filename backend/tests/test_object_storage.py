"""Optional object storage (STORAGE_BACKEND=s3) for image bytes.

S3 is simulated in-process with moto; the store is injected through
app.storage.set_image_store. Database mode (the default) is covered by the rest
of the suite plus a check here that rows keep their bytes.
"""

import asyncio
import base64
import io
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import pytest
from moto import mock_aws
from PIL import Image

from app.api.routes import admin as admin_routes
from app.core.config import _normalize_prefix, storage_config_errors
from app.models.db_models import ProcessedImage, UploadedImage, User
from app.models.db_models import Session as DBSession
from app.storage import DatabaseStore, StorageError, set_image_store
from app.storage.images import delete_image_objects, read_image_bytes, save_image_bytes
from app.storage.s3 import S3Store
from app.utils.auth import get_password_hash
from app.utils.cleanup_service import CleanupService
from app.utils.session_db import create_or_update_session

BUCKET = "pixelflow-test"
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _reset_store():
    yield
    set_image_store(None)  # back to the store described by settings (database)


@pytest.fixture()
def s3(monkeypatch):
    """A moto S3 bucket wired in as the image store; yields a boto3 client to inspect it."""
    for name, value in {
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_DEFAULT_REGION": "us-east-1",
    }.items():
        monkeypatch.setenv(name, value)
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        set_image_store(S3Store(BUCKET, region="us-east-1"))
        yield client


def _objects(client) -> list[str]:
    return sorted(o["Key"] for o in client.list_objects_v2(Bucket=BUCKET).get("Contents", []))


def _object_bytes(client, key: str) -> bytes:
    return client.get_object(Bucket=BUCKET, Key=key)["Body"].read()


def _png(size=(16, 12), color=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, session_id: str, name: str = "a.png") -> str:
    r = client.post(
        "/api/images/upload",
        files={"file": (name, _png(), "image/png")},
        data={"session_id": session_id},
    )
    assert r.status_code == 200, r.text
    return r.json()["image"]["id"]


def _row(db, image_id: str) -> UploadedImage:
    db.expire_all()
    return db.query(UploadedImage).filter_by(id=image_id).one()


def _add_image(db, image_id, session_id, *, user_id=None, uploaded_at=None, data=None):
    """An UploadedImage written through the storage helpers (or, with ``data``, an old DB row)."""
    row = UploadedImage(
        id=image_id,
        session_id=session_id,
        user_id=user_id,
        filename=f"{image_id}.png",
        thumbnail_data=b"thumb",
        width=16,
        height=12,
        format="PNG",
        size_bytes=10,
        mime_type="image/png",
    )
    if data is not None:
        row.image_data = data  # how rows looked before object storage
    else:
        save_image_bytes(row, _png(), "image/png")
    if uploaded_at is not None:
        row.uploaded_at = uploaded_at
    db.add(row)
    db.commit()
    return row


def _add_processed(db, processed_id, original_id, *, processed_at=None):
    row = ProcessedImage(
        id=processed_id,
        session_id="n/a",
        original_image_id=original_id,
        pipeline_data=[],
        is_final=True,
    )
    save_image_bytes(row, _png(), "image/png")
    if processed_at is not None:
        row.processed_at = processed_at
    db.add(row)
    db.commit()
    return row


def _admin(db) -> User:
    u = User(
        email="store.admin@example.com",
        username="storeadmin",
        hashed_password=get_password_hash("Passw0rd!x"),
        is_admin=True,
    )
    db.add(u)
    db.commit()
    return u


# --- writes ---------------------------------------------------------------------


def test_database_mode_keeps_bytes_in_the_row(client, db):
    image_id = _upload(client, "db-mode")
    row = _row(db, image_id)
    assert row.storage_key is None
    assert row.image_data and Image.open(io.BytesIO(row.image_data)).size == (16, 12)


def test_upload_puts_bytes_in_the_bucket_not_the_database(client, db, s3):
    image_id = _upload(client, "s3-up")
    row = _row(db, image_id)
    assert row.image_data is None
    assert row.storage_key == f"pixelflow/uploads/{image_id}.jpg"  # opaque RGB -> JPEG
    assert row.thumbnail_data  # thumbnails stay in the database
    assert _objects(s3) == [row.storage_key]
    stored = _object_bytes(s3, row.storage_key)
    assert Image.open(io.BytesIO(stored)).size == (16, 12)
    head = s3.head_object(Bucket=BUCKET, Key=row.storage_key)
    assert head["ContentType"] == "image/jpeg"
    assert row.size_bytes == len(stored)  # quotas keep using size_bytes


def test_upload_multiple_puts_every_image_in_the_bucket(client, db, s3):
    files = [("files", (f"{n}.png", _png(), "image/png")) for n in ("a", "b")]
    r = client.post("/api/images/upload-multiple", files=files, data={"session_id": "s3-multi"})
    assert r.status_code == 200 and r.json()["uploaded_count"] == 2
    db.expire_all()
    rows = db.query(UploadedImage).filter_by(session_id="s3-multi").all()
    assert all(r.image_data is None for r in rows)
    assert _objects(s3) == sorted(r.storage_key for r in rows)


def test_a_failing_bucket_rejects_the_upload_cleanly(client, db, s3):
    class BrokenPut(S3Store):
        def put(self, key, data, content_type):
            raise StorageError("bucket unreachable")

    set_image_store(BrokenPut(BUCKET, region="us-east-1"))
    r = client.post(
        "/api/images/upload",
        files={"file": ("a.png", _png(), "image/png")},
        data={"session_id": "s3-broken"},
    )
    assert r.status_code == 503
    assert db.query(UploadedImage).filter_by(session_id="s3-broken").count() == 0


# --- reads ----------------------------------------------------------------------


def test_get_image_serves_the_object_and_the_db_thumbnail(client, db, s3):
    image_id = _upload(client, "s3-get")
    row = _row(db, image_id)
    r = client.get(f"/api/images/image/{image_id}")
    assert r.status_code == 200
    assert r.content == _object_bytes(s3, row.storage_key)
    assert r.headers["content-type"] == "image/jpeg"
    r = client.get(f"/api/images/image/{image_id}?thumbnail=true")
    assert r.content == row.thumbnail_data


def test_session_listing_with_data_reads_the_object(client, db, s3):
    image_id = _upload(client, "s3-list")
    r = client.get("/api/images/session/s3-list/images?include_data=true")
    assert r.status_code == 200
    data_url = r.json()["images"][0]["image"]
    stored = _object_bytes(s3, _row(db, image_id).storage_key)
    assert base64.b64decode(data_url.split(",", 1)[1]) == stored


def test_live_and_batch_processing_read_from_the_bucket(client, db, s3):
    image_id = _upload(client, "s3-proc")
    body = {"image_id": image_id, "pipeline": [], "session_id": "s3-proc"}
    assert client.post("/api/processing/process-live", json=body).status_code == 200
    body["pipeline"] = [{"name": "Grayscale", "params": {}}]
    r = client.post("/api/processing/process-live", json=body)
    assert r.status_code == 200 and r.json()["results"]
    batch = {
        "image_ids": [image_id],
        "pipeline": [{"name": "Grayscale", "params": {}}],
        "session_id": "s3-proc",
    }
    r = client.post("/api/processing/process", json=batch)
    assert r.status_code == 200 and len(r.json()["processed_images"]) == 1


def test_old_database_rows_stay_readable_in_s3_mode(client, db, s3):
    create_or_update_session(db, "s3-mixed")
    old_bytes = _png(color=(1, 2, 3))
    _add_image(db, "old-db-row", "s3-mixed", data=old_bytes)
    _upload(client, "s3-mixed")  # a new row in the bucket, same session

    assert client.get("/api/images/image/old-db-row").content == old_bytes
    body = {"image_id": "old-db-row", "pipeline": [], "session_id": "s3-mixed"}
    assert client.post("/api/processing/process-live", json=body).status_code == 200
    r = client.get("/api/images/session/s3-mixed/images?include_data=true")
    assert r.status_code == 200 and len(r.json()["images"]) == 2
    # Deleting an old row touches nothing in the bucket.
    assert client.delete("/api/images/image/old-db-row").status_code == 200
    assert len(_objects(s3)) == 1


def test_bucket_rows_fail_clearly_after_switching_back_to_the_database(client, db, s3):
    image_id = _upload(client, "s3-switch")
    set_image_store(DatabaseStore())
    r = client.get(f"/api/images/image/{image_id}")
    assert r.status_code == 503
    assert "STORAGE_BACKEND" in r.json()["detail"]
    body = {"image_id": image_id, "pipeline": [], "session_id": "s3-switch"}
    r = client.post("/api/processing/process-live", json=body)
    assert r.status_code == 503 and "STORAGE_BACKEND" in r.json()["detail"]


def test_a_missing_object_is_a_404(client, db, s3):
    image_id = _upload(client, "s3-missing")
    s3.delete_object(Bucket=BUCKET, Key=_row(db, image_id).storage_key)
    assert client.get(f"/api/images/image/{image_id}").status_code == 404


# --- deletes --------------------------------------------------------------------


def test_deleting_an_image_removes_its_objects(client, db, s3):
    image_id = _upload(client, "s3-del")
    _add_processed(db, "proc-of-del", image_id)
    assert len(_objects(s3)) == 2
    assert client.delete(f"/api/images/image/{image_id}").status_code == 200
    assert _objects(s3) == []  # the processed version went with it (cascade)


def test_cleanup_session_removes_its_objects(client, db, s3):
    _upload(client, "s3-clean")
    _upload(client, "s3-clean", "b.png")
    keep = _upload(client, "s3-keep")
    r = client.post("/api/images/cleanup-session", json={"session_id": "s3-clean"})
    assert r.status_code == 200 and r.json()["deleted_images"] == 2
    assert _objects(s3) == [_row(db, keep).storage_key]


def test_retention_cleanup_removes_objects(db, s3):
    now = datetime.now(timezone.utc)
    create_or_update_session(db, "s3-retain")
    old = _add_image(db, "old-upload", "s3-retain", uploaded_at=now - timedelta(days=400))
    fresh = _add_image(db, "fresh-upload", "s3-retain")
    _add_processed(db, "old-proc", "fresh-upload", processed_at=now - timedelta(days=400))
    old_key = old.storage_key

    assert CleanupService.cleanup_old_uploads(db)["guest_deleted"] == 1
    assert CleanupService.cleanup_old_processed_images(db)["deleted"] == 1
    assert _objects(s3) == [fresh.storage_key]
    assert old_key not in _objects(s3)


def test_expired_session_cleanup_removes_objects(db, s3):
    session = create_or_update_session(db, "s3-expired")
    _add_image(db, "exp-img", "s3-expired")
    _add_processed(db, "exp-proc", "exp-img")
    session.expires_at = datetime.now(timezone.utc) - timedelta(days=3)
    db.commit()
    result = CleanupService.run_full_cleanup(db, force=True)
    assert result["sessions"]["sessions_deleted"] == 1
    assert _objects(s3) == []


def test_admin_deletes_remove_objects(db, s3):
    admin = _admin(db)
    owner = User(email="owner@example.com", username="owner", hashed_password="x")
    db.add(owner)
    db.commit()
    create_or_update_session(db, "s3-admin")
    _add_image(db, "adm-1", "s3-admin")
    _add_processed(db, "adm-1-proc", "adm-1")
    _add_image(db, "adm-user", "s3-admin", user_id=owner.id)
    _add_image(db, "adm-rest", "s3-admin")
    _add_processed(db, "adm-rest-proc", "adm-rest")

    # one image (and its processed versions, bulk-deleted)
    asyncio.run(admin_routes.delete_image(image_id="adm-1", current_user=admin, db=db))
    assert not [k for k in _objects(s3) if "adm-1" in k]

    # a user and their images (bulk-deleted)
    asyncio.run(
        admin_routes.delete_user(user_id=owner.id, confirm="DELETE_USER", current_user=admin, db=db)
    )
    assert not [k for k in _objects(s3) if "adm-user" in k]

    # everything (bulk-deleted)
    asyncio.run(
        admin_routes.delete_all_images(confirm="DELETE_ALL_IMAGES", current_user=admin, db=db)
    )
    assert _objects(s3) == []


def test_a_failing_bucket_never_blocks_the_database_delete(client, db, s3, caplog):
    class BrokenDelete(S3Store):
        def delete_many(self, keys):
            raise StorageError("bucket unreachable")

    image_id = _upload(client, "s3-faildel")
    set_image_store(BrokenDelete(BUCKET, region="us-east-1"))
    assert client.delete(f"/api/images/image/{image_id}").status_code == 200
    assert db.query(UploadedImage).filter_by(id=image_id).first() is None
    assert "Could not delete 1 image object" in caplog.text


def test_objects_are_kept_when_the_delete_is_rolled_back(db, s3):
    create_or_update_session(db, "s3-rollback")
    row = _add_image(db, "rb-img", "s3-rollback")
    db.delete(row)
    db.flush()
    db.rollback()
    db.commit()
    assert _objects(s3) == [row.storage_key]
    assert db.query(UploadedImage).filter_by(id="rb-img").one()


def test_delete_image_objects_without_a_session_is_immediate_and_skips_db_rows(db, s3):
    create_or_update_session(db, "s3-direct")
    in_bucket = _add_image(db, "direct-1", "s3-direct")
    in_db = _add_image(db, "direct-2", "s3-direct", data=b"bytes")
    assert delete_image_objects([in_bucket, in_db]) == 1
    assert _objects(s3) == []
    assert read_image_bytes(in_db) == b"bytes"


def test_s3_store_batches_deletes_and_reports_missing_objects(s3):
    store = S3Store(BUCKET, region="us-east-1")
    for n in range(3):
        store.put(f"k/{n}", b"x", "image/png")
    store.delete_many([f"k/{n}" for n in range(3)] + ["k/never-existed"])
    assert _objects(s3) == []
    with pytest.raises(StorageError):
        store.get("k/0")


# --- configuration --------------------------------------------------------------


def test_storage_config_validation():
    assert storage_config_errors("database") == []
    assert storage_config_errors("s3", "bucket", "id", "secret", "https://x.r2.dev") == []
    assert storage_config_errors("s3", "bucket") == []  # AWS default credential chain
    assert storage_config_errors("disk") and "STORAGE_BACKEND" in storage_config_errors("disk")[0]
    assert any("S3_BUCKET" in e for e in storage_config_errors("s3"))
    assert any("S3_SECRET_ACCESS_KEY" in e for e in storage_config_errors("s3", "bucket", "id", ""))
    assert any(
        "S3_ENDPOINT_URL" in e
        for e in storage_config_errors("s3", "bucket", "id", "s", "r2.example")
    )


@pytest.mark.parametrize(
    "raw,expected",
    [("pixelflow/", "pixelflow/"), ("/a/b", "a/b/"), ("", ""), ("  x//", "x/")],
)
def test_prefix_is_normalized(raw, expected):
    assert _normalize_prefix(raw) == expected


def test_incomplete_s3_settings_stop_startup():
    env = {k: v for k, v in os.environ.items() if not k.startswith(("S3_", "STORAGE_"))}
    env.update(DEBUG="True", USE_SQLITE="True", SECRET_KEY="x", STORAGE_BACKEND="s3")
    # Set (empty) so a developer's backend/.env can't fill them in (dotenv never overrides).
    env.update(S3_BUCKET="", S3_ACCESS_KEY_ID="", S3_SECRET_ACCESS_KEY="", S3_ENDPOINT_URL="")
    proc = subprocess.run(
        [sys.executable, "-c", "import app.core.config"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 1
    assert "S3_BUCKET is required" in proc.stderr


def test_database_store_refuses_object_reads():
    with pytest.raises(StorageError, match="STORAGE_BACKEND"):
        DatabaseStore().get("pixelflow/uploads/x.png")


def test_session_rows_cascade_is_covered(db, s3):
    """Deleting a Session row directly (as session_db/cleanup do) removes its objects."""
    create_or_update_session(db, "s3-cascade")
    _add_image(db, "casc-img", "s3-cascade")
    db.delete(db.query(DBSession).filter_by(id="s3-cascade").one())
    db.commit()
    assert _objects(s3) == []
