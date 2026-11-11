#!/usr/bin/env python3
"""
Reset a user's password in PixelFlow database
"""

import sys
from pathlib import Path
from getpass import getpass

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

try:
    from app.core.database import SessionLocal
    from app.models.db_models import User
    from app.utils.auth import get_password_hash
except ImportError as e:
    print(f"Error importing required modules: {e}")
    print("Make sure you're running this from the backend directory")
    sys.exit(1)

def reset_password():
    """Reset a user's password"""
    db = SessionLocal()
    
    try:
        # List users
        users = db.query(User).all()
        
        if not users:
            print("\n❌ No users found in database!")
            print("Run: python init_db.py to create a user")
            return
        
        print("\n" + "=" * 60)
        print("🔑 PIXELFLOW - RESET USER PASSWORD")
        print("=" * 60)
        print("\nAvailable users:")
        
        for i, user in enumerate(users, 1):
            admin_badge = " [ADMIN]" if user.is_admin else ""
            print(f"  {i}. {user.email} ({user.username}){admin_badge}")
        
        # Get user selection
        while True:
            try:
                selection = int(input(f"\nSelect user (1-{len(users)}): "))
                if 1 <= selection <= len(users):
                    break
                print(f"❌ Please enter a number between 1 and {len(users)}")
            except ValueError:
                print("❌ Please enter a valid number")
        
        selected_user = users[selection - 1]
        
        print(f"\n✅ Selected user: {selected_user.email} ({selected_user.username})")
        
        # Get new password
        while True:
            password = getpass("\nEnter new password (min 8 characters): ")
            if len(password) < 8:
                print("❌ Password must be at least 8 characters long!")
                continue
            
            password_confirm = getpass("Confirm new password: ")
            if password != password_confirm:
                print("❌ Passwords don't match!")
                continue
            
            break
        
        # Update password
        selected_user.hashed_password = get_password_hash(password)
        db.commit()
        
        print("\n✅ Password updated successfully!")
        print(f"\nYou can now login with:")
        print(f"  Email:    {selected_user.email}")
        print(f"  Password: <the password you just entered>")
        print("=" * 60 + "\n")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reset_password()
