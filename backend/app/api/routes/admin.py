from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
import logging
from app.core.database import get_db
from app.utils.datetime_utils import ensure_aware
from app.models.db_models import User, LoginAttempt, SavedPipeline, ProcessingHistory, UploadedImage, ProcessedImage, Session as DBSession
from app.models.schemas import PinRequest
from app.utils.auth import get_current_active_admin, get_current_user
from app.utils.cleanup_service import CleanupService
from app.core.business_rules import SessionPolicy
from app.utils.admin_pin import (
    check_not_locked_out,
    issue_pin_cookie,
    pin_cookie_is_valid,
    record_failure,
    require_admin_pin,
    reset_failures,
)
from typing import List, Dict, Any

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/security/login-attempts")
async def get_login_attempts(
    hours: int = 24,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get login attempts for the last N hours (admin only)"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    attempts = db.query(LoginAttempt).filter(
        LoginAttempt.attempt_time > cutoff
    ).order_by(LoginAttempt.attempt_time.desc()).all()
    
    # Statistics
    total_attempts = len(attempts)
    failed_attempts = sum(1 for a in attempts if not a.success)
    success_rate = (total_attempts - failed_attempts) / total_attempts * 100 if total_attempts > 0 else 0
    
    # Group by IP
    ip_stats = {}
    for attempt in attempts:
        ip = attempt.ip_address or "unknown"
        if ip not in ip_stats:
            ip_stats[ip] = {"total": 0, "failed": 0, "emails": set()}
        ip_stats[ip]["total"] += 1
        if not attempt.success:
            ip_stats[ip]["failed"] += 1
        ip_stats[ip]["emails"].add(attempt.email)
    
    # Convert sets to lists for JSON serialization
    for ip in ip_stats:
        ip_stats[ip]["emails"] = list(ip_stats[ip]["emails"])
    
    return {
        "period_hours": hours,
        "total_attempts": total_attempts,
        "failed_attempts": failed_attempts,
        "success_rate": round(success_rate, 2),
        "ip_statistics": ip_stats,
        "recent_attempts": [
            {
                "email": a.email,
                "ip_address": a.ip_address,
                "success": a.success,
                "time": a.attempt_time,
                "reason": a.failure_reason
            }
            for a in attempts[:50]  # Last 50 attempts
        ]
    }


