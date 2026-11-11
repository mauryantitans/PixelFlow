#!/usr/bin/env python3
"""
Debug script to check database image storage
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

from app.core.database import SessionLocal
from app.models.db_models import Session, UploadedImage, ProcessedImage

def debug_images():
    """Debug image storage"""
    db = SessionLocal()
    
    try:
        # Check sessions
        sessions = db.query(Session).all()
        print("\n" + "="*70)
        print(f"📋 SESSIONS ({len(sessions)})")
        print("="*70)
        for session in sessions:
            print(f"\nSession ID: {session.id}")
            print(f"  User ID: {session.user_id}")
            print(f"  Created: {session.created_at}")
            print(f"  Last Active: {session.last_active}")
            print(f"  Expires: {session.expires_at}")
            
            # Count images
            image_count = db.query(UploadedImage).filter(
                UploadedImage.session_id == session.id
            ).count()
            print(f"  Images: {image_count}")
        
        # Check uploaded images
        images = db.query(UploadedImage).all()
        print("\n" + "="*70)
        print(f"📸 UPLOADED IMAGES ({len(images)})")
        print("="*70)
        for img in images[:10]:  # Show first 10
            print(f"\nImage ID: {img.id}")
            print(f"  Filename: {img.filename}")
            print(f"  Session: {img.session_id}")
            print(f"  Size: {img.size_bytes / 1024:.2f} KB")
            print(f"  Dimensions: {img.width}x{img.height}")
            print(f"  Uploaded: {img.uploaded_at}")
        
        if len(images) > 10:
            print(f"\n... and {len(images) - 10} more images")
        
        # Check processed images
        processed = db.query(ProcessedImage).all()
        print("\n" + "="*70)
        print(f"🎨 PROCESSED IMAGES ({len(processed)})")
        print("="*70)
        
        print("\n" + "="*70)
        print("✅ DATABASE DEBUG COMPLETE")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_images()
