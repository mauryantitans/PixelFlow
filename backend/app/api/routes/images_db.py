"""
Database-backed image storage routes for PixelFlow

Image metadata and thumbnails live in the database; the full image bytes live
in the row or in object storage, depending on STORAGE_BACKEND (app.storage).
"""

import uuid
import logging
import base64
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request, Body
from fastapi.responses import JSONResponse, Response
from PIL import Image as PILImage
from sqlalchemy.orm import Session
from sqlalchemy import func

from ...models import ImageData, UploadResponse
from ...core.config import settings
from ...core.database import get_db
from ...models.db_models import Session as DBSession, UploadedImage, ProcessedImage, SystemSettings, User
from ...utils.session_db import (
    SessionOwnershipError,
    cleanup_expired_sessions,
    create_or_update_session,
    get_session_images,
    touch_session,
)
from ...utils.quota_manager import check_storage_quota
from ...utils.settings_manager import get_settings
from ...utils.image_processing import ImageProcessor
from ...utils.auth import get_current_user_optional, get_current_active_admin
from ...storage import ObjectNotFound, StorageError
from ...storage.images import delete_image_objects, read_image_bytes, save_image_bytes

logger = logging.getLogger(__name__)
router = APIRouter()


def _storage_http_error(e: StorageError) -> HTTPException:
    """404 when the object is gone, 503 when the image store can't be reached/used."""
    if isinstance(e, ObjectNotFound):
        return HTTPException(status_code=404, detail="Image data is missing from storage")
    return HTTPException(status_code=503, detail=f"Image storage is unavailable: {e}")


def image_to_base64(image: PILImage.Image, format: str = 'JPEG') -> str:
    """Convert PIL Image to base64 string"""
    buffered = io.BytesIO()
    image.save(buffered, format=format)
    img_bytes = buffered.getvalue()
    return base64.b64encode(img_bytes).decode('utf-8')


def bytes_to_base64_dataurl(image_bytes: bytes, mime_type: str) -> str:
    """Convert image bytes to base64 data URL"""
    b64 = base64.b64encode(image_bytes).decode('utf-8')
    return f"data:{mime_type};base64,{b64}"


def process_image_bytes(content: bytes):
    """Decode raw upload bytes and re-encode for storage.

    Preserves transparency (stores PNG/RGBA) when the source has an alpha
    channel; otherwise normalises to RGB and stores JPEG. Returns
    (img_bytes, thumbnail_bytes, width, height, image_format, mime_type).
    Raises ValueError / PIL errors on undecodable input (caller maps to 400).
    """
    img = PILImage.open(io.BytesIO(content))

    has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
    if has_alpha:
        img = img.convert('RGBA')
        image_format, mime_type = 'PNG', 'image/png'
    else:
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        image_format, mime_type = 'JPEG', 'image/jpeg'

    width, height = img.size

    def _encode(image: PILImage.Image, quality: int) -> bytes:
        buf = io.BytesIO()
        if image_format == 'JPEG':
            image.save(buf, format='JPEG', quality=quality)
        else:
            image.save(buf, format='PNG', optimize=True)
        return buf.getvalue()

    img_bytes = _encode(img, 95)

    thumbnail_img = img.copy()
    thumbnail_img.thumbnail(settings.THUMBNAIL_SIZE, PILImage.Resampling.LANCZOS)
    thumbnail_bytes = _encode(thumbnail_img, 85)

    return img_bytes, thumbnail_bytes, width, height, image_format, mime_type


# 401 for a signed-out request on a user's own session/image: the client
# refreshes its tokens and retries (services/tokenRefresh.ts).
def _sign_in_expired() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"error": "sign_in_required", "message": "Your sign-in has expired. Please sign in again."},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _require_owner(owner_id, current_user, what: str) -> None:
    """Same rule everywhere: owner only; signed-out -> 401, anyone else -> 403.

    Admins are not exempt here: other users' images are reached through the
    admin endpoints, which require the admin PIN (utils/admin_pin.py).
    """
    if owner_id is None:
        return
    if current_user is None:
        raise _sign_in_expired()
    if current_user.id != owner_id:
        raise HTTPException(status_code=403, detail=f"Not authorized to {what}")


