#!/usr/bin/env python3
"""
Manual Database Cleanup Script for PixelFlow

Run this script to clean up:
- Expired sessions
- Old uploaded images
- Old processed images
- Orphaned data

Retention periods come from the admin panel (Admin -> Retention). Runs even
when automatic cleanup is switched off.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

from app.utils.cleanup_service import manual_cleanup

if __name__ == "__main__":
    print("\n🧹 Starting manual database cleanup...")
    print("📋 Retention periods from the admin settings (system_settings table)\n")
    
    manual_cleanup()
