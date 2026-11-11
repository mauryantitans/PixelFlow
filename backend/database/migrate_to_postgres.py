#!/usr/bin/env python3
"""
Migrate data from SQLite to PostgreSQL
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

from app.core.config import settings
from app.core.database import engine, Base
from app.models.db_models import User, SavedPipeline, ProcessingHistory, APIKey
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def migrate():
    """Migrate data from SQLite to PostgreSQL"""
    
    # SQLite connection
    sqlite_path = Path(__file__).resolve().parent.parent / "pixelflow.db"  # the app's SQLite file (backend/)
    sqlite_url = f"sqlite:///{sqlite_path}"
    sqlite_engine = create_engine(sqlite_url)
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    sqlite_db = SQLiteSession()
    
    # PostgreSQL connection (from settings)
    postgres_db_session = sessionmaker(bind=engine)
    postgres_db = postgres_db_session()
    
    print("\n" + "="*70)
    print("🔄 MIGRATING DATA: SQLite → PostgreSQL")
    print("="*70)
    
    try:
        # Create tables in PostgreSQL
        print("\n📦 Creating PostgreSQL tables...")
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created!")
        
        # Migrate Users
        print("\n👥 Migrating users...")
        users = sqlite_db.query(User).all()
        print(f"   Found {len(users)} users")
        
        user_map = {}  # SQLite ID -> PostgreSQL ID mapping
        
        for user in users:
            # Check if user already exists
            existing = postgres_db.query(User).filter(User.email == user.email).first()
            if not existing:
                # Create new user dict with all fields
                user_data = {
                    'email': user.email,
                    'username': user.username,
                    'full_name': user.full_name,
                    'hashed_password': user.hashed_password,
                    'is_active': user.is_active,
                    'is_admin': user.is_admin,
                    'created_at': user.created_at,
                    'updated_at': user.updated_at
                }
                new_user = User(**user_data)
                postgres_db.add(new_user)
                postgres_db.flush()  # Get the new ID
                user_map[user.id] = new_user.id
                print(f"   ✓ Migrated: {user.email} (ID: {user.id} → {new_user.id})")
            else:
                user_map[user.id] = existing.id
                print(f"   ⊗ Skipped (exists): {user.email}")
        
        postgres_db.commit()
        print(f"✅ Users migrated!")
        
        # Migrate SavedPipelines
        print("\n🔧 Migrating saved pipelines...")
        pipelines = sqlite_db.query(SavedPipeline).all()
        print(f"   Found {len(pipelines)} pipelines")
        
        pipeline_map = {}  # SQLite ID -> PostgreSQL ID mapping
        
        for pipeline in pipelines:
            if pipeline.user_id in user_map:
                existing = postgres_db.query(SavedPipeline).filter(
                    SavedPipeline.name == pipeline.name, 
                    SavedPipeline.user_id == user_map[pipeline.user_id]
                ).first()
                
                if not existing:
                    pipeline_data = {
                        'user_id': user_map[pipeline.user_id],
                        'name': pipeline.name,
                        'description': pipeline.description,
                        'pipeline_data': pipeline.pipeline_data,
                        'is_public': pipeline.is_public,
                        'is_template': pipeline.is_template,
                        'category': pipeline.category,
                        'tags': pipeline.tags,
                        'thumbnail_data': pipeline.thumbnail_data,
                        'usage_count': pipeline.usage_count,
                        'created_at': pipeline.created_at,
                        'updated_at': pipeline.updated_at
                    }
                    new_pipeline = SavedPipeline(**pipeline_data)
                    postgres_db.add(new_pipeline)
                    postgres_db.flush()
                    pipeline_map[pipeline.id] = new_pipeline.id
                    print(f"   ✓ Migrated: {pipeline.name}")
                else:
                    pipeline_map[pipeline.id] = existing.id
                    print(f"   ⊗ Skipped: {pipeline.name}")
        
        postgres_db.commit()
        print(f"✅ Pipelines migrated!")
        
        # Migrate Processing History
        print("\n📊 Migrating processing history...")
        histories = sqlite_db.query(ProcessingHistory).all()
        print(f"   Found {len(histories)} history records")
        
        migrated_count = 0
        for history in histories:
            if history.user_id in user_map:
                history_data = {
                    'user_id': user_map[history.user_id],
                    'pipeline_id': pipeline_map.get(history.pipeline_id) if history.pipeline_id else None,
                    'image_count': history.image_count,
                    'pipeline_data': history.pipeline_data,
                    'total_processing_time': history.total_processing_time,
                    'average_time_per_image': history.average_time_per_image,
                    'step_timings': history.step_timings,
                    'success': history.success,
                    'error_message': history.error_message,
                    'session_id': history.session_id,
                    'created_at': history.created_at
                }
                new_history = ProcessingHistory(**history_data)
                postgres_db.add(new_history)
                migrated_count += 1
        
        postgres_db.commit()
        print(f"✅ Processing history migrated! ({migrated_count} records)")
        
        # Migrate API Keys
        print("\n🔑 Migrating API keys...")
        api_keys = sqlite_db.query(APIKey).all()
        print(f"   Found {len(api_keys)} API keys")
        
        migrated_keys = 0
        for key in api_keys:
            if key.user_id in user_map:
                key_data = {
                    'user_id': user_map[key.user_id],
                    'key_name': key.key_name,
                    'key_hash': key.key_hash,
                    'key_prefix': key.key_prefix,
                    'is_active': key.is_active,
                    'last_used_at': key.last_used_at,
                    'expires_at': key.expires_at,
                    'created_at': key.created_at
                }
                new_key = APIKey(**key_data)
                postgres_db.add(new_key)
                migrated_keys += 1
        
        postgres_db.commit()
        print(f"✅ API keys migrated! ({migrated_keys} keys)")
        
        print("\n" + "="*70)
        print("🎉 MIGRATION COMPLETE!")
        print("="*70)
        print("\n✅ All data successfully migrated to PostgreSQL!")
        print(f"\n📊 Summary:")
        print(f"   • Users: {len(users)}")
        print(f"   • Pipelines: {len(pipelines)}")
        print(f"   • Processing History: {migrated_count}")
        print(f"   • API Keys: {migrated_keys}")
        print("\n💡 Your SQLite database (pixelflow.db) is still intact")
        print("   You can keep it as a backup or delete it later")
        print("\n🚀 Start your server with: python run.py")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n❌ Migration error: {e}")
        postgres_db.rollback()
        import traceback
        traceback.print_exc()
    finally:
        sqlite_db.close()
        postgres_db.close()

if __name__ == "__main__":
    # Check if we're configured for PostgreSQL
    if settings.USE_SQLITE:
        print("\n❌ Error: USE_SQLITE is still True in .env!")
        print("Please set USE_SQLITE=False and configure DATABASE_URL")
        sys.exit(1)
    
    if "sqlite" in settings.DATABASE_URL.lower():
        print("\n❌ Error: DATABASE_URL still points to SQLite!")
        print("Please configure your PostgreSQL DATABASE_URL in .env")
        sys.exit(1)
    
    print(f"\n📍 Source: SQLite (pixelflow.db)")
    print(f"📍 Target: {settings.DATABASE_URL.split('@')[1]}")
    
    confirm = input("\n⚠️  Ready to migrate? This will copy all data to PostgreSQL. (yes/no): ")
    if confirm.lower() in ['yes', 'y']:
        migrate()
    else:
        print("\n❌ Migration cancelled.")