@router.get("/stats/overview")
async def get_system_stats(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get system overview statistics (admin only)"""
    
    # User stats
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    admin_users = db.query(func.count(User.id)).filter(User.is_admin == True).scalar()
    
    # Pipeline stats
    total_pipelines = db.query(func.count(SavedPipeline.id)).scalar()
    public_pipelines = db.query(func.count(SavedPipeline.id)).filter(SavedPipeline.is_public == True).scalar()
    
    # Processing stats (last 30 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_processing = db.query(ProcessingHistory).filter(
        ProcessingHistory.created_at > cutoff
    ).all()
    
    total_operations = len(recent_processing)
    avg_duration = sum(p.total_processing_time for p in recent_processing) / total_operations if total_operations > 0 else 0
    
    # Recent user registrations (last 7 days)
    week_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    new_users_week = db.query(func.count(User.id)).filter(User.created_at > week_cutoff).scalar()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "admins": admin_users,
            "new_this_week": new_users_week
        },
        "pipelines": {
            "total": total_pipelines,
            "public": public_pipelines
        },
        "processing": {
            "total_operations_30d": total_operations,
            "average_duration_ms": round(avg_duration, 2)
        }
    }


@router.get("/users")
async def list_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()

    # Fetch pipeline counts in one query to avoid N+1
    user_ids = [u.id for u in users]
    pipeline_counts = dict(
        db.query(SavedPipeline.user_id, func.count(SavedPipeline.id))
        .filter(SavedPipeline.user_id.in_(user_ids))
        .group_by(SavedPipeline.user_id)
        .all()
    ) if user_ids else {}

    return {
        "total": db.query(func.count(User.id)).scalar(),
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "created_at": u.created_at,
                "pipeline_count": pipeline_counts.get(u.id, 0)
            }
            for u in users
        ]
    }


@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Toggle user active status (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deactivating yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user.is_active = not user.is_active
    db.commit()
    
    return {
        "user_id": user.id,
        "email": user.email,
        "is_active": user.is_active,
        "message": f"User {'activated' if user.is_active else 'deactivated'} successfully"
    }


@router.delete("/security/clear-login-attempts/{email}")
async def clear_user_login_attempts(
    email: str,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Clear failed login attempts for a user (admin only)"""
    deleted = db.query(LoginAttempt).filter(
        LoginAttempt.email == email,
        LoginAttempt.success == False
    ).delete()
    
    db.commit()
    
    return {
        "email": email,
        "cleared_attempts": deleted,
        "message": f"Cleared {deleted} failed login attempt(s)"
    }


@router.get("/cleanup/stats")
async def get_cleanup_stats(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get cleanup statistics - what would be cleaned (admin only)"""
    stats = CleanupService.get_cleanup_stats(db)

    # Report the actual editable settings that drive cleanup, so this preview
    # matches what the cleanup service will really do.
    from ...utils.settings_manager import get_settings
    s = get_settings(db)
    stats["settings"] = {
        "guest_upload_retention_hours": s.guest_upload_retention_hours,
        "user_upload_retention_days": s.free_user_upload_retention_days,
        "session_lifetime_hours": s.guest_session_lifetime_hours,
        "cleanup_enabled": s.enable_auto_cleanup
    }

    return stats


@router.post("/cleanup/run")
async def run_cleanup(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Manually trigger cleanup (admin only). Runs even when auto-cleanup is off."""
    results = CleanupService.run_full_cleanup(db, force=True)
    
    return {
        "success": True,
        "results": results,
        "message": f"Cleanup complete. Deleted {results.get('total_deleted', 0)} items."
    }


@router.get("/storage/overview")
async def get_storage_overview(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get storage usage overview (admin only)"""
    from ...utils.settings_manager import get_settings
    settings_row = get_settings(db)

    # Count images
    total_uploaded = db.query(func.count(UploadedImage.id)).scalar()
    total_processed = db.query(func.count(ProcessedImage.id)).scalar()
    
    # Calculate storage (sum of size_bytes)
    uploaded_size = db.query(func.sum(UploadedImage.size_bytes)).scalar() or 0
    
    # Count sessions
    total_sessions = db.query(func.count(DBSession.id)).scalar()
    
    # Active sessions = sessions with recorded activity (upload, opening the
    # workspace, processing) within SessionPolicy.ACTIVE_SESSION_WINDOW.
    now = datetime.now(timezone.utc)
    active_cutoff = now - SessionPolicy.ACTIVE_SESSION_WINDOW
    active_sessions = db.query(func.count(DBSession.id)).filter(
        DBSession.last_active > active_cutoff
    ).scalar()
    expired_sessions = db.query(func.count(DBSession.id)).filter(
        DBSession.expires_at < now
    ).scalar()
    
    
    # User breakdown
    guest_images = db.query(func.count(UploadedImage.id)).filter(
        UploadedImage.user_id.is_(None)
    ).scalar()
    
    user_images = db.query(func.count(UploadedImage.id)).filter(
        UploadedImage.user_id.isnot(None)
    ).scalar()
    
    return {
        "images": {
            "total_uploaded": total_uploaded,
            "total_processed": total_processed,
            "guest_images": guest_images,
            "user_images": user_images
        },
        "storage": {
            "uploaded_size_mb": round(uploaded_size / (1024 * 1024), 2),
            "estimated_processed_mb": round((uploaded_size * 1.2) / (1024 * 1024), 2)  # Estimate
        },
        "sessions": {
            "total": total_sessions,
            "active": active_sessions,
            "expired": expired_sessions,
            "idle": total_sessions - active_sessions - expired_sessions
        },
        "limits": {
            "max_pipelines_per_user": settings_row.free_user_max_pipelines,
            "guest_storage_quota_mb": settings_row.guest_storage_quota_mb,
            "user_storage_quota_mb": settings_row.free_user_storage_quota_mb
        }
    }


@router.get("/settings")
async def get_system_settings(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get all editable system settings (admin only)"""
    from ...utils.settings_manager import get_settings
    
    settings = get_settings(db)
    
    return {
        "success": True,
        "settings": {
            "user_limits": {
                "free_user_max_pipelines": settings.free_user_max_pipelines,
                "guest_storage_quota_mb": settings.guest_storage_quota_mb,
                "free_user_storage_quota_mb": settings.free_user_storage_quota_mb,
                "guest_max_images_per_session": settings.guest_max_images_per_session,
                "free_user_max_images_per_session": settings.free_user_max_images_per_session,
                "max_images_per_upload": settings.max_images_per_upload
            },
            "retention": {
                "guest_upload_retention_hours": settings.guest_upload_retention_hours,
                "free_user_upload_retention_days": settings.free_user_upload_retention_days,
                "guest_processed_retention_hours": settings.guest_processed_retention_hours,
                "free_user_processed_retention_hours": settings.free_user_processed_retention_hours
            },
            "session": {
                "guest_session_lifetime_hours": settings.guest_session_lifetime_hours,
                "user_session_lifetime_days": settings.user_session_lifetime_days,
                "session_grace_period_hours": settings.session_grace_period_hours
            },
            "cleanup": {
                "enable_auto_cleanup": settings.enable_auto_cleanup,
                "cleanup_on_logout": settings.cleanup_on_logout,
                "cleanup_on_tab_close": settings.cleanup_on_tab_close,
                "delete_oldest_on_quota": settings.delete_oldest_on_quota,
                "warn_at_percentage": settings.warn_at_percentage
            },
            "meta": {
                "updated_at": settings.updated_at,
                "updated_by": settings.updated_by,
                "has_pin": settings.admin_pin_hash is not None and len(settings.admin_pin_hash) > 0
            }
        }
    }


@router.put("/settings")
async def update_system_settings(
    updates: dict,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Update system settings (admin only)"""
    from ...utils.settings_manager import update_settings
    
    try:
        settings = update_settings(db, updates, current_user.id)
        
        return {
            "success": True,
            "message": "Settings updated successfully",
            "updated_fields": list(updates.keys())
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update settings: {str(e)}"
        )


@router.post("/pin/set")
async def set_admin_pin(
    pin_request: PinRequest,
    response: Response,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Create the admin PIN, or change it (changing requires the current PIN).

    Before, any admin could overwrite an existing PIN without knowing it,
    which made the PIN pointless.
    """
    from ...utils.auth import get_password_hash, verify_password
    from ...utils.settings_manager import get_settings

    settings = get_settings(db, use_cache=False)
    if settings.admin_pin_hash:
        check_not_locked_out(current_user.id)
        if not pin_request.current_pin or not verify_password(pin_request.current_pin, settings.admin_pin_hash):
            left = record_failure(current_user.id)
            raise HTTPException(
                status_code=401,
                detail=f"Enter the current PIN to change it. {left} attempt(s) left.",
            )

    settings.admin_pin_hash = get_password_hash(pin_request.pin)
    db.commit()
    reset_failures(current_user.id)
    issue_pin_cookie(response, current_user)
    logger.info(f"Admin PIN set by user {current_user.id}")
    return {"success": True, "message": "Admin PIN set successfully"}


@router.post("/pin/verify")
async def verify_admin_pin(
    pin_request: PinRequest,
    response: Response,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Verify the admin PIN; on success the browser gets a 15-minute PIN cookie."""
    from ...utils.auth import verify_password
    from ...utils.settings_manager import get_settings

    settings = get_settings(db, use_cache=False)
    if not settings.admin_pin_hash:
        raise HTTPException(status_code=400, detail="No PIN set. Please set a PIN first.")

    check_not_locked_out(current_user.id)
    if not verify_password(pin_request.pin, settings.admin_pin_hash):
        left = record_failure(current_user.id)
        raise HTTPException(status_code=401, detail=f"Invalid PIN. {left} attempt(s) left.")

    reset_failures(current_user.id)
    issue_pin_cookie(response, current_user)
    return {"success": True, "message": "PIN verified"}


@router.get("/database/overview")
async def get_database_overview(
    request: Request,
    include_user_data: bool = False,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Get complete database overview (admin only, requires PIN for user data)"""
    if include_user_data and not pin_cookie_is_valid(request, current_user):
        raise HTTPException(
            status_code=403,
            detail={"error": "pin_required", "message": "Enter the admin PIN to view user data."},
        )
    
    # Basic counts (always allowed)
    overview = {
        "users": {
            "total": db.query(func.count(User.id)).scalar(),
            "active": db.query(func.count(User.id)).filter(User.is_active == True).scalar(),
            "admins": db.query(func.count(User.id)).filter(User.is_admin == True).scalar(),
            "oauth_users": db.query(func.count(User.id)).filter(User.oauth_provider.isnot(None)).scalar()
        },
        "sessions": {
            "total": db.query(func.count(DBSession.id)).scalar(),
            "active": db.query(func.count(DBSession.id)).filter(
                DBSession.last_active > datetime.now(timezone.utc) - SessionPolicy.ACTIVE_SESSION_WINDOW
            ).scalar()
        },
        "images": {
            "uploaded": db.query(func.count(UploadedImage.id)).scalar(),
            "processed": db.query(func.count(ProcessedImage.id)).scalar(),
            "guest_images": db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id.is_(None)).scalar(),
            "user_images": db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id.isnot(None)).scalar()
        },
        "pipelines": {
            "total": db.query(func.count(SavedPipeline.id)).scalar(),
            "public": db.query(func.count(SavedPipeline.id)).filter(SavedPipeline.is_public == True).scalar()
        },
        "storage": {
            "total_mb": round((db.query(func.sum(UploadedImage.size_bytes)).scalar() or 0) / (1024 * 1024), 2)
        }
    }
    
    # Detailed user data (requires PIN verification via separate endpoint)
    if include_user_data:
        # Get recent users
        recent_users = db.query(User).order_by(User.created_at.desc()).limit(20).all()
        overview["recent_users"] = [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "is_admin": u.is_admin,
                "oauth_provider": u.oauth_provider,
                "created_at": u.created_at.isoformat()
            }
            for u in recent_users
        ]
        
        # Get recent sessions — batch image counts to avoid N+1
        recent_sessions = db.query(DBSession).order_by(DBSession.created_at.desc()).limit(20).all()
        recent_session_ids = [s.id for s in recent_sessions]
        session_image_counts = dict(
            db.query(UploadedImage.session_id, func.count(UploadedImage.id))
            .filter(UploadedImage.session_id.in_(recent_session_ids))
            .group_by(UploadedImage.session_id)
            .all()
        ) if recent_session_ids else {}
        overview["recent_sessions"] = [
            {
                "id": s.id,
                "user_id": s.user_id,
                "created_at": s.created_at.isoformat(),
                "expires_at": s.expires_at.isoformat(),
                "image_count": session_image_counts.get(s.id, 0)
            }
            for s in recent_sessions
        ]
    
    return overview


@router.get("/database/users")
async def get_all_users_data(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Get detailed user data (requires PIN verification)"""
    users = db.query(User).offset(skip).limit(limit).all()
    user_ids = [u.id for u in users]

    # Batch pipeline counts and image counts — avoids N+1 queries
    pipeline_counts = dict(
        db.query(SavedPipeline.user_id, func.count(SavedPipeline.id))
        .filter(SavedPipeline.user_id.in_(user_ids))
        .group_by(SavedPipeline.user_id)
        .all()
    ) if user_ids else {}

    image_counts = dict(
        db.query(UploadedImage.user_id, func.count(UploadedImage.id))
        .filter(UploadedImage.user_id.in_(user_ids))
        .group_by(UploadedImage.user_id)
        .all()
    ) if user_ids else {}

    return {
        "total": db.query(func.count(User.id)).scalar(),
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "full_name": u.full_name,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "oauth_provider": u.oauth_provider,
                "profile_picture": u.profile_picture,
                "created_at": u.created_at.isoformat(),
                "pipeline_count": pipeline_counts.get(u.id, 0),
                "image_count": image_counts.get(u.id, 0)
            }
            for u in users
        ]
    }


@router.get("/database/images")
async def get_all_images_data(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Get all uploaded images metadata (requires PIN)"""
    images = db.query(UploadedImage).order_by(UploadedImage.uploaded_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "total": db.query(func.count(UploadedImage.id)).scalar(),
        "images": [
            {
                "id": img.id,
                "filename": img.filename,
                "session_id": img.session_id,
                "user_id": img.user_id,
                "size_mb": round(img.size_bytes / (1024 * 1024), 2),
                "dimensions": f"{img.width}x{img.height}",
                "format": img.format,
                "uploaded_at": img.uploaded_at.isoformat(),
                "has_processed": db.query(func.count(ProcessedImage.id)).filter(ProcessedImage.original_image_id == img.id).scalar() > 0
            }
            for img in images
        ]
    }


@router.get("/database/users/{user_id}/images")
async def get_user_images(
    user_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Get all images for a specific user with thumbnails"""
    import base64
    
    images = db.query(UploadedImage).filter(
        UploadedImage.user_id == user_id
    ).order_by(UploadedImage.uploaded_at.desc()).offset(skip).limit(limit).all()
    
    logger.info(f"Fetching images for user {user_id}, found {len(images)} images")
    
    result_images = []
    for img in images:
        try:
            thumbnail_url = None
            if img.thumbnail_data:
                # Encode thumbnail as base64 data URL
                b64_data = base64.b64encode(img.thumbnail_data).decode('utf-8')
                thumbnail_url = f"data:{img.mime_type};base64,{b64_data}"
            
            result_images.append({
                "id": img.id,
                "filename": img.filename,
                "size_mb": round(img.size_bytes / (1024 * 1024), 2),
                "dimensions": f"{img.width}x{img.height}",
                "format": img.format,
                "uploaded_at": img.uploaded_at.isoformat(),
                "thumbnail_url": thumbnail_url
            })
        except Exception as e:
            logger.error(f"Error processing image {img.id}: {e}")
            continue
    
    return {
        "total": db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id == user_id).scalar(),
        "images": result_images
    }


@router.get("/database/sessions")
async def get_all_sessions_data(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Get all sessions data (requires PIN)"""
    sessions = db.query(DBSession).order_by(DBSession.created_at.desc()).offset(skip).limit(limit).all()
    session_ids = [s.id for s in sessions]

    # Batch image counts to avoid N+1
    image_counts = dict(
        db.query(UploadedImage.session_id, func.count(UploadedImage.id))
        .filter(UploadedImage.session_id.in_(session_ids))
        .group_by(UploadedImage.session_id)
        .all()
    ) if session_ids else {}

    now = datetime.now(timezone.utc)
    return {
        "total": db.query(func.count(DBSession.id)).scalar(),
        "sessions": [
            {
                "id": s.id,
                "user_id": s.user_id,
                "ip_address": s.ip_address,
                "created_at": s.created_at.isoformat(),
                "last_active": s.last_active.isoformat(),
                "expires_at": s.expires_at.isoformat(),
                "is_expired": ensure_aware(s.expires_at) < now,
                "image_count": image_counts.get(s.id, 0)
            }
            for s in sessions
        ]
    }


@router.get("/database/debug")
async def debug_database_counts(
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Debug endpoint to see all image counts broken down"""
    
    # Get all users
    users = db.query(User).all()
    
    user_details = []
    for user in users:
        # Count images with this user_id
        image_count = db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id == user.id).scalar()
        
        # Get actual images
        actual_images = db.query(UploadedImage).filter(UploadedImage.user_id == user.id).all()
        
        user_details.append({
            "user_id": user.id,
            "email": user.email,
            "username": user.username,
            "image_count_query": image_count,
            "actual_images_found": len(actual_images),
            "image_ids": [img.id for img in actual_images],
            "image_filenames": [img.filename for img in actual_images]
        })
    
    # Count guest images (no user_id)
    guest_count = db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id.is_(None)).scalar()
    guest_images = db.query(UploadedImage).filter(UploadedImage.user_id.is_(None)).all()
    
    # Total images in database
    total_images = db.query(func.count(UploadedImage.id)).scalar()
    all_images = db.query(UploadedImage).all()
    
    return {
        "total_images_in_db": total_images,
        "all_image_ids": [img.id for img in all_images],
        "guest_images": {
            "count_query": guest_count,
            "actual_found": len(guest_images),
            "image_ids": [img.id for img in guest_images],
            "filenames": [img.filename for img in guest_images]
        },
        "users": user_details,
        "summary": {
            "total_users": len(users),
            "total_user_images": sum(u["image_count_query"] for u in user_details),
            "total_guest_images": guest_count,
            "sum_should_equal_total": sum(u["image_count_query"] for u in user_details) + guest_count == total_images
        }
    }


@router.post("/database/fix-orphaned-images")
async def fix_orphaned_images(
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """Fix all orphaned guest images by linking them to the user who owns the session"""
    
    # Find all guest images (user_id = NULL)
    guest_images = db.query(UploadedImage).filter(
        UploadedImage.user_id.is_(None)
    ).all()
    
    logger.info(f"Found {len(guest_images)} orphaned guest images")
    
    fixed_count = 0
    failed_count = 0
    details = []
    
    for img in guest_images:
        # Find the session this image belongs to
        session = db.query(DBSession).filter(DBSession.id == img.session_id).first()
        
        if session and session.user_id:
            # Session has a user_id - reassign image to that user
            old_user_id = img.user_id
            img.user_id = session.user_id
            fixed_count += 1
            
            user = db.query(User).filter(User.id == session.user_id).first()
            logger.info(f"Fixed image {img.filename}: NULL -> User {user.email if user else session.user_id}")
            
            details.append({
                "image_id": img.id,
                "filename": img.filename,
                "session_id": img.session_id,
                "assigned_to_user_id": session.user_id,
                "assigned_to_email": user.email if user else "Unknown"
            })
        else:
            failed_count += 1
            logger.warning(f"Cannot fix image {img.filename}: session has no user_id")
    
    db.commit()
    
    return {
        "success": True,
        "total_orphaned": len(guest_images),
        "fixed": fixed_count,
        "still_orphaned": failed_count,
        "details": details,
        "message": f"Fixed {fixed_count} orphaned images. {failed_count} remain as guest images (no associated user)."
    }


@router.post("/database/delete-all-images")
async def delete_all_images(
    confirm: str,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """DELETE ALL IMAGES FROM DATABASE - Use with caution!"""
    
    if confirm != "DELETE_ALL_IMAGES":
        raise HTTPException(
            status_code=400,
            detail="Must provide confirmation string 'DELETE_ALL_IMAGES'"
        )
    
    # Count before deletion
    uploaded_count = db.query(func.count(UploadedImage.id)).scalar()
    processed_count = db.query(func.count(ProcessedImage.id)).scalar()
    
    logger.warning(f"DELETING ALL IMAGES - Admin: {current_user.email}")
    logger.warning(f"Uploaded images to delete: {uploaded_count}")
    logger.warning(f"Processed images to delete: {processed_count}")
    
    # Delete processed images first (foreign key constraint)
    db.query(ProcessedImage).delete()
    
    # Delete uploaded images
    db.query(UploadedImage).delete()
    
    db.commit()
    
    logger.warning(f"ALL IMAGES DELETED by admin: {current_user.email}")
    
    return {
        "success": True,
        "deleted_uploaded": uploaded_count,
        "deleted_processed": processed_count,
        "total_deleted": uploaded_count + processed_count,
        "message": f"Deleted {uploaded_count} uploaded and {processed_count} processed images"
    }


@router.post("/database/delete-all-sessions")
async def delete_all_sessions(
    confirm: str,
    current_user: User = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    """DELETE ALL SESSIONS FROM DATABASE - Use with caution!"""
    
    if confirm != "DELETE_ALL_SESSIONS":
        raise HTTPException(
            status_code=400,
            detail="Must provide confirmation string 'DELETE_ALL_SESSIONS'"
        )
    
    # Count before deletion
    session_count = db.query(func.count(DBSession.id)).scalar()
    
    logger.warning(f"DELETING ALL SESSIONS - Admin: {current_user.email}")
    logger.warning(f"Sessions to delete: {session_count}")
    
    # Delete all sessions (will cascade delete images due to foreign key)
    db.query(DBSession).delete()
    
    db.commit()
    
    logger.warning(f"ALL SESSIONS DELETED by admin: {current_user.email}")
    
    return {
        "success": True,
        "deleted_sessions": session_count,
        "message": f"Deleted {session_count} sessions (and all associated images)"
    }


@router.get("/database/users/{user_id}/pipelines")
async def get_user_pipelines(
    user_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Get all pipelines for a specific user"""
    try:
        logger.info(f"Fetching pipelines for user {user_id}...")
        
        pipelines = db.query(SavedPipeline).filter(
            SavedPipeline.user_id == user_id
        ).order_by(SavedPipeline.updated_at.desc()).offset(skip).limit(limit).all()
        
        logger.info(f"Found {len(pipelines)} pipelines for user {user_id}")
        
        result_pipelines = []
        for pipeline in pipelines:
            try:
                # Count operations in the pipeline
                operation_count = 0
                
                # Check if pipeline_data exists
                if hasattr(pipeline, 'pipeline_data') and pipeline.pipeline_data:
                    try:
                        # pipeline_data might be a dict, list, or JSON string
                        if isinstance(pipeline.pipeline_data, str):
                            import json
                            ops_data = json.loads(pipeline.pipeline_data)
                        else:
                            ops_data = pipeline.pipeline_data
                        
                        # Count based on type
                        if isinstance(ops_data, list):
                            operation_count = len(ops_data)
                        elif isinstance(ops_data, dict) and 'operations' in ops_data:
                            operation_count = len(ops_data['operations'])
                    except Exception as count_error:
                        logger.warning(f"Could not count operations for pipeline {pipeline.id}: {count_error}")
                        operation_count = 0
                
                result_pipelines.append({
                    "id": pipeline.id,
                    "name": pipeline.name,
                    "description": pipeline.description,
                    "is_public": pipeline.is_public,
                    "created_at": pipeline.created_at.isoformat(),
                    "updated_at": pipeline.updated_at.isoformat(),
                    "operation_count": operation_count
                })
            except Exception as pipeline_error:
                logger.error(f"Error processing pipeline {pipeline.id if hasattr(pipeline, 'id') else 'unknown'}: {pipeline_error}")
                # Skip this pipeline but continue with others
                continue
        
        total_count = db.query(func.count(SavedPipeline.id)).filter(SavedPipeline.user_id == user_id).scalar()
        
        logger.info(f"Successfully processed {len(result_pipelines)} pipelines for user {user_id}")
        
        return {
            "total": total_count,
            "pipelines": result_pipelines
        }
    
    except Exception as e:
        logger.error(f"Fatal error in get_user_pipelines for user {user_id}: {e}")
        logger.exception(e)  # This will print the full stack trace
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch pipelines: {str(e)}"
        )


@router.delete("/database/users/{user_id}")
async def delete_user(
    user_id: int,
    confirm: str,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Delete a user and ALL their data (images, pipelines, sessions)"""
    
    if confirm != "DELETE_USER":
        raise HTTPException(
            status_code=400,
            detail="Must provide confirmation string 'DELETE_USER'"
        )
    
    # Find the user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )
    
    # Count what will be deleted
    images_count = db.query(func.count(UploadedImage.id)).filter(UploadedImage.user_id == user_id).scalar()
    pipelines_count = db.query(func.count(SavedPipeline.id)).filter(SavedPipeline.user_id == user_id).scalar()
    sessions_count = db.query(func.count(DBSession.id)).filter(DBSession.user_id == user_id).scalar()
    
    logger.warning(f"DELETING USER {user.email} - Admin: {current_user.email}")
    logger.warning(f"Will delete: {images_count} images, {pipelines_count} pipelines, {sessions_count} sessions")
    
    # Delete user's processed images first (foreign key constraints)
    processed_images = db.query(ProcessedImage).join(
        UploadedImage, ProcessedImage.original_image_id == UploadedImage.id
    ).filter(UploadedImage.user_id == user_id).all()
    for img in processed_images:
        db.delete(img)
    
    # Delete user's uploaded images
    db.query(UploadedImage).filter(UploadedImage.user_id == user_id).delete()
    
    # Delete user's pipelines
    db.query(SavedPipeline).filter(SavedPipeline.user_id == user_id).delete()
    
    # Delete user's sessions
    db.query(DBSession).filter(DBSession.user_id == user_id).delete()
    
    # Delete user's processing history
    db.query(ProcessingHistory).filter(ProcessingHistory.user_id == user_id).delete()
    
    # Delete user's login attempts
    db.query(LoginAttempt).filter(LoginAttempt.email == user.email).delete()
    
    # Finally delete the user
    db.delete(user)
    
    db.commit()
    
    logger.warning(f"USER DELETED: {user.email} by admin {current_user.email}")
    
    return {
        "success": True,
        "deleted_images": images_count,
        "deleted_pipelines": pipelines_count,
        "deleted_sessions": sessions_count,
        "message": f"User {user.email} and all their data deleted successfully"
    }


@router.delete("/database/images/{image_id}")
async def delete_image(
    image_id: str,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Delete a specific image and its processed versions"""
    
    # Find the image
    image = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    logger.info(f"Deleting image {image.filename} (ID: {image_id}) - Admin: {current_user.email}")
    
    # Delete processed versions first (foreign key constraint)
    processed_count = db.query(func.count(ProcessedImage.id)).filter(
        ProcessedImage.original_image_id == image_id
    ).scalar()
    
    db.query(ProcessedImage).filter(ProcessedImage.original_image_id == image_id).delete()
    
    # Delete the uploaded image
    db.delete(image)
    
    db.commit()
    
    return {
        "success": True,
        "deleted_processed_versions": processed_count,
        "message": f"Image {image.filename} and {processed_count} processed versions deleted"
    }


@router.delete("/database/pipelines/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: int,
    current_user: User = Depends(require_admin_pin),
    db: Session = Depends(get_db)
):
    """Delete a specific pipeline"""
    
    # Find the pipeline
    pipeline = db.query(SavedPipeline).filter(SavedPipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    
    logger.info(f"Deleting pipeline {pipeline.name} (ID: {pipeline_id}) - Admin: {current_user.email}")
    
    # Delete the pipeline
    db.delete(pipeline)
    db.commit()
    
    return {
        "success": True,
        "message": f"Pipeline {pipeline.name} deleted successfully"
    }