def _record_upload_session(db: Session, session_id: str, user_id, device_info, ip_address):
    """Create/extend the upload's session, refusing sessions owned by someone else."""
    try:
        return create_or_update_session(db, session_id, user_id, device_info, ip_address)
    except SessionOwnershipError:
        if user_id is None:
            # The owner's access cookie expired (the browser stops sending it
            # after 30 min). 401 lets the client refresh and retry instead of
            # wrongly treating its own session as someone else's.
            raise _sign_in_expired()
        raise HTTPException(
            status_code=409,
            detail={
                "error": "session_owned_by_another_user",
                "message": "This browser session belongs to a different account. Start a new session and try again.",
            },
        )


@router.post("/upload", response_model=UploadResponse)
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Upload an image and store in database"""
    try:
        # Get user_id from authenticated user (None if guest)
        user_id = current_user.id if current_user else None
        is_admin = current_user.is_admin if current_user else False
        
        logger.info(f"Upload request from: {'User ID ' + str(user_id) if user_id else 'Guest'} (session: {session_id})")
        # Read file content first to check size
        content = await file.read()
        file_size = len(content)

        # Reject empty uploads up front with a clear message (otherwise PIL fails
        # later with a cryptic decode error).
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # Validate file size
        if file_size > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large")
        
        # Validate file extension
        file_extension = Path(file.filename or "image").suffix.lower()
        if file_extension not in settings.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not supported. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            )
        
        # Get client info
        ip_address = request.client.host if request.client else None
        device_info = request.headers.get("user-agent")
        
        # Create or update session (409 if it belongs to another user)
        _record_upload_session(db, session_id, user_id, device_info, ip_address)
        
        # Get settings from database
        db_settings = db.query(SystemSettings).first()
        
        if not db_settings:
            # Create default settings inline
            db_settings = SystemSettings(
                id=1,
                free_user_max_pipelines=3,
                guest_storage_quota_mb=50,
                free_user_storage_quota_mb=500,
                guest_max_images_per_session=50,
                free_user_max_images_per_session=100,
                max_images_per_upload=20,
                warn_at_percentage=80
            )
            db.add(db_settings)
            db.commit()
            db.refresh(db_settings)
        
        # CHECK IMAGE COUNT LIMIT FOR SESSION
        current_image_count = db.query(func.count(UploadedImage.id)).filter(
            UploadedImage.session_id == session_id
        ).scalar() or 0
        
        # Determine max images based on user type
        max_images = db_settings.free_user_max_images_per_session if user_id else db_settings.guest_max_images_per_session
        
        if current_image_count >= max_images:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Image limit reached",
                    "message": f"You've reached the maximum of {max_images} images per session. Please delete some images or clear your session.",
                    "current_count": current_image_count,
                    "max_count": max_images
                }
            )
        
        # CHECK STORAGE QUOTA BEFORE UPLOAD
        quota_check = check_storage_quota(
            db, 
            user_id=user_id,
            session_id=session_id,
            new_file_size=file_size,
            is_admin=is_admin
        )
        
        if not quota_check['allowed']:
            # Quota exceeded - throw error with details
            raise HTTPException(
                status_code=507,  # Insufficient Storage
                detail={
                    "error": "Storage quota exceeded",
                    "message": f"Upload would exceed your storage quota. You're using {quota_check['current_mb']}MB of {quota_check['quota_mb']}MB. This file is {quota_check['new_file_mb']}MB.",
                    "current_mb": quota_check['current_mb'],
                    "quota_mb": quota_check['quota_mb'],
                    "file_size_mb": quota_check['new_file_mb'],
                    "percentage_used": quota_check['percentage_used']
                }
            )
        
        # Log warning if near quota
        if quota_check['warning']:
            logger.warning(
                f"User near quota: {quota_check['percentage_used']}% used "
                f"({quota_check['current_mb']}MB / {quota_check['quota_mb']}MB)"
            )
        
        # Generate unique image ID
        image_id = str(uuid.uuid4())
        
        # Decode + re-encode for storage (preserves transparency where present).
        try:
            img_bytes, thumbnail_bytes, width, height, image_format, mime_type = (
                process_image_bytes(content)
            )
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            raise HTTPException(status_code=400, detail=f"Unable to process image: {str(e)}")
        
        # Store the row (bytes in the row or in object storage, see app.storage)
        uploaded_image = UploadedImage(
            id=image_id,
            session_id=session_id,
            user_id=user_id,  # Associate with authenticated user
            filename=file.filename or "image.jpg",
            thumbnail_data=thumbnail_bytes,
            width=width,
            height=height,
            format=image_format,
            size_bytes=len(img_bytes),
            mime_type=mime_type
        )
        try:
            save_image_bytes(uploaded_image, img_bytes, mime_type)
        except StorageError as e:
            logger.error(f"Could not store image {image_id}: {e}")
            raise _storage_http_error(e)

        db.add(uploaded_image)
        try:
            db.commit()
        except Exception:
            db.rollback()
            delete_image_objects([uploaded_image])  # don't leave an unreferenced object
            raise
        db.refresh(uploaded_image)

        # Create thumbnail base64 for immediate display
        thumbnail_base64 = f"data:{mime_type};base64,{base64.b64encode(thumbnail_bytes).decode('utf-8')}"
        
        logger.info(f"Image uploaded to database: {image_id} ({file.filename}) - User: {user_id or 'Guest'}")
        
        # Return image metadata
        return UploadResponse(
            success=True,
            image=ImageData(
                id=image_id,
                filename=file.filename or "image.jpg",
                file_path=f"db://{image_id}",  # Virtual path to indicate DB storage
                session_id=session_id,
                size_bytes=len(img_bytes),
                width=width,
                height=height,
                format=image_format
            ),
            thumbnail=thumbnail_base64,
            message=f"Image uploaded successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during upload: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload-multiple")
async def upload_multiple_images(
    request: Request,
    files: List[UploadFile] = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Upload multiple images to the database (DB-storage equivalent of /upload).

    Per-file failures are isolated and reported; successfully decoded images are
    persisted in a single commit. Storage-quota and per-session count limits are
    enforced cumulatively across the batch.
    """
    user_id = current_user.id if current_user else None
    is_admin = current_user.is_admin if current_user else False

    db_settings = get_settings(db)
    max_per_upload = db_settings.max_images_per_upload or 20
    if len(files) > max_per_upload:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum {max_per_upload} per upload.",
        )

    ip_address = request.client.host if request.client else None
    device_info = request.headers.get("user-agent")
    _record_upload_session(db, session_id, user_id, device_info, ip_address)

    # Cumulative baselines for the batch.
    existing_count = db.query(func.count(UploadedImage.id)).filter(
        UploadedImage.session_id == session_id
    ).scalar() or 0
    max_images = (
        db_settings.free_user_max_images_per_session
        if user_id else db_settings.guest_max_images_per_session
    )
    accepted_bytes = 0
    accepted = 0

    uploaded_images: List[dict] = []
    failed_uploads: List[dict] = []
    new_rows: List[UploadedImage] = []

    for file in files:
        try:
            content = await file.read()
            file_size = len(content)
            if file_size == 0:
                raise ValueError("Uploaded file is empty")
            if file_size > settings.MAX_FILE_SIZE:
                raise ValueError("File too large")
            ext = Path(file.filename or "image").suffix.lower()
            if ext not in settings.ALLOWED_EXTENSIONS:
                raise ValueError(
                    f"File type not supported. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
                )

            if existing_count + accepted + 1 > max_images:
                raise ValueError(
                    f"Maximum of {max_images} images per session reached"
                )

            quota_check = check_storage_quota(
                db, user_id=user_id, session_id=session_id,
                new_file_size=accepted_bytes + file_size, is_admin=is_admin,
            )
            if not quota_check["allowed"]:
                raise ValueError(
                    f"Storage quota exceeded ({quota_check['quota_mb']}MB)"
                )

            img_bytes, thumbnail_bytes, width, height, image_format, mime_type = (
                process_image_bytes(content)
            )

            image_id = str(uuid.uuid4())
            row = UploadedImage(
                id=image_id,
                session_id=session_id,
                user_id=user_id,
                filename=file.filename or "image",
                thumbnail_data=thumbnail_bytes,
                width=width,
                height=height,
                format=image_format,
                size_bytes=len(img_bytes),
                mime_type=mime_type,
            )
            save_image_bytes(row, img_bytes, mime_type)
            db.add(row)
            new_rows.append(row)

            accepted += 1
            accepted_bytes += len(img_bytes)
            uploaded_images.append({
                "image": ImageData(
                    id=image_id,
                    filename=file.filename or "image",
                    file_path=f"db://{image_id}",
                    session_id=session_id,
                    size_bytes=len(img_bytes),
                    width=width,
                    height=height,
                    format=image_format,
                ).dict(),
                "thumbnail": bytes_to_base64_dataurl(thumbnail_bytes, mime_type),
            })
        except Exception as e:
            logger.warning(f"Failed to upload {getattr(file, 'filename', '?')}: {e}")
            failed_uploads.append({"filename": getattr(file, "filename", None), "error": str(e)})

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        delete_image_objects(new_rows)  # don't leave unreferenced objects
        logger.error(f"Batch upload commit failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded images")

    return JSONResponse(content={
        "success": True,
        "uploaded_count": len(uploaded_images),
        "failed_count": len(failed_uploads),
        "uploaded_images": uploaded_images,
        "failed_uploads": failed_uploads,
        "message": f"Uploaded {len(uploaded_images)} of {len(files)} images successfully",
    })


