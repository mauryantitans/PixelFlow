"""
Automated Database Cleanup Service for PixelFlow

Handles automatic deletion of expired sessions, old images, and orphaned data.
All rules configured in app/core/business_rules.py
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.core.business_rules import CleanupTriggers
from app.utils.settings_manager import get_settings, get_retention_policy
from app.models.db_models import Session as DBSession, UploadedImage, ProcessedImage, User, RefreshToken
import logging

logger = logging.getLogger(__name__)


class CleanupService:
    """Automated cleanup service"""
    
    @staticmethod
    def cleanup_expired_sessions(db: Session) -> dict:
        """Delete expired sessions and their images"""
        if not CleanupTriggers.CLEAN_EXPIRED_SESSIONS:
            return {"sessions_deleted": 0, "images_deleted": 0}
        
        current_time = datetime.now(timezone.utc)
        grace_period = get_retention_policy(db)["session_grace"]
        cutoff_time = current_time - grace_period
        
        # Find truly expired sessions (expired + grace period passed)
        expired_sessions = db.query(DBSession).filter(
            DBSession.expires_at < cutoff_time
        ).all()
        
        sessions_deleted = 0
        images_deleted = 0
        
        for session in expired_sessions:
            # Count images
            session_images = db.query(UploadedImage).filter(
                UploadedImage.session_id == session.id
            ).count()
            
            images_deleted += session_images
            
            # Delete session (cascades to images)
            db.delete(session)
            sessions_deleted += 1
            
            logger.info(f"Deleted expired session {session.id} with {session_images} images")
        
        db.commit()
        
        return {
            "sessions_deleted": sessions_deleted,
            "images_deleted": images_deleted
        }
    
    @staticmethod
    def cleanup_old_uploads(db: Session) -> dict:
        """Delete uploaded images older than retention period"""
        if not CleanupTriggers.CLEAN_OLD_UPLOADS:
            return {"guest_deleted": 0, "user_deleted": 0}
        
        current_time = datetime.now(timezone.utc)
        retention = get_retention_policy(db)

        guest_deleted = 0
        user_deleted = 0

        # Clean guest user uploads (no user_id)
        guest_cutoff = current_time - retention["guest_upload"]
        guest_images = db.query(UploadedImage).filter(
            UploadedImage.user_id.is_(None),
            UploadedImage.uploaded_at < guest_cutoff
        ).all()

        for img in guest_images:
            db.delete(img)
            guest_deleted += 1

        # Clean registered user uploads
        user_cutoff = current_time - retention["user_upload"]
        user_images = db.query(UploadedImage).filter(
            UploadedImage.user_id.isnot(None),
            UploadedImage.uploaded_at < user_cutoff
        ).all()
        
        for img in user_images:
            db.delete(img)
            user_deleted += 1
        
        db.commit()
        
        logger.info(f"Deleted old uploads: {guest_deleted} guest, {user_deleted} user")
        
        return {
            "guest_deleted": guest_deleted,
            "user_deleted": user_deleted
        }
    
    @staticmethod
    def cleanup_old_processed_images(db: Session) -> dict:
        """Delete processed images older than retention period"""
        if not CleanupTriggers.CLEAN_OLD_PROCESSED:
            return {"deleted": 0}
        
        current_time = datetime.now(timezone.utc)
        retention = get_retention_policy(db)

        # Guest processed images (check original image's user_id)
        guest_cutoff = current_time - retention["guest_processed"]
        guest_processed = db.query(ProcessedImage).join(
            UploadedImage, ProcessedImage.original_image_id == UploadedImage.id
        ).filter(
            UploadedImage.user_id.is_(None),
            ProcessedImage.processed_at < guest_cutoff
        ).all()
        
        deleted = len(guest_processed)
        for img in guest_processed:
            db.delete(img)
        
        # User processed images
        user_cutoff = current_time - retention["user_processed"]
        user_processed = db.query(ProcessedImage).join(
            UploadedImage, ProcessedImage.original_image_id == UploadedImage.id
        ).filter(
            UploadedImage.user_id.isnot(None),
            ProcessedImage.processed_at < user_cutoff
        ).all()
        
        deleted += len(user_processed)
        for img in user_processed:
            db.delete(img)
        
        db.commit()
        
        logger.info(f"Deleted {deleted} old processed images")
        
        return {"deleted": deleted}
    
    @staticmethod
    def cleanup_orphaned_images(db: Session) -> dict:
        """Delete images that have no session (orphaned)"""
        if not CleanupTriggers.CLEAN_ORPHANED_IMAGES:
            return {"deleted": 0}
        
        # Find uploaded images with no session
        orphaned = db.query(UploadedImage).outerjoin(
            DBSession, UploadedImage.session_id == DBSession.id
        ).filter(DBSession.id.is_(None)).all()
        
        deleted = len(orphaned)
        for img in orphaned:
            db.delete(img)
        
        db.commit()
        
        logger.info(f"Deleted {deleted} orphaned images")
        
        return {"deleted": deleted}
    
    @staticmethod
    def cleanup_expired_refresh_tokens(db: Session) -> dict:
        """Delete refresh tokens whose JWT expiry has passed."""
        current_time = datetime.now(timezone.utc)
        deleted = db.query(RefreshToken).filter(
            RefreshToken.expires_at < current_time
        ).delete()
        db.commit()
        if deleted:
            logger.info(f"Deleted {deleted} expired refresh token(s)")
        return {"deleted": deleted}

    @staticmethod
    def run_full_cleanup(db: Session, *, force: bool = False) -> dict:
        """Run all cleanup tasks.

        The admin's auto-cleanup switch governs the background scheduler only;
        an explicit run (admin button, manual script) passes ``force=True``.
        """
        if not force and not get_settings(db).enable_auto_cleanup:
            return {"enabled": False, "total_deleted": 0}
        
        logger.info("Starting automated cleanup...")
        
        results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sessions": CleanupService.cleanup_expired_sessions(db),
            "old_uploads": CleanupService.cleanup_old_uploads(db),
            "old_processed": CleanupService.cleanup_old_processed_images(db),
            "orphaned": CleanupService.cleanup_orphaned_images(db),
            "expired_refresh_tokens": CleanupService.cleanup_expired_refresh_tokens(db),
            "finished_jobs": {"deleted": _delete_finished_jobs(db)},
        }

        total_deleted = (
            results["sessions"]["sessions_deleted"] +
            results["sessions"]["images_deleted"] +
            results["old_uploads"]["guest_deleted"] +
            results["old_uploads"]["user_deleted"] +
            results["old_processed"]["deleted"] +
            results["orphaned"]["deleted"] +
            results["expired_refresh_tokens"]["deleted"] +
            results["finished_jobs"]["deleted"]
        )
        
        logger.info(f"Cleanup complete. Total items deleted: {total_deleted}")
        
        results["total_deleted"] = total_deleted
        return results
    
    @staticmethod
    def get_cleanup_stats(db: Session) -> dict:
        """Get statistics about what would be cleaned up"""
        current_time = datetime.now(timezone.utc)
        retention = get_retention_policy(db)

        # Expired sessions
        grace_cutoff = current_time - retention["session_grace"]
        expired_sessions = db.query(func.count(DBSession.id)).filter(
            DBSession.expires_at < grace_cutoff
        ).scalar()

        # Old uploads
        guest_upload_cutoff = current_time - retention["guest_upload"]
        old_guest_uploads = db.query(func.count(UploadedImage.id)).filter(
            UploadedImage.user_id.is_(None),
            UploadedImage.uploaded_at < guest_upload_cutoff
        ).scalar()

        user_upload_cutoff = current_time - retention["user_upload"]
        old_user_uploads = db.query(func.count(UploadedImage.id)).filter(
            UploadedImage.user_id.isnot(None),
            UploadedImage.uploaded_at < user_upload_cutoff
        ).scalar()
        
        # Orphaned images
        orphaned_count = db.query(func.count(UploadedImage.id)).outerjoin(
            DBSession, UploadedImage.session_id == DBSession.id
        ).filter(DBSession.id.is_(None)).scalar()
        
        return {
            "expired_sessions": expired_sessions,
            "old_guest_uploads": old_guest_uploads,
            "old_user_uploads": old_user_uploads,
            "orphaned_images": orphaned_count,
            "ready_for_cleanup": expired_sessions + old_guest_uploads + old_user_uploads + orphaned_count
        }


def manual_cleanup():
    """Manually run cleanup (can be called via script or cron)"""
    db = SessionLocal()
    try:
        results = CleanupService.run_full_cleanup(db, force=True)
        print("\n" + "="*70)
        print("🧹 MANUAL CLEANUP COMPLETE")
        print("="*70)
        print(f"\n📊 Results:")
        print(f"   • Expired sessions: {results['sessions']['sessions_deleted']}")
        print(f"   • Session images: {results['sessions']['images_deleted']}")
        print(f"   • Old guest uploads: {results['old_uploads']['guest_deleted']}")
        print(f"   • Old user uploads: {results['old_uploads']['user_deleted']}")
        print(f"   • Old processed images: {results['old_processed']['deleted']}")
        print(f"   • Orphaned images: {results['orphaned']['deleted']}")
        print(f"\n✅ Total items deleted: {results['total_deleted']}")
        print("="*70 + "\n")
        return results
    finally:
        db.close()


if __name__ == "__main__":
    manual_cleanup()


def _delete_finished_jobs(db) -> int:
    from .job_worker import delete_finished_jobs

    return delete_finished_jobs(db)
