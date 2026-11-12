"""
Background batch jobs (see app/utils/job_worker.py).

POST   /api/processing/jobs                     queue a batch → 202 {job}
GET    /api/processing/jobs/{id}                status, progress, per-image outcome
GET    /api/processing/jobs/{id}/results/{i}    image i's step outputs as data URLs
POST   /api/processing/jobs/{id}/cancel         stop after the current image

A job belongs to the account that started it, or, for guests, to the session:
guests pass ?session_id=… (job ids are random UUIDs as well).
"""

from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models import ProcessRequest
from ...models.db_models import ProcessedImage, ProcessingJob, User
from ...storage.images import read_image_bytes
from ...utils.auth import get_current_user_optional
from ...utils.job_worker import MAX_IMAGES_PER_JOB, notify_new_job

router = APIRouter()


def _job_view(job: ProcessingJob) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "total": job.total,
        "completed": job.completed,
        "results": [
            {
                k: r.get(k)
                for k in (
                    "image_id",
                    "status",
                    "error",
                    "total_time",
                    "step_timings",
                    "step_errors",
                )
            }
            for r in (job.results or [])
        ],
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def _get_job(db: Session, job_id: str, user: User | None, session_id: str | None) -> ProcessingJob:
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.user_id is not None:
        if user is None or user.id != job.user_id:
            raise HTTPException(status_code=404, detail="Job not found")
    elif session_id != job.session_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", status_code=202)
async def create_job(
    request: ProcessRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if not request.image_ids:
        raise HTTPException(status_code=400, detail="No images provided")
    if not request.pipeline:
        raise HTTPException(status_code=400, detail="No pipeline operations provided")
    if len(request.image_ids) > MAX_IMAGES_PER_JOB:
        raise HTTPException(
            status_code=400, detail=f"At most {MAX_IMAGES_PER_JOB} images per batch"
        )
    from .processing_db import _record_activity

    _record_activity(db, request.session_id, current_user)
    job = ProcessingJob(
        id=str(uuid.uuid4()),
        session_id=request.session_id,
        user_id=current_user.id if current_user else None,
        status="queued",
        pipeline=[step.model_dump() for step in request.pipeline],
        image_ids=list(request.image_ids),
        total=len(request.image_ids),
        completed=0,
        results=[],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    notify_new_job()
    return {"job": _job_view(job)}


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    session_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    return {"job": _job_view(_get_job(db, job_id, current_user, session_id))}


@router.get("/{job_id}/results/{index}")
async def get_job_result(
    job_id: str,
    index: int,
    session_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Image ``index``'s output after every step (the last one is the final image)."""
    job = _get_job(db, job_id, current_user, session_id)
    results = job.results or []
    if index < 0 or index >= len(results) or results[index].get("status") != "done":
        raise HTTPException(status_code=404, detail="That result isn't ready")
    ids = results[index].get("processed_ids") or []
    rows = {r.id: r for r in db.query(ProcessedImage).filter(ProcessedImage.id.in_(ids)).all()}
    if len(rows) != len(ids):
        raise HTTPException(
            status_code=410,
            detail="This result has expired (processed images are kept for a limited time)",
        )
    steps = [
        f"data:image/jpeg;base64,{base64.b64encode(read_image_bytes(rows[i])).decode()}"
        for i in ids
    ]
    return {
        "image_id": results[index]["image_id"],
        "steps": steps,
        "final": steps[-1] if steps else None,
    }


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    session_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    job = _get_job(db, job_id, current_user, session_id)
    if job.status == "queued":
        job.status = "cancelled"
    elif job.status == "running":
        job.cancel_requested = True  # the worker stops before the next image
    db.commit()
    db.refresh(job)
    return {"job": _job_view(job)}
