"""
Background batch processing.

POST /api/processing/jobs queues a ProcessingJob; one worker thread in the
backend process claims queued jobs one at a time and processes their images,
saving every step's output as a ProcessedImage (through app.storage, so S3
mode works too). The browser polls GET /api/processing/jobs/{id} and fetches
results as they finish, so a run keeps going if the tab reloads, and heavy
batches from several people are processed one after another instead of
competing for the CPU of a small instance.

No Redis needed: the job table is the queue. Claiming is an
``UPDATE ... WHERE status = 'queued'`` so a job can't be taken twice, even if
more than one backend instance ever runs. Jobs interrupted by a restart are
re-queued at startup. Finished jobs are deleted by the cleanup job after a day;
their processed images follow the normal processed-image retention.
"""

from __future__ import annotations

import io
import logging
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from PIL import Image
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.db_models import ProcessedImage, ProcessingJob, User

logger = logging.getLogger(__name__)

POLL_SECONDS = float(os.environ.get("JOB_POLL_SECONDS", "1"))
FINISHED_JOB_TTL = timedelta(days=1)
MAX_IMAGES_PER_JOB = 100

_stop = threading.Event()
_wake = threading.Event()
_thread: threading.Thread | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jpeg(image: Image.Image) -> bytes:
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def recover_interrupted_jobs(db: Session) -> int:
    """Jobs left 'running' by a restart go back to the queue (they restart from the first image)."""
    n = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.status == "running")
        .update(
            {ProcessingJob.status: "queued", ProcessingJob.completed: 0, ProcessingJob.results: []}
        )
    )
    db.commit()
    return n


def claim_next_job(db: Session) -> ProcessingJob | None:
    candidate = (
        db.query(ProcessingJob.id)
        .filter(ProcessingJob.status == "queued")
        .order_by(ProcessingJob.created_at, ProcessingJob.id)
        .first()
    )
    if candidate is None:
        return None
    claimed = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.id == candidate[0], ProcessingJob.status == "queued")
        .update(
            {ProcessingJob.status: "running", ProcessingJob.started_at: _now()},
            synchronize_session=False,
        )
    )
    db.commit()
    if claimed != 1:
        return None  # another worker took it
    return db.query(ProcessingJob).filter(ProcessingJob.id == candidate[0]).first()


def run_job(db: Session, job: ProcessingJob) -> None:
    """Process every image of a claimed job, committing progress after each one."""
    from ..api.routes.processing_db import load_image_from_db  # route module imports the world
    from ..storage.images import save_image_bytes
    from .image_processing import ImageProcessor

    user = db.query(User).filter(User.id == job.user_id).first() if job.user_id else None
    results: list[dict[str, Any]] = []
    for image_id in list(job.image_ids or []):
        db.refresh(job)
        if job.cancel_requested:
            job.status = "cancelled"
            break
        entry: dict[str, Any] = {"image_id": image_id}
        try:
            image = load_image_from_db(image_id, db, user)
            pr = ImageProcessor.apply_pipeline_with_timing_from_image(
                image, job.pipeline, source_key=f"{job.session_id}|{image_id}"
            )
            ids: list[str] = []
            last = len(pr.intermediate_images) - 1
            for idx, step_image in enumerate(pr.intermediate_images):
                row = ProcessedImage(
                    id=str(uuid.uuid4()),
                    session_id=job.session_id,
                    original_image_id=image_id,
                    pipeline_data=job.pipeline,
                    step_index=idx,
                    is_final=idx == last,
                )
                save_image_bytes(row, _jpeg(step_image), "image/jpeg")
                db.add(row)
                ids.append(row.id)
            entry.update(
                status="done",
                processed_ids=ids,
                total_time=pr.total_time,
                step_timings=[
                    {
                        "step_name": d["name"],
                        "duration": d["duration"],
                        "step_index": d["step_index"],
                    }
                    for d in pr.step_details
                ],
                step_errors=[e.to_dict() if e else None for e in pr.step_errors],
            )
        except HTTPException as e:  # not yours / deleted
            entry.update(status="skipped", error=str(e.detail))
        except Exception as e:  # keep going with the next image
            logger.error("Job %s: image %s failed: %s", job.id, image_id, e)
            entry.update(status="failed", error="Processing failed for this image.")
        results.append(entry)
        job.results = list(results)  # reassign so the JSON column is saved
        job.completed = len(results)
        db.commit()

    if job.status != "cancelled":
        job.status = (
            "done" if any(r["status"] == "done" for r in results) or not results else "failed"
        )
        if job.status == "failed":
            job.error = results[0].get("error") if results else "No images were processed."
    job.finished_at = _now()
    db.commit()


def run_pending_jobs_once(db: Session) -> int:
    """Process every queued job now (used by tests and by the worker loop)."""
    n = 0
    while (job := claim_next_job(db)) is not None:
        try:
            run_job(db, job)
        except Exception as e:
            logger.exception("Job %s crashed", job.id)
            db.rollback()
            job.status, job.error, job.finished_at = "failed", str(e), _now()
            db.commit()
        n += 1
    return n


def delete_finished_jobs(db: Session) -> int:
    cutoff = _now() - FINISHED_JOB_TTL
    n = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.status.in_(["done", "failed", "cancelled"]),
            ProcessingJob.finished_at < cutoff,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return n


def notify_new_job() -> None:
    """Wake the worker right away instead of at the next poll."""
    _wake.set()


def _loop() -> None:
    while not _stop.is_set():
        try:
            db = SessionLocal()
            try:
                run_pending_jobs_once(db)
            finally:
                db.close()
        except Exception:
            logger.exception("Job worker loop error")
        _wake.wait(POLL_SECONDS)
        _wake.clear()


def start_job_worker() -> None:
    global _thread
    if os.environ.get("JOB_WORKER_ENABLED", "true").lower() in ("0", "false", "no"):
        logger.info("Background job worker disabled (JOB_WORKER_ENABLED=false)")
        return
    db = SessionLocal()
    try:
        n = recover_interrupted_jobs(db)
        if n:
            logger.info("Re-queued %s job(s) interrupted by a restart", n)
    finally:
        db.close()
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="pixelflow-job-worker", daemon=True)
    _thread.start()
    logger.info("Background job worker started")


def stop_job_worker() -> None:
    _stop.set()
    _wake.set()
    if _thread is not None:
        _thread.join(timeout=5)
