#!/usr/bin/env python3
"""
Database Initialization Script for PixelFlow

This script helps you set up the PixelFlow database and create an admin user.
"""

import sys
from pathlib import Path
from getpass import getpass

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

try:
    from app.core.database import SessionLocal, init_db
    from app.models.db_models import User
    from app.utils.auth import get_password_hash
    from app.core.config import settings
except ImportError as e:
    print(f"Error importing required modules: {e}")
    print("Please make sure you've installed all requirements:")
    print("pip install -r requirements.txt")
    sys.exit(1)


def create_admin_user():
    """Create an admin user interactively"""
    print("\n" + "="*50)
    print("Create Admin User")
    print("="*50)
    
    email = input("Enter admin email: ").strip()
    username = input("Enter admin username: ").strip()
    full_name = input("Enter full name (optional): ").strip() or None
    
    while True:
        password = getpass("Enter password (min 8 characters): ")
        if len(password) < 8:
            print("❌ Password must be at least 8 characters long!")
            continue
        
        password_confirm = getpass("Confirm password: ")
        if password != password_confirm:
            print("❌ Passwords don't match!")
            continue
        
        break
    
    # Create user
    db = SessionLocal()
    try:
        # Check if user exists
        existing_user = db.query(User).filter(
            (User.email == email) | (User.username == username)
        ).first()
        
        if existing_user:
            print(f"\n❌ User with email '{email}' or username '{username}' already exists!")
            return False
        
        # Create admin user
        admin_user = User(
            email=email,
            username=username,
            full_name=full_name,
            hashed_password=get_password_hash(password),
            is_active=True,
            is_admin=True
        )
        
        db.add(admin_user)
        db.commit()
        
        print("\n✅ Admin user created successfully!")
        print(f"   Email: {email}")
        print(f"   Username: {username}")
        return True
        
    except Exception as e:
        print(f"\n❌ Error creating admin user: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def main():
    """Main function"""
    print("\n" + "="*50)
    print("PixelFlow Database Initialization")
    print("="*50)
    print(f"\nDatabase URL: {settings.DATABASE_URL}")
    print(f"Using SQLite: {settings.USE_SQLITE}")
    
    # Initialize database
    print("\n📦 Initializing database tables...")
    try:
        init_db()
        print("✅ Database tables created successfully!")
    except Exception as e:
        print(f"❌ Error creating database tables: {e}")
        print("\nPlease check your database configuration in .env file")
        sys.exit(1)
    
    # Create admin user
    print("\n👤 Let's create an admin user...")
    while True:
        if create_admin_user():
            break
        
        retry = input("\nWould you like to try again? (y/n): ").strip().lower()
        if retry != 'y':
            break
    
    print("\n" + "="*50)
    print("Setup Complete!")
    print("="*50)
    print("\n🚀 You can now start the PixelFlow backend:")
    print("   python run.py")
    print("\n📚 API documentation will be available at:")
    print(f"   http://{settings.HOST}:{settings.PORT}/docs")
    print("\n✨ Happy processing!\n")


if __name__ == "__main__":
    main()
