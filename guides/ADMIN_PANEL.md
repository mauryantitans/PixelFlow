# Admin Panel Guide

Complete guide to using PixelFlow's admin tools for managing users, quotas, and system settings.

---

## 🔐 **Accessing Admin Panel**

### **Requirements**
- Admin account (is_admin = True in database)
- Logged into PixelFlow

### **How to Access**

1. Log in as admin user
2. Click on your **user menu** (top right)
3. Click **"Admin Tools"**
4. Admin panel opens

---

## 📊 **Admin Panel Overview**

The admin panel has **5 tabs**:

1. **Limits** - Configure user quotas and upload limits
2. **Cleanup** - Manual cleanup tools and statistics
3. **Storage** - View storage usage and session statistics
4. **Retention** - Configure data retention policies
5. **Database** - View/manage users, images, and pipelines (PIN-protected)

---

## 🎛️ **Tab 1: Limits**

Configure system-wide limits and quotas.

### **Pipeline Limits**

**Free User Max Saved Pipelines**
- Default: 3 pipelines
- Range: 1-100
- Controls how many pipelines a free user can save

### **Storage Quotas**

**Guest Users**
- Default: 50 MB
- Range: 10-1000 MB
- Total storage for anonymous users

**Registered Users**
- Default: 500 MB
- Range: 100-10,000 MB
- Total storage for authenticated users

### **Image Upload Limits**

**Guest Max Images/Session**
- Default: 50 images
- Controls total images a guest can upload in one session

**User Max Images/Session**
- Default: 100 images
- Controls total images a registered user can have

**Max Images Per Upload**
- Default: 20 images
- Controls how many images can be uploaded at once

### **Quota Behavior**

**Auto-delete oldest when quota exceeded**
- Default: OFF (recommended)
- When OFF: Shows popup warning, user must delete manually
- When ON: Automatically deletes oldest images (not recommended)

**Warn at Percentage**
- Default: 80%
- Shows warning when user reaches this % of quota

---

## 🧹 **Tab 2: Cleanup**

Manual cleanup tools and statistics.

### **Current Behavior**

**What Gets Cleaned** (automatically every 15 minutes while auto-cleanup is on, or now with the button):
- Sessions whose lifetime and grace period have passed since their last activity
- Uploads and processed images older than the Retention tab's periods
- Orphaned images (no valid session/user) and expired refresh tokens

**What Doesn't Get Cleaned:**
- Active user images
- Recent uploads (within retention period)
- Saved pipelines (never auto-deleted)

### **Cleanup Statistics**

**Expired Sessions**
- Count of sessions past their lifetime plus the grace period
- Safe to delete

**Orphaned Images**
- Images with no associated session or user
- Usually from bugs or crashes
- Safe to delete

### **"Run Cleanup Now" Button**

**What it does:**
- Runs the same job as the background scheduler, immediately
- Deletes expired sessions, old uploads/results, orphaned images
- Follows the Retention tab's settings
- Safe maintenance operation

**When to use:**
- Regular database maintenance
- After fixing bugs
- When storage is filling up

---

## 💾 **Tab 3: Storage**

View real-time storage and session statistics.

### **Statistics Cards**

**Uploaded**
- Total count of uploaded images in database

**Processed**
- Total count of processed/result images

**Storage**
- Total disk space used by images (in MB)

**Sessions**
- Active sessions (activity in the last 15 minutes: upload, opening the workspace, processing)

### **Breakdown**

- Guest images vs User images
- Total users
- Total pipelines

### **Special Tools**

**"Fix Orphaned Images" Button**
- Reassigns guest images to their rightful owners
- Uses session data to find correct user
- Run this if you see high guest image counts

**"Delete ALL Images" Button** ⚠️
- **DANGER ZONE**
- Permanently deletes EVERY image
- Requires typing "DELETE" twice
- Use only for complete reset

---

## ⏰ **Tab 4: Retention**

Configure how long data is kept before auto-cleanup.

### **Upload Retention**

**Guest Uploads**
- Default: 24 hours
- How long to keep guest uploaded images
- Older images auto-deleted by background job

**User Uploads**
- Default: 7 days
- How long to keep authenticated user uploads
- Users can delete manually anytime

### **Processed Image Retention**

**Why shorter?** Processed images can be regenerated from originals, so they don't need long retention.

**Guest Processed**
- Default: 1 hour
- Temporary results for guest users

**User Processed**
- Default: 24 hours
- Results for authenticated users

### **Automatic Cleanup and Sessions**