@router.get("/session/{session_id}/images")
async def get_session_images_list(
    session_id: str,
    include_data: bool = False,
    thumbnails_only: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get all images for a session"""
    try:
        # Verify the session belongs to the requesting user (or is a guest session)
        session_obj = db.query(DBSession).filter(DBSession.id == session_id).first()
        if session_obj:
            # If the session is owned by a user, only that user may view it
            _require_owner(session_obj.user_id, current_user, "view this session")
            # Opening the workspace counts as activity (keeps the session alive).
            if session_obj.user_id is None or (current_user and current_user.id == session_obj.user_id):
                touch_session(db, session_id, current_user.id if current_user else None)

        images = get_session_images(db, session_id)

        result = []
        for img in images:
            image_data = {
                "id": img.id,
                "filename": img.filename,
                "file_path": f"db://{img.id}",
                "session_id": img.session_id,
                "size_bytes": img.size_bytes,
                "width": img.width,
                "height": img.height,
                "format": img.format,
                "uploaded_at": img.uploaded_at.isoformat()
            }
            
            if include_data:
                # Include base64 encoded image and thumbnail. With
                # thumbnails_only the full images are left out (the client
                # fetches them one by one from /images/image/{id}); sending
                # every full image in one JSON body reached tens of MB.
                image_data["thumbnail"] = bytes_to_base64_dataurl(img.thumbnail_data, img.mime_type)
                if not thumbnails_only:
                    image_data["image"] = bytes_to_base64_dataurl(read_image_bytes(img), img.mime_type)
            
            result.append(image_data)
        
        return JSONResponse(content={
            "success": True,
            "count": len(result),
            "images": result
        })
        
    except HTTPException:
        raise
    except StorageError as e:
        logger.error(f"Error reading session images from storage: {e}")
        raise _storage_http_error(e)
    except Exception as e:
        logger.error(f"Error getting session images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image/{image_id}")
async def get_image(
    image_id: str,
    thumbnail: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get an image from database"""
    try:
        img = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        # Enforce ownership: only the owning user (or admin) may retrieve a user-owned image.
        # Guest images (user_id=None) are accessible via session context (frontend passes session).
        _require_owner(img.user_id, current_user, "access this image")

        # Update last accessed
        img.last_accessed = datetime.now(timezone.utc)
        db.commit()

        # Return appropriate data
        if thumbnail and img.thumbnail_data:
            return Response(content=img.thumbnail_data, media_type=img.mime_type)
        else:
            return Response(content=read_image_bytes(img), media_type=img.mime_type)

    except HTTPException:
        raise
    except StorageError as e:
        logger.error(f"Error reading image {image_id} from storage: {e}")
        raise _storage_http_error(e)
    except Exception as e:
        logger.error(f"Error retrieving image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/image/{image_id}")
async def delete_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Delete an image from database"""
    try:
        img = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        # Ownership check: only the image owner or an admin may delete.
        # Guest images (user_id=None) can only be deleted when no user is set,
        # meaning the request must be from the same guest session (no token needed).
        _require_owner(img.user_id, current_user, "delete this image")

        # Its stored objects (and its processed versions') are removed after the
        # commit by the hook in app.storage.images.
        db.delete(img)
        db.commit()

        logger.info(f"Image deleted from database: {image_id}")

        return JSONResponse(content={
            "success": True,
            "message": "Image deleted successfully"
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup-session")
async def cleanup_session(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Clean up a session and all its images - handles both JSON and beacon requests"""
    try:
        # Try to parse JSON body
        try:
            body = await request.json()
            session_id = body.get('session_id')
        except Exception:
            # If JSON parsing fails, try form data
            form = await request.form()
            session_id = form.get('session_id')
        
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id required")
        
        logger.info(f"Cleanup session request for: {session_id}")
        
        session = db.query(DBSession).filter(DBSession.id == session_id).first()

        # A signed-in user's session (and their images) may only be deleted by
        # that user; knowing the session id is not enough.
        if session:
            _require_owner(session.user_id, current_user, "delete this session")

        if session:
            # Count images before deleting
            image_count = db.query(func.count(UploadedImage.id)).filter(
                UploadedImage.session_id == session_id
            ).scalar()
            
            db.delete(session)  # Cascades to images (their objects go after commit)
            db.commit()
            logger.info(f"Session cleaned up: {session_id} - Deleted session and {image_count} images")
            return JSONResponse(content={
                "success": True,
                "message": f"Session cleaned up successfully",
                "deleted_images": image_count
            })
        else:
            logger.info(f"Session not found (already cleaned): {session_id}")
            return JSONResponse(content={
                "success": True,
                "message": "Session not found (already cleaned)"
            })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/heartbeat")
async def session_heartbeat(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Deprecated: kept so older frontends keep working.

    The frontend now checks connectivity with GET /api/health, and session
    activity is recorded by real actions (uploads, listing images, processing).
    This endpoint only extends an *existing* session (throttled) and never
    creates one, so it can no longer fill the sessions table.
    """
    session_id = body.get('session_id')
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    try:
        session = touch_session(db, session_id, current_user.id if current_user else None)
    except SessionOwnershipError:
        raise HTTPException(status_code=409, detail="Session belongs to a different account")
    except Exception:
        db.rollback()
        logger.exception("Error processing heartbeat")
        raise HTTPException(status_code=500, detail="Heartbeat failed")
    return {
        "success": True,
        "session_id": session_id,
        "exists": session is not None,
        "last_active": session.last_active.isoformat() if session else None,
    }


@router.get("/cleanup-expired")
async def cleanup_expired(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """Cleanup expired sessions (admin only)"""
    try:
        count = cleanup_expired_sessions(db)
        
        return JSONResponse(content={
            "success": True,
            "cleaned_sessions": count,
            "message": f"Cleaned up {count} expired session(s)"
        })
        
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))
