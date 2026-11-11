#!/usr/bin/env python3
"""
Automated Database Backup Script for PixelFlow

This script backs up the PostgreSQL database and manages backup rotation.
Can be run manually or scheduled via cron/Windows Task Scheduler.
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.engine import make_url
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment
env_path = Path(__file__).resolve().parent.parent / ".env"  # backend/.env, same as the app
load_dotenv(dotenv_path=env_path)

# Backup settings
BACKUP_DIR = Path(__file__).parent / "backups"
BACKUP_DIR.mkdir(exist_ok=True)
KEEP_BACKUPS = 10  # Number of backups to keep

DATABASE_URL = os.environ.get("DATABASE_URL")
USE_SQLITE = os.environ.get("USE_SQLITE", "False").lower() == "true"


def _pg_conn():
    """(host, port, user, dbname, env) for pg_dump/psql, from DATABASE_URL.

    Uses SQLAlchemy's URL parser, so postgres:// URLs, missing ports and
    query options such as ?sslmode=require all work.
    """
    url = make_url(DATABASE_URL.replace("postgres://", "postgresql://", 1))
    env = os.environ.copy()
    if url.password:
        env["PGPASSWORD"] = url.password
    sslmode = url.query.get("sslmode")
    if sslmode:
        env["PGSSLMODE"] = sslmode if isinstance(sslmode, str) else sslmode[0]
    return url.host or "localhost", str(url.port or 5432), url.username or "", url.database or "", env

def backup_sqlite():
    """Backup SQLite database"""
    sqlite_path = Path(__file__).resolve().parent.parent / "pixelflow.db"  # the app's SQLite file
    
    if not sqlite_path.exists():
        logger.error("SQLite database file not found!")
        return False
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"pixelflow_sqlite_backup_{timestamp}.db"
    
    logger.info(f"🔄 Backing up SQLite database...")
    logger.info(f"📁 Source: {sqlite_path}")
    logger.info(f"📁 Destination: {backup_file}")
    
    try:
        import shutil
        shutil.copy2(sqlite_path, backup_file)
        
        size_kb = backup_file.stat().st_size / 1024
        logger.info(f"✅ SQLite backup completed successfully!")
        logger.info(f"   Size: {size_kb:.2f} KB")
        
        cleanup_old_backups("pixelflow_sqlite_backup_")
        return True
        
    except Exception as e:
        logger.error(f"❌ SQLite backup failed: {e}")
        return False


def backup_postgresql():
    """Backup PostgreSQL database"""
    if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
        logger.error("❌ Invalid PostgreSQL DATABASE_URL!")
        logger.error("This script is for PostgreSQL backups.")
        logger.error("For SQLite, it will copy the database file.")
        return False
    
    try:
        db_host, db_port, db_user, db_name, env = _pg_conn()
    except Exception as e:
        logger.error(f"❌ Failed to parse DATABASE_URL: {e}")
        return False
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"pixelflow_backup_{timestamp}.sql"
    
    logger.info(f"🔄 Backing up PostgreSQL database: {db_name}")
    logger.info(f"📁 Backup file: {backup_file}")
    
    
    try:
        # Run pg_dump
        result = subprocess.run(
            [
                "pg_dump",
                "-h", db_host,
                "-p", db_port,
                "-U", db_user,
                "-d", db_name,
                "-f", str(backup_file),
                "--clean",  # Include DROP commands
                "--if-exists",  # Add IF EXISTS to DROP commands
                "--no-owner",  # Don't set ownership
                "--no-privileges",  # Don't dump privileges
            ],
            env=env,
            capture_output=True,
            text=True,
            check=True
        )
        
        size_kb = backup_file.stat().st_size / 1024
        logger.info(f"✅ PostgreSQL backup completed successfully!")
        logger.info(f"   Size: {size_kb:.2f} KB")
        
        # Cleanup old backups
        cleanup_old_backups("pixelflow_backup_")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Backup failed: {e.stderr}")
        if backup_file.exists():
            backup_file.unlink()
        return False
    except FileNotFoundError:
        logger.error("❌ pg_dump not found!")
        logger.error("Make sure PostgreSQL client tools are installed and in PATH.")
        logger.error("Windows: Add 'C:\\Program Files\\PostgreSQL\\16\\bin' to PATH")
        return False


def cleanup_old_backups(prefix: str):
    """Keep only the most recent backups"""
    backups = sorted(
        [f for f in BACKUP_DIR.glob(f"{prefix}*") if f.is_file()],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    
    if len(backups) > KEEP_BACKUPS:
        logger.info(f"\n🧹 Cleaning up old backups (keeping {KEEP_BACKUPS} most recent)")
        for old_backup in backups[KEEP_BACKUPS:]:
            try:
                old_backup.unlink()
                logger.info(f"   Deleted: {old_backup.name}")
            except Exception as e:
                logger.error(f"   Failed to delete {old_backup.name}: {e}")


def list_backups():
    """List all available backups"""
    backups = sorted(
        [*BACKUP_DIR.glob("pixelflow_*backup_*.sql"), *BACKUP_DIR.glob("pixelflow_*backup_*.db")],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    
    if not backups:
        logger.info("📦 No backups found")
        return
    
    logger.info(f"\n📦 Available backups ({len(backups)}):")
    logger.info("="*70)
    
    for backup in backups:
        size = backup.stat().st_size / 1024
        mtime = datetime.fromtimestamp(backup.stat().st_mtime)
        db_type = "SQLite" if backup.suffix == ".db" else "PostgreSQL"
        logger.info(f"  • {backup.name}")
        logger.info(f"    Type: {db_type} | Size: {size:.2f} KB | Created: {mtime.strftime('%Y-%m-%d %H:%M:%S')}")
    
    logger.info("="*70)


def main():
    """Main backup function"""
    logger.info("\n" + "="*70)
    logger.info("PixelFlow Database Backup")
    logger.info("="*70)
    
    # Determine database type
    if USE_SQLITE:
        logger.info("\n📍 Database Type: SQLite")
        success = backup_sqlite()
    else:
        logger.info("\n📍 Database Type: PostgreSQL")
        success = backup_postgresql()
    
    if success:
        logger.info("\n" + "="*70)
        logger.info("🎉 BACKUP COMPLETED SUCCESSFULLY")
        logger.info("="*70)
        list_backups()
    else:
        logger.info("\n" + "="*70)
        logger.info("❌ BACKUP FAILED")
        logger.info("="*70)
        sys.exit(1)


if __name__ == "__main__":
    main()