- **Automatic cleanup** (on by default): the server runs the cleanup job every 15 minutes. Turn it off to keep everything until you run cleanup by hand.
- **Guest session lifetime** (default 24 h) and **user session lifetime** (default 7 days): how long a session lives after its *last activity*. Activity slides the expiry forward.
- **Grace period** (default 2 h): extra time after expiry before the session is deleted.

Values are validated on save; an out-of-range value is rejected with a message and nothing is changed.

**Adjust based on:**
- Available storage
- User expectations
- Legal requirements

---

## 🗄️ **Tab 5: Database (PIN-Protected)**

View and manage users, their images, and pipelines.

### **PIN Protection**

First time accessing:
1. Toggle **"View User Data"** ON
2. **Create a 4-6 digit PIN**

Subsequent times:
1. Toggle **"View User Data"** ON
2. **Enter your PIN**

The server checks the PIN, not the browser. A correct PIN gives this browser 15 minutes of
access to user data (an httpOnly cookie bound to your admin account); after that you are asked
again. Changing an existing PIN requires the current one. Five wrong PINs lock PIN entry for
15 minutes.

### **Users Overview**

**Table shows:**
- Email address
- Username
- Account type (Admin, OAuth, Regular)
- Image count
- Pipeline count
- **"View Details"** button

**Actions:**
- Click "View Details" to see user's data

### **User Details View**

When viewing a specific user:

**Header shows:**
- User email and username
- Account badges (Admin, OAuth provider)
- Total image and pipeline counts
- **"Delete User" button**

**Two tabs:**

#### **Images Tab**
- Grid of all user's uploaded images
- Shows: Thumbnail, filename, dimensions, size, format, date
- **"Delete" button** on each image
- Deleting updates count instantly

#### **Pipelines Tab**
- List of all user's saved pipelines
- Shows: Name, description, operation count, dates
- **"Delete" button** on each pipeline
- Deleting updates count instantly

### **Delete User**

**What it deletes:**
- ✅ User account
- ✅ All uploaded images
- ✅ All processed images
- ✅ All saved pipelines
- ✅ All sessions
- ✅ All processing history
- ✅ All login attempts

**How to delete:**
1. Click **"Delete User"** (red button)
2. Read warning carefully
3. Type **"DELETE"** in prompt
4. Confirm
5. User and all data removed

**Safety features:**
- ⚠️ Cannot delete yourself
- ⚠️ Requires typing "DELETE"
- ⚠️ Cannot be undone

---

## 📈 **Understanding Session Tracking**

### **Active Sessions**

A session is **active** if it had activity in the last **15 minutes**: an upload, opening the
workspace, or processing an image. There is no heartbeat; the header's connection badge only
checks `GET /api/health` and never touches sessions.

**Session Status:**
- 🟢 **Active**: activity in the last 15 min
- 💤 **Idle**: not active, but not yet expired
- ⏰ **Expired**: past its lifetime since the last activity (deleted after the grace period)

### **Session Lifecycle**

```
First upload → Active → Idle (15 min) → Expired (lifetime after last activity) → Deleted (after grace)
```

A session belongs to whoever is signed in when it is created. Another account can't use it
(409), and a signed-out owner is asked to sign in again (401). Signing out starts a fresh guest
session; signing back in restores the account's session in that browser.

---

## ⚙️ **Changing Settings**

### **How to Edit**

1. Go to any settings tab (Limits, Retention)
2. **Adjust values** using input fields or toggles
3. **Orange "Unsaved changes"** indicator appears
4. Click **"Save Changes"** (green button)
5. Settings apply immediately

### **Settings Persistence**

- ✅ Saved in database (system_settings table)
- ✅ Survive server restarts
- ✅ Applied to all users immediately
- ✅ Tracked with timestamp and admin who changed them

### **Reverting Changes**

**Option 1: Refresh without saving**
- Close admin panel
- Reopen it
- Changes discarded

**Option 2: Edit values back**
- Change values to original
- Click "Save Changes"

---

## 🔄 **Real-Time Updates**

### **Manual Refresh**

Click the **"Refresh"** button to update:
- Current counts
- Storage usage
- Session statistics

### **After Actions**

Counts update automatically after:
- Deleting images
- Deleting pipelines
- Deleting users
- Running cleanup
- Saving settings

---

## 🛡️ **Security Features**

### **PIN Protection**

**Why?**
- Protects sensitive user data (emails, images)
- Prevents unauthorized database access
- Required for viewing user details

**PIN Requirements:**
- 4-6 digits
- Stored as a hash
- Enforced by the server on every user-data endpoint; the grant lasts 15 minutes

### **Admin-Only Access**

