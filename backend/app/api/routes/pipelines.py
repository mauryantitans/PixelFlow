from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from ...core.database import get_db
from ...core.business_rules import UserLimits
import secrets
from datetime import datetime, timezone

from ...models.db_models import User, SavedPipeline, SharedPipeline
from ...models.schemas import (
    PipelineCreate, PipelineUpdate, PipelineResponse
)
from ...utils.auth import get_current_user

router = APIRouter()

def _enforce_pipeline_limit(db: Session, user: User) -> None:
    """Free accounts may keep at most `free_user_max_pipelines` (admins: no limit).

    Used by both create and duplicate (duplicating used to skip the check).
    """
    if user.is_admin:
        return
    from ...utils.settings_manager import get_settings

    max_pipelines = get_settings(db).free_user_max_pipelines
    current_count = db.query(func.count(SavedPipeline.id)).filter(
        SavedPipeline.user_id == user.id
    ).scalar()
    if max_pipelines is not None and current_count >= max_pipelines:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Pipeline limit reached. Free users can save up to {max_pipelines} pipelines. Please delete an existing pipeline or upgrade your account."
        )


# ---- Share by link ---------------------------------------------------------
# Declared before "/{pipeline_id}" so "/shared/..." isn't parsed as an id.


def _share_payload(share: SharedPipeline) -> dict:
    return {"token": share.share_token, "path": f"/p/{share.share_token}", "view_count": share.view_count or 0}


@router.get("/shared/{token}")
async def get_shared_pipeline(token: str, db: Session = Depends(get_db)):
    """Public: a pipeline someone shared by link (no account needed)."""
    share = db.query(SharedPipeline).filter(SharedPipeline.share_token == token).first()
    now = datetime.now(timezone.utc)
    expires = share.expires_at if share else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not share or (expires is not None and expires < now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This share link doesn't exist or was turned off.")
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == share.pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This share link doesn't exist or was turned off.")
    share.view_count = (share.view_count or 0) + 1
    db.commit()
    author = pipeline.user.username if pipeline.user else None
    return {
        "name": pipeline.name,
        "description": pipeline.description,
        "pipeline_data": pipeline.pipeline_data,
        "author": author,
        "created_at": pipeline.created_at.isoformat() if pipeline.created_at else None,
        "view_count": share.view_count,
    }


def _owned_pipeline(db: Session, pipeline_id: int, user: User) -> SavedPipeline:
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline not found")
    if pipeline.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to share this pipeline")
    return pipeline


@router.get("/{pipeline_id}/share")
async def get_share_link(pipeline_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The pipeline's share link, or null if it isn't shared."""
    _owned_pipeline(db, pipeline_id, current_user)
    share = db.query(SharedPipeline).filter(SharedPipeline.pipeline_id == pipeline_id).first()
    return {"share": _share_payload(share) if share else None}


@router.post("/{pipeline_id}/share")
async def create_share_link(pipeline_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create (or return the existing) share link. Anyone with it can view and copy the pipeline."""
    pipeline = _owned_pipeline(db, pipeline_id, current_user)
    share = db.query(SharedPipeline).filter(SharedPipeline.pipeline_id == pipeline.id).first()
    if not share:
        share = SharedPipeline(pipeline_id=pipeline.id, share_token=secrets.token_urlsafe(12), view_count=0)
        db.add(share)
        db.commit()
        db.refresh(share)
    return {"share": _share_payload(share)}


@router.delete("/{pipeline_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share_link(pipeline_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Turn sharing off: the old link stops working."""
    _owned_pipeline(db, pipeline_id, current_user)
    db.query(SharedPipeline).filter(SharedPipeline.pipeline_id == pipeline_id).delete()
    db.commit()
    return None


# Both "/api/pipelines" and "/api/pipelines/" are served directly: a redirect
# between them would go through the Vercel/Render proxy as an http:// URL.
@router.post("", response_model=PipelineResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
@router.post("/", response_model=PipelineResponse, status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    pipeline: PipelineCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new saved pipeline"""
    _enforce_pipeline_limit(db, current_user)
    
    db_pipeline = SavedPipeline(
        user_id=current_user.id,
        name=pipeline.name,
        description=pipeline.description,
        pipeline_data=pipeline.pipeline_data,
        is_public=pipeline.is_public,
        category=pipeline.category,
        tags=pipeline.tags,
        thumbnail_data=pipeline.thumbnail_data
    )
    
    db.add(db_pipeline)
    db.commit()
    db.refresh(db_pipeline)
    
    return db_pipeline

@router.get("", response_model=List[PipelineResponse], include_in_schema=False)
@router.get("/", response_model=List[PipelineResponse])
async def get_user_pipelines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    """Get all pipelines for the current user"""
    query = db.query(SavedPipeline).filter(SavedPipeline.user_id == current_user.id)
    
    if category:
        query = query.filter(SavedPipeline.category == category)
    
    pipelines = query.offset(skip).limit(limit).all()
    return pipelines

@router.get("/public", response_model=List[PipelineResponse])
async def get_public_pipelines(
    db: Session = Depends(get_db),
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    """Get all public pipelines"""
    query = db.query(SavedPipeline).filter(SavedPipeline.is_public == True)
    
    if category:
        query = query.filter(SavedPipeline.category == category)
    
    pipelines = query.order_by(SavedPipeline.usage_count.desc()).offset(skip).limit(limit).all()
    return pipelines

@router.get("/{pipeline_id}", response_model=PipelineResponse)
async def get_pipeline(
    pipeline_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific pipeline"""
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    
    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found"
        )
    
    # Check if user has access to this pipeline
    if pipeline.user_id != current_user.id and not pipeline.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this pipeline"
        )
    
    # Increment usage count if not the owner
    if pipeline.user_id != current_user.id:
        pipeline.usage_count += 1
        db.commit()
    
    return pipeline

@router.put("/{pipeline_id}", response_model=PipelineResponse)
async def update_pipeline(
    pipeline_id: int,
    pipeline_update: PipelineUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a pipeline"""
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    
    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found"
        )
    
    # Check if user owns this pipeline
    if pipeline.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this pipeline"
        )
    
    # Update fields
    if pipeline_update.name is not None:
        pipeline.name = pipeline_update.name
    if pipeline_update.description is not None:
        pipeline.description = pipeline_update.description
    if pipeline_update.pipeline_data is not None:
        pipeline.pipeline_data = pipeline_update.pipeline_data
    if pipeline_update.is_public is not None:
        pipeline.is_public = pipeline_update.is_public
    if pipeline_update.category is not None:
        pipeline.category = pipeline_update.category
    if pipeline_update.tags is not None:
        pipeline.tags = pipeline_update.tags
    if pipeline_update.thumbnail_data is not None:
        pipeline.thumbnail_data = pipeline_update.thumbnail_data
    
    db.commit()
    db.refresh(pipeline)
    
    return pipeline

@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pipeline(
    pipeline_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a pipeline"""
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    
    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found"
        )
    
    # Check if user owns this pipeline
    if pipeline.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this pipeline"
        )
    
    db.delete(pipeline)
    db.commit()
    
    return None

@router.post("/{pipeline_id}/duplicate", response_model=PipelineResponse)
async def duplicate_pipeline(
    pipeline_id: int,
    new_name: str = Query(..., description="Name for the duplicated pipeline"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Duplicate a pipeline"""
    original_pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    
    if not original_pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found"
        )
    
    # Check if user has access to this pipeline
    if original_pipeline.user_id != current_user.id and not original_pipeline.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this pipeline"
        )
    
    _enforce_pipeline_limit(db, current_user)

    # Create duplicate
    new_pipeline = SavedPipeline(
        user_id=current_user.id,
        name=new_name,
        description=original_pipeline.description,
        pipeline_data=original_pipeline.pipeline_data,
        is_public=False,  # Duplicates are private by default
        category=original_pipeline.category,
        tags=original_pipeline.tags,
        thumbnail_data=original_pipeline.thumbnail_data
    )
    
    db.add(new_pipeline)
    db.commit()
    db.refresh(new_pipeline)
    
    return new_pipeline
