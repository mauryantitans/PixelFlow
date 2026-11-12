"""Background batch jobs: queue, worker, progress, results, cancel, access, cleanup."""

import io
from datetime import datetime, timedelta, timezone

import numpy as np
from PIL import Image

from app.models.db_models import ProcessedImage, ProcessingJob, User
from app.utils import job_worker
from app.utils.auth import create_access_token, get_password_hash


def _png(color=(10, 120, 200)):
    buf = io.BytesIO()
    Image.new("RGB", (16, 12), color).save(buf, "PNG")
    return buf.getvalue()


def _upload(client, session, headers=None, color=(10, 120, 200)):
    r = client.post(
        "/api/images/upload",
        files={"file": ("a.png", _png(color), "image/png")},
        data={"session_id": session},
        headers=headers or {},
    )
    assert r.status_code == 200, r.text
    return r.json()["image"]["id"]


def _user(db, n):
    u = User(
        email=f"j{n}@example.com", username=f"j{n}", hashed_password=get_password_hash("Passw0rd!x")
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u, {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


PIPE = [{"name": "Invert", "params": {}}, {"name": "Grayscale", "params": {}}]


def test_guest_job_runs_and_returns_every_step(client, db):
    a = _upload(client, "g1")
    b = _upload(client, "g1", color=(200, 50, 50))
    r = client.post(
        "/api/processing/jobs", json={"image_ids": [a, b], "pipeline": PIPE, "session_id": "g1"}
    )
    assert r.status_code == 202
    job = r.json()["job"]
    assert job["status"] == "queued" and job["total"] == 2 and job["completed"] == 0

    assert job_worker.run_pending_jobs_once(db) == 1
    done = client.get(f"/api/processing/jobs/{job['id']}?session_id=g1").json()["job"]
    assert done["status"] == "done" and done["completed"] == 2
    assert [x["status"] for x in done["results"]] == ["done", "done"]
    assert len(done["results"][0]["step_timings"]) == 2

    res = client.get(f"/api/processing/jobs/{job['id']}/results/1?session_id=g1").json()
    assert (
        res["image_id"] == b
        and len(res["steps"]) == 2
        and res["final"].startswith("data:image/jpeg;base64,")
    )
    # Final image is grayscale(invert(red)): equal channels.
    import base64

    final = np.asarray(Image.open(io.BytesIO(base64.b64decode(res["final"].split(",")[1]))))
    assert abs(int(final[..., 0].mean()) - int(final[..., 2].mean())) <= 2
    assert db.query(ProcessedImage).filter(ProcessedImage.is_final.is_(True)).count() == 2


def test_disabled_steps_and_errors_are_reported_per_image(client, db):
    a = _upload(client, "g2")
    pipe = [
        {"name": "Invert", "params": {}, "enabled": False},
        {"name": "No Such Op", "params": {}},
    ]
    job = client.post(
        "/api/processing/jobs",
        json={"image_ids": [a, "missing-id"], "pipeline": pipe, "session_id": "g2"},
    ).json()["job"]
    job_worker.run_pending_jobs_once(db)
    out = client.get(f"/api/processing/jobs/{job['id']}?session_id=g2").json()["job"]
    first, second = out["results"]
    assert (
        first["status"] == "done"
        and first["step_errors"][0] is None
        and first["step_errors"][1]["kind"] == "unknown_operation"
    )
    assert second["status"] == "skipped" and "not found" in second["error"].lower()
    assert out["status"] == "done"


def test_cancel_before_and_during_a_run(client, db):
    a = _upload(client, "g3")
    job = client.post(
        "/api/processing/jobs", json={"image_ids": [a], "pipeline": PIPE, "session_id": "g3"}
    ).json()["job"]
    assert (
        client.post(f"/api/processing/jobs/{job['id']}/cancel?session_id=g3").json()["job"][
            "status"
        ]
        == "cancelled"
    )
    assert job_worker.run_pending_jobs_once(db) == 0  # nothing left to run

    job2 = client.post(
        "/api/processing/jobs", json={"image_ids": [a, a, a], "pipeline": PIPE, "session_id": "g3"}
    ).json()["job"]
    claimed = job_worker.claim_next_job(db)
    assert (
        claimed.id == job2["id"] and job_worker.claim_next_job(db) is None
    )  # can't be claimed twice
    client.post(f"/api/processing/jobs/{job2['id']}/cancel?session_id=g3")
    job_worker.run_job(db, claimed)
    out = client.get(f"/api/processing/jobs/{job2['id']}?session_id=g3").json()["job"]
    assert out["status"] == "cancelled" and out["completed"] < 3


def test_jobs_are_private(client, db):
    owner, oh = _user(db, 1)
    _, other = _user(db, 2)
    a = _upload(client, "u1", headers=oh)
    job = client.post(
        "/api/processing/jobs",
        json={"image_ids": [a], "pipeline": PIPE, "session_id": "u1"},
        headers=oh,
    ).json()["job"]
    assert client.get(f"/api/processing/jobs/{job['id']}", headers=oh).status_code == 200
    assert client.get(f"/api/processing/jobs/{job['id']}", headers=other).status_code == 404
    client.cookies.clear()
    assert (
        client.get(f"/api/processing/jobs/{job['id']}?session_id=u1").status_code == 404
    )  # signed out
    g = _upload(client, "g4")
    gj = client.post(
        "/api/processing/jobs", json={"image_ids": [g], "pipeline": PIPE, "session_id": "g4"}
    ).json()["job"]
    assert client.get(f"/api/processing/jobs/{gj['id']}?session_id=wrong").status_code == 404


def test_a_job_can_only_use_your_own_images(client, db):
    _, oh = _user(db, 3)
    _, other = _user(db, 4)
    a = _upload(client, "u3", headers=oh)
    job = client.post(
        "/api/processing/jobs",
        json={"image_ids": [a], "pipeline": PIPE, "session_id": "u4"},
        headers=other,
    ).json()["job"]
    job_worker.run_pending_jobs_once(db)
    out = client.get(f"/api/processing/jobs/{job['id']}", headers=other).json()["job"]
    assert out["results"][0]["status"] == "skipped" and out["status"] == "failed"


def test_limits_and_validation(client, db):
    assert (
        client.post(
            "/api/processing/jobs", json={"image_ids": [], "pipeline": PIPE, "session_id": "g5"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/processing/jobs", json={"image_ids": ["x"], "pipeline": [], "session_id": "g5"}
        ).status_code
        == 400
    )
    many = ["x"] * (job_worker.MAX_IMAGES_PER_JOB + 1)
    assert (
        client.post(
            "/api/processing/jobs", json={"image_ids": many, "pipeline": PIPE, "session_id": "g5"}
        ).status_code
        == 400
    )


def test_restart_requeues_and_old_jobs_are_cleaned_up(client, db):
    a = _upload(client, "g6")
    job = client.post(
        "/api/processing/jobs", json={"image_ids": [a], "pipeline": PIPE, "session_id": "g6"}
    ).json()["job"]
    claimed = job_worker.claim_next_job(db)  # then the server "restarts"
    assert claimed is not None
    assert job_worker.recover_interrupted_jobs(db) == 1
    assert job_worker.run_pending_jobs_once(db) == 1

    row = db.query(ProcessingJob).filter(ProcessingJob.id == job["id"]).first()
    row.finished_at = datetime.now(timezone.utc) - timedelta(days=2)
    db.commit()
    assert job_worker.delete_finished_jobs(db) == 1


def test_deleting_the_account_removes_its_jobs(client, db):
    u, h = _user(db, 5)
    a = _upload(client, "u5", headers=h)
    client.post(
        "/api/processing/jobs",
        json={"image_ids": [a], "pipeline": PIPE, "session_id": "u5"},
        headers=h,
    )
    assert client.delete("/api/auth/me", headers=h).status_code == 204
    assert db.query(ProcessingJob).count() == 0