**Who can access:**
- ✅ Users with `is_admin = True`
- ❌ Regular users (no Admin Tools button)
- ❌ Guest users (no account)

**How to make someone admin:**
```bash
# Via database
python -c "from app.core.database import get_db; from app.models.db_models import User; db = next(get_db()); user = db.query(User).filter(User.email == 'email@example.com').first(); user.is_admin = True; db.commit()"

# Or via SQL
sqlite3 pixelflow.db
UPDATE users SET is_admin = 1 WHERE email = 'email@example.com';
```

---

## 📊 **Monitoring Best Practices**

### **Daily Checks**

- [ ] Check active sessions count
- [ ] Monitor storage usage
- [ ] Review any orphaned images
- [ ] Check for unusual activity

### **Weekly Maintenance**

- [ ] Run manual cleanup
- [ ] Review user growth
- [ ] Check database size
- [ ] Backup database

### **Monthly Reviews**

- [ ] Adjust quotas if needed
- [ ] Review retention policies
- [ ] Check security logs
- [ ] Update documentation

---

## ⚠️ **Dangerous Operations**

These operations **cannot be undone**:

### **Delete User**
- Removes user and ALL their data
- Requires typing "DELETE"
- Cannot delete yourself

### **Delete ALL Images**
- Removes EVERY image from database
- Requires typing "DELETE" twice
- Ignores retention policies
- **Use with extreme caution**

### **When to Use Dangerous Operations**

✅ **Good reasons:**
- Testing/development reset
- Removing spam accounts
- Cleaning after data import errors

❌ **Bad reasons:**
- Trying to free space (use cleanup instead)
- Angry at a user (deactivate instead)
- Impatience (cleanup runs automatically)

---

## 📋 **Common Admin Tasks**

### **Task 1: Increase User's Storage**

**Problem**: User needs more storage

**Solution:**
1. Admin Panel → Limits tab
2. Increase "Registered Users (MB)"
3. Save Changes
4. User can now upload more

### **Task 2: Clear Old Data**

**Problem**: Database getting large

**Solution:**
1. Admin Panel → Cleanup tab
2. Click "Run Cleanup Now"
3. Check stats before/after
4. Optionally adjust retention policies

### **Task 3: Find Specific User's Data**

**Problem**: User reports issue with their images

**Solution:**
1. Admin Panel → Database tab
2. Enable "View User Data" (enter PIN)
3. Find user in table (search by email)
4. Click "View Details"
5. Check their images and pipelines

### **Task 4: Remove Spam Account**

**Problem**: Fake/spam user account

**Solution:**
1. Admin Panel → Database tab
2. Find user
3. Click "View Details"
4. Click "Delete User"
5. Confirm deletion

---

## 🔔 **Tips for Admins**

### **1. Set Reasonable Quotas**

Don't set quotas too high:
- Storage fills up quickly
- Higher maintenance costs
- Harder to manage

Don't set too low:
- Users get frustrated
- Limits productivity
- More support requests

**Sweet spot:**
- Guests: 50 MB (10-20 images)
- Users: 500 MB (100-200 images)

### **2. Regular Maintenance**

Set a schedule:
- **Daily**: Quick glance at stats
- **Weekly**: Run manual cleanup
- **Monthly**: Review and adjust policies

### **3. Monitor Growth**

Track:
- New user signups per week
- Storage growth rate
- Popular operations
- Peak usage times

### **4. Communicate Changes**

Before changing quotas:
- Notify users
- Give advance warning
- Explain reasons

---

## 🆘 **Emergency Procedures**

### **Database Full**

**Immediate actions:**
1. Admin Panel → Cleanup → "Run Cleanup Now"
2. Admin Panel → Storage → Check guest_images count
3. If high, click "Fix Orphaned Images"
4. If still full, increase retention periods temporarily
5. Contact users with highest storage usage

### **User Locked Out**

**Problem**: User can't log in

**Check:**
1. Admin Panel → Database → Find user
2. Verify account is active
3. Check if too many failed login attempts
4. Reset password via: `python reset_password.py`

### **Suspicious Activity**

**Problem**: Unusual usage patterns

**Actions:**
1. Check active sessions count (should match expected users)
2. Review upload patterns
3. Check for spam accounts
4. Deactivate suspicious accounts
5. Review security logs

---

## 📚 **Related Guides**

- [Database Setup](DATABASE_SETUP.md) - Direct database access
- [Deployment Guide](DEPLOYMENT.md) - Production admin setup
- [API Reference](API_REFERENCE.md) - Admin API endpoints

---

**Master the admin panel to keep PixelFlow running smoothly! 🛠️**
