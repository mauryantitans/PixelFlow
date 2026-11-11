#!/usr/bin/env python3
"""
Debug saved pipelines - see what's actually in the database
"""

import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

from app.core.database import SessionLocal
from app.models.db_models import SavedPipeline, User

def debug_pipelines():
    db = SessionLocal()
    
    try:
        print("\n" + "=" * 70)
        print("🔍 DEBUG SAVED PIPELINES")
        print("=" * 70)
        
        pipelines = db.query(SavedPipeline).all()
        
        if not pipelines:
            print("\n❌ No saved pipelines found")
            return
        
        print(f"\n✅ Found {len(pipelines)} saved pipeline(s):\n")
        
        for i, p in enumerate(pipelines, 1):
            user = db.query(User).filter(User.id == p.user_id).first()
            
            print("=" * 70)
            print(f"Pipeline #{i}")
            print("=" * 70)
            print(f"  ID:          {p.id}")
            print(f"  Name:        {p.name}")
            print(f"  User:        {user.username if user else 'Unknown'}")
            print(f"  Description: {p.description or '(none)'}")
            print(f"  Category:    {p.category or '(none)'}")
            print(f"  Tags:        {p.tags}")
            print(f"  Is Public:   {p.is_public}")
            print(f"  Usage Count: {p.usage_count}")
            print(f"  Created:     {p.created_at}")
            print(f"\n  Pipeline Data Type: {type(p.pipeline_data)}")
            print(f"  Is List/Array:      {isinstance(p.pipeline_data, list)}")
            
            if p.pipeline_data:
                print(f"\n  Pipeline Data (formatted):")
                print(json.dumps(p.pipeline_data, indent=4))
            else:
                print(f"\n  ⚠️  Pipeline Data is None/Empty!")
            
            print()
        
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_pipelines()
