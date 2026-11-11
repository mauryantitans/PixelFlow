"""
DEPRECATED - not used by the app any more.

This tracked sessions in memory and deleted per-session folders from the old
filesystem image storage, which was removed when images moved into the
database. Its periodic task never cleaned the database. Database cleanup now
runs from app/utils/cleanup_scheduler.py. Kept only so nothing that imports it
breaks; safe to delete.
"""
import asyncio
import shutil
import signal
import sys
import atexit
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Set
import logging
from ..core.config import settings

logger = logging.getLogger(__name__)

class SessionManager:
    """Manages user sessions and file cleanup"""
    
    def __init__(self):
        self.active_sessions: Set[str] = set()
        self.session_last_activity: Dict[str, datetime] = {}
        self.cleanup_task = None
        self.shutdown_requested = False
        
        # Register cleanup handlers
        self._register_cleanup_handlers()
    
    def _register_cleanup_handlers(self):
        """Register cleanup handlers for graceful shutdown"""
        atexit.register(self.cleanup_all_files)
        
        # Signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        # Windows-specific signal
        if sys.platform == "win32":
            try:
                signal.signal(signal.SIGBREAK, self._signal_handler)
            except AttributeError:
                pass  # SIGBREAK not available on all Windows versions
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.shutdown_requested = True
        self.cleanup_all_files()
        sys.exit(0)
    
    def create_session_directories(self, session_id: str) -> tuple[Path, Path]:
        """Create session-specific directories"""
        try:
            session_upload_dir = settings.UPLOAD_DIR / session_id
            session_processed_dir = settings.PROCESSED_DIR / session_id
            
            session_upload_dir.mkdir(parents=True, exist_ok=True)
            session_processed_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectories
            (session_upload_dir / "thumbnails").mkdir(exist_ok=True)
            (session_processed_dir / "intermediate").mkdir(exist_ok=True)
            (session_processed_dir / "final").mkdir(exist_ok=True)
            
            return session_upload_dir, session_processed_dir
        except Exception as e:
            logger.error(f"Error creating session directories for {session_id}: {e}")
            raise
    
    def register_session(self, session_id: str):
        """Register a new session"""
        try:
            self.active_sessions.add(session_id)
            self.session_last_activity[session_id] = datetime.now()
            self.create_session_directories(session_id)
            logger.info(f"Session registered: {session_id}")
        except Exception as e:
            logger.error(f"Error registering session {session_id}: {e}")
            raise
    
    def update_session_activity(self, session_id: str):
        """Update last activity time for a session"""
        if session_id in self.active_sessions:
            self.session_last_activity[session_id] = datetime.now()
    
    def cleanup_session_files(self, session_id: str) -> bool:
        """Clean up all files for a specific session"""
        try:
            session_upload_dir = settings.UPLOAD_DIR / session_id
            session_processed_dir = settings.PROCESSED_DIR / session_id
            
            # Remove directories if they exist
            if session_upload_dir.exists():
                shutil.rmtree(session_upload_dir)
                logger.info(f"Removed upload directory for session: {session_id}")
            
            if session_processed_dir.exists():
                shutil.rmtree(session_processed_dir)
                logger.info(f"Removed processed directory for session: {session_id}")
            
            # Remove from tracking
            self.active_sessions.discard(session_id)
            self.session_last_activity.pop(session_id, None)
            
            logger.info(f"Session cleanup completed: {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {e}")
            return False
    
    def cleanup_all_files(self):
        """Clean up all temporary files"""
        try:
            # Clean up upload directory
            if settings.UPLOAD_DIR.exists():
                shutil.rmtree(settings.UPLOAD_DIR)
                settings.UPLOAD_DIR.mkdir(exist_ok=True)
                logger.info("Cleaned up all upload files")
            
            # Clean up processed directory
            if settings.PROCESSED_DIR.exists():
                shutil.rmtree(settings.PROCESSED_DIR)
                settings.PROCESSED_DIR.mkdir(exist_ok=True)
                logger.info("Cleaned up all processed files")
            
            # Clear session tracking
            self.active_sessions.clear()
            self.session_last_activity.clear()
            
            logger.info("Complete file cleanup finished")
            
        except Exception as e:
            logger.error(f"Error during complete cleanup: {e}")
    
    def get_inactive_sessions(self) -> list[str]:
        """Get list of sessions that have been inactive for too long"""
        now = datetime.now()
        timeout = timedelta(seconds=settings.SESSION_TIMEOUT)
        
        inactive_sessions = [
            session_id for session_id, last_activity in self.session_last_activity.items()
            if now - last_activity > timeout
        ]
        
        return inactive_sessions
    
    async def periodic_cleanup(self):
        """Periodically clean up inactive sessions"""
        logger.info("Starting periodic cleanup task")
        
        while not self.shutdown_requested:
            try:
                # Wait for cleanup interval
                await asyncio.sleep(settings.CLEANUP_INTERVAL)
                
                # Find and clean up inactive sessions
                inactive_sessions = self.get_inactive_sessions()
                
                if inactive_sessions:
                    logger.info(f"Found {len(inactive_sessions)} inactive sessions to clean up")
                    
                    for session_id in inactive_sessions:
                        success = self.cleanup_session_files(session_id)
                        if success:
                            logger.info(f"Cleaned up inactive session: {session_id}")
                        else:
                            logger.warning(f"Failed to clean up session: {session_id}")
                
            except asyncio.CancelledError:
                logger.info("Periodic cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
                # Continue running despite errors
                continue
    
    async def start_cleanup_task(self):
        """Start the periodic cleanup background task"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.periodic_cleanup())
            logger.info("Periodic cleanup task started")
    
    async def stop_cleanup_task(self):
        """Stop the periodic cleanup background task"""
        if self.cleanup_task and not self.cleanup_task.done():
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Periodic cleanup task stopped")
    
    def get_session_stats(self) -> dict:
        """Get statistics about active sessions"""
        return {
            "active_sessions": len(self.active_sessions),
            "sessions": list(self.active_sessions),
            "oldest_activity": min(self.session_last_activity.values()) if self.session_last_activity else None,
            "newest_activity": max(self.session_last_activity.values()) if self.session_last_activity else None,
        }
    
    def is_session_active(self, session_id: str) -> bool:
        """Check if a session is still active"""
        return session_id in self.active_sessions

# Global session manager instance
session_manager = SessionManager()