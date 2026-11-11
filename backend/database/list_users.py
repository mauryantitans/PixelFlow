#!/usr/bin/env python3
"""
List all users in the PixelFlow database
"""

import sys
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

try:
    from app.core.database import SessionLocal
    from app.models.db_models import User
except ImportError as e:
    print(f"Error importing required modules: {e}")
    print("Make sure you're running this from the backend directory")
    sys.exit(1)

def list_users():
    """List all users in the database"""
    db = SessionLocal()
    
    try:
        users = db.query(User).all()
        
        print("\n" + "=" * 70)
        print("📋 PIXELFLOW DATABASE - ALL USERS")
        print("=" * 70)
        
        if not users:
            print("\n❌ No users found in database!")
            print("\nTo create a user, run: python init_db.py")
        else:
            print(f"\n✅ Found {len(users)} user(s):\n")
            
            for i, user in enumerate(users, 1):
                print(f"{'=' * 70}")
                print(f"User #{i}")
                print(f"{'=' * 70}")
                print(f"  ID:           {user.id}")
                print(f"  Email:        {user.email}")
                print(f"  Username:     {user.username}")
                print(f"  Full Name:    {user.full_name or '(not set)'}")
                print(f"  Is Active:    {user.is_active}")
                print(f"  Is Admin:     {user.is_admin}")
                print(f"  Created:      {user.created_at}")
                print(f"  Updated:      {user.updated_at or '(never)'}")
                print()
        
        print("=" * 70)
        print("\n💡 To test login, use:")
        print("   Email: <one of the emails above>")
        print("   Password: <the password you entered during registration>")
        print("\n⚠️  Passwords are hashed - you need to remember what you entered!")
        print("=" * 70 + "\n")
        
    except Exception as e:
        print(f"\n❌ Error reading database: {e}")
        print("Make sure the database exists (run: python init_db.py)")
    finally:
        db.close()

if __name__ == "__main__":
    list_users()
