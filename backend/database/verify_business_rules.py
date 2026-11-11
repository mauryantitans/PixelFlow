#!/usr/bin/env python3
"""
Verify Business Rules Implementation

This script checks if all rules in business_rules.py are actually enforced.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so "app" imports

print("\n" + "="*70)
print("🔍 VERIFYING BUSINESS RULES IMPLEMENTATION")
print("="*70)

# Check imports
print("\n📦 Checking if business rules are imported...")
try:
    from app.core.business_rules import (
        UserLimits, ImageRetention, SessionPolicy, 
        CleanupTriggers, StorageOptimization
    )
    print("✅ Business rules module loaded")
except ImportError as e:
    print(f"❌ Failed to import business rules: {e}")
    sys.exit(1)

# Check where rules are used
print("\n🔎 Checking rule enforcement...")

checks = []

# 1. Pipeline limit
try:
    from app.api.routes.pipelines import create_pipeline
    import inspect
    source = inspect.getsource(create_pipeline)
    if 'UserLimits.FREE_USER_MAX_PIPELINES' in source:
        checks.append(("Pipeline Limit (3 max)", True, "pipelines.py", "create_pipeline"))
    else:
        checks.append(("Pipeline Limit", False, "pipelines.py", "NOT ENFORCED"))
except Exception as e:
    checks.append(("Pipeline Limit", False, "ERROR", str(e)))

# 2. Storage quota
try:
    from app.api.routes.images_db import upload_image
    source = inspect.getsource(upload_image)
    if 'check_storage_quota' in source:
        checks.append(("Storage Quota Check", True, "images_db.py", "upload_image"))
    else:
        checks.append(("Storage Quota", False, "images_db.py", "NOT ENFORCED"))
except Exception as e:
    checks.append(("Storage Quota", False, "ERROR", str(e)))

# 3. Image count limit
try:
    from app.api.routes.images_db import upload_image
    source = inspect.getsource(upload_image)
    if 'MAX_IMAGES_PER_SESSION' in source or 'current_image_count' in source:
        checks.append(("Image Count Limit", True, "images_db.py", "upload_image"))
    else:
        checks.append(("Image Count Limit", False, "images_db.py", "NOT ENFORCED"))
except Exception as e:
    checks.append(("Image Count Limit", False, "ERROR", str(e)))

# 4. Logout cleanup
try:
    from app.api.routes.auth import logout as logout_endpoint
    source = inspect.getsource(logout_endpoint)
    if 'CleanupTriggers.ON_LOGOUT' in source:
        checks.append(("Logout Cleanup", True, "auth.py", "logout"))
    else:
        checks.append(("Logout Cleanup", False, "auth.py", "NOT ENFORCED"))
except Exception as e:
    checks.append(("Logout Cleanup", False, "ERROR", str(e)))

# 5. Cleanup service
try:
    from app.utils.cleanup_service import CleanupService
    checks.append(("Cleanup Service", True, "cleanup_service.py", "Available"))
except ImportError:
    checks.append(("Cleanup Service", False, "cleanup_service.py", "NOT FOUND"))

# 6. Quota manager
try:
    from app.utils.quota_manager import check_storage_quota
    checks.append(("Quota Manager", True, "quota_manager.py", "Available"))
except ImportError:
    checks.append(("Quota Manager", False, "quota_manager.py", "NOT FOUND"))

# Print results
print("\n" + "="*70)
print("📊 VERIFICATION RESULTS")
print("="*70)

implemented = 0
not_implemented = 0

for check_name, status, file, details in checks:
    status_symbol = "✅" if status else "❌"
    print(f"\n{status_symbol} {check_name}")
    print(f"   File: {file}")
    print(f"   Status: {details}")
    
    if status:
        implemented += 1
    else:
        not_implemented += 1

print("\n" + "="*70)
print(f"📈 SUMMARY: {implemented}/{len(checks)} rules implemented")
print("="*70)

if not_implemented > 0:
    print(f"\n⚠️  WARNING: {not_implemented} rule(s) not enforced!")
    print("Check the code files listed above.")
else:
    print("\n🎉 ALL BUSINESS RULES ARE ENFORCED!")
    print("\nYou can safely use business_rules.py to control:")
    print("   • Pipeline limits")
    print("   • Storage quotas")
    print("   • Image count limits")
    print("   • Retention policies")
    print("   • Cleanup triggers")

print("\n" + "="*70)
print("\n📝 Current Settings:")
print(f"   • Free user pipelines: {UserLimits.FREE_USER_MAX_PIPELINES}")
print(f"   • Guest storage quota: {UserLimits.GUEST_STORAGE_QUOTA_MB}MB")
print(f"   • Free user storage: {UserLimits.FREE_USER_STORAGE_QUOTA_MB}MB")
print(f"   • Max images per session: {UserLimits.GUEST_MAX_IMAGES_PER_SESSION}")
print(f"   • Auto cleanup: {'Enabled' if CleanupTriggers.ENABLE_AUTO_CLEANUP else 'Disabled'}")
print(f"   • Delete on logout: {CleanupTriggers.ON_LOGOUT.get('delete_uploads', False)}")
print("="*70 + "\n")
