# 📝 Changelog

All notable changes to PixelFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### ✨ Added
- **Expression** (Custom → Formulas): write a formula for each colour channel, e.g.
  `0.3*r + 0.59*g + 0.11*b`, with the pixel's position (`x`, `y`), luma (`l`), comparisons,
  `a if c else b` and functions such as `clamp`, `mix`, `smoothstep` and `where`. Evaluated on the
  server by a whitelist checker over NumPy (never `eval`); mistakes show as a message on the step.
  Ten presets (Invert, Grayscale, Sepia, Vignette, Solarize, ...) and an Amount blend.
- **Operation presets**: an operation can offer *Start from a preset*, which sets several
  parameters at once as a single undo step (`presets` in the operations schema).

### 🐛 Fixed
- The accessibility audit restores the viewport after each Lighthouse snapshot, so CI on
  Chrome 157 checks the page at the intended width.

---

## [1.2.0] - 2026-11-12

Everything since 1.1.0. It was built in three stages, listed newest first:
custom filters, sharing, background jobs and themes; then accessibility, sessions and
security; then the schema-driven operation engine.

### Custom filters, sharing, background jobs and themes

Custom filters, sharing, background batch jobs, optional object storage, password
reset and email verification, seven themes, and browser checks in CI.

#### ✨ Workspace
- **Try a sample**: six public-domain/CC0 photos to start with, no upload needed.
- **Drag and drop** image files anywhere on the workspace (the Upload button still works).
- **Share a pipeline by link** (Load → Share): anyone with the link sees its steps on a public
  page and can open them in their own workspace; images are never shared; turn it off any time.
- **Theme follows your account**: signed-in users get their theme and mode in every browser.
- The gallery selection and Live mode survive a reload; downloads are named after the source
  image with the right extension.

#### 🧪 Custom filters
- **Custom Kernel** (Custom → Kernels): type your own 3×3 to 9×9 convolution, or start from a
  preset (blur, Gaussian, sharpen, edge detect, emboss, Sobel, motion blur). Normalize, absolute
  value and offset options; out-of-range or non-numeric cells are reported per cell.
- **Your own filters from existing steps**: tick *Save as a reusable filter* when saving a
  pipeline; it appears under Custom → **My filters** and adds as one step that runs the saved
  steps (a snapshot; filters can't contain filters).
- **Switch a step off** without removing it (power button on each step); it's kept in saved
  pipelines and skipped when processing.
- **Database migrations** (Alembic) now run automatically at startup; existing databases are
  adopted by a baseline revision.

#### 🔑 Password reset and email verification
- **Forgot password?** on the sign-in form emails a one-time reset link (valid 1 hour). The
  reply never says whether an account exists; Google-only accounts are told by email to use
  Google sign-in. Resetting signs the account out everywhere and lifts any login lockout.
- **Email verification:** sign-up sends a link (valid 48 hours); signed-in unverified users see
  a dismissible banner with **Resend email**. Nothing is blocked. Google sign-ins count as
  verified, and changing the address asks for verification again.
- Tokens are signed and single-use without a new table (`utils/account_tokens.py`); new
  `users.email_verified` / `email_verified_at` columns (migration `0002_email_verification`).
- Email goes through `EMAIL_BACKEND=console` (logs the message; the default) or `smtp`
  (`SMTP_*`, `EMAIL_FROM`); links use `FRONTEND_URL`. See
  [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md).

#### ⚙️ Platform
- **Background batch jobs**: Apply Pipeline queues a job that a worker in the backend runs
  image by image; results appear as each finishes, a reload picks the run back up, and Stop
  cancels it. The queue is a database table (no Redis); interrupted jobs are re-queued on start.
- **Error reporting**: browser errors and render crashes are reported to the backend log, and to
  Sentry when `SENTRY_DSN` is set (no personal data). A crash shows a "Something went wrong"
  page with Reload instead of a blank screen.
- **Uptime check**: a scheduled GitHub Action pings `/api/health` and opens/closes an `uptime`
  issue (set the `PRODUCTION_URL` repository variable).
- **CI runs the browser checks**: the frontend production build plus every `scripts/e2e`
  script and the Lighthouse/axe audit, on a fresh stack, for each push.

#### 🎨 Themes and brand
- **Appearance picker** in the header (palette icon): seven themes, each in light and dark
  mode, applied instantly and remembered in the browser.
  - **Classic**: the original look, unchanged.
  - **Spectrum**: monochrome, with red/green/blue only in the mark and charts.
  - **Verdant**: white / near-black with a calm green accent.
  - **Cobalt**: cool greys and deep cobalt.
  - **Fjord**: soft blue-grey and teal, low glare.
  - **Orchid**: mauve greys and violet.
  - **Safelight**: warm charcoal and darkroom amber.
- Each theme has its own typefaces (e.g. Geist, Manrope, IBM Plex, Figtree, DM Sans), loaded
  only when chosen; timings and values use the theme's monospace face.
- **Contrast is preserved by construction:** every theme shade has the same luminance as the
  Tailwind shade it replaces (`frontend/scripts/gen-themes.py`), so all WCAG AA results carry
  over. Each theme was re-audited: 24 states at desktop and 320px, Lighthouse 100 and 0 axe
  violations in light and dark ([a11y-reports/themes/](a11y-reports/themes/README.md)).
- Themes other than Classic use a neutral operations sidebar and a single accent colour
  (colourful chrome next to the preview skews colour judgement).
- **New mark:** three overlapping R/G/B pixels on a dark tile, used in the header, landing
  page, sign-in/register, favicon and app icons (SVG + PNG, maskable).
- Landing page: emoji in "Perfect for" replaced by icons.

#### 🗄️ Optional object storage for images
- `STORAGE_BACKEND=s3` keeps image bytes in a private S3-compatible bucket (AWS S3, Cloudflare
  R2, MinIO) instead of the database, which keeps only metadata, the object key and the
  thumbnail. The database stays the default. Settings: `S3_BUCKET`, `S3_ENDPOINT_URL`,
  `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX`; incomplete settings stop
  startup with a clear message. Existing images stay readable after the switch; every delete
  (user, admin, cleanup) also removes the objects. Migration `0003_object_storage` adds
  `storage_key` and makes `image_data` nullable.

### Accessibility, sessions and security

Accessibility (WCAG 2.1 AA), a production-outage fix, and a pass over every
workflow. Details per change are in the git history; the accessibility audit
is written up in [a11y-reports/REPORT.md](a11y-reports/REPORT.md).

#### ♿ Accessibility (WCAG 2.1 AA)
- All 24 audited pages/states score 100 in Lighthouse (desktop and 320px mobile) and have
  0 axe-core violations in light and dark theme (before: average 75, 492 critical/serious).
- Accessible dialogs (focus trap, Escape, focus return), keyboard alternatives for every
  mouse-only interaction (upload, gallery selection, compare slider, image picker, lightbox,
  step reordering with Alt+↑/↓), names/labels for all controls, AA contrast, landmarks,
  page titles, heading order, live-region announcements.
- The whole app reflows to a single column at 320px / 400% zoom (it used to be desktop-only),
  no content appears only on hover, text spacing and 200% text don't clip anything.

#### ✨ New
- **Backend connection indicator** in the header (Connecting / Server connected / Server
  waking up / Can't reach server / You're offline) using `GET /api/health`.
- **Automatic database cleanup** every 15 minutes (expired sessions, retention periods,
  orphans, expired refresh tokens), with an on/off switch and session-lifetime settings in
  Admin → Retention.
- Operation descriptions are visible (a line under the search box); result and gallery
  actions are always visible (they were hover-only).
- The pipeline being built survives a page reload (per tab).

#### 🔒 Security
- The admin PIN is enforced by the server: a correct PIN grants a 15-minute httpOnly cookie
  that the user-data endpoints require; changing the PIN needs the current one; 5 wrong PINs
  lock the admin out for 15 minutes.
- Images can only be processed by their owner (processing with an empty pipeline used to
  return any user's image by id).
- Browser sessions are never shared between accounts on one computer; a user's session can
  only be used, listed or deleted by that user.

#### 🐛 Fixed
- Signed-in users silently became guests after 30 minutes (access cookie expiry): tokens are
  now refreshed proactively, with a 401 refresh-and-retry fallback on every API client.
- Exposure, Gamma Correction, Contrast Stretching and Unsharp Mask corrupted images (uint8
  overflow / library bug) even at their "no change" settings.
- Stop then Apply Pipeline ran both batches; removing the last step left a stale preview;
  point/region picking used the final image's coordinates; one failed file hid the files
  that did upload; TIFF uploads had no preview; the step "Preview" button did nothing.
- Quota / image-limit dialogs never appeared (error details were dropped); deleting an image
  that the server refused looked successful; register/login could show "[object Object]".
- Duplicating a pipeline bypassed the free-account pipeline limit; `/api/pipelines` without
  a trailing slash redirected (to an `http://` URL behind the proxy).
- Admin settings are validated (an emptied field used to save `null` and crash cleanup).
- Global Ctrl+Z / Ctrl+Y no longer override undo inside text fields; duplicate pipeline step
  ids; swapped before/after captions in the compare slider.

#### ⚙️ Operations / deployment
- Startup retries the database connection and logs the cause (password masked) when it can't
  connect, e.g. an expired free Render Postgres.
- `TRUSTED_PROXY_HOPS` makes rate limiting use the real client IP behind Render / Vercel;
  processing limit raised to 150/min; `/api/health` is never rate limited.
- CORS is the outermost middleware (403/429 responses now reach the frontend); CI's plain
  `pytest` works (`pythonpath`); Render blueprint pins Python 3.11.9; the Vercel `/api`
  rewrite points at the real backend; the frontend builds under `CI=true`.
- Opening the workspace loads thumbnails first and full images one by one (instead of every
  full image base64-encoded in one response).
- The old `/images/heartbeat` endpoint is deprecated: it no longer creates sessions or writes
  on every call.

### Schema-driven operation engine

#### 🎉 Major New Features — Dynamic Pipeline Engine

##### **Schema-driven operation registry (single source of truth)**
- Operations are now declared **once, in the backend** (`backend/app/processing/`): each has a
  stable id, category, description, a **typed parameter schema**, and the callable. The frontend
  renders every control dynamically from `GET /api/processing/operations`.
- Removed the duplicated frontend `*_OPERATION_CONFIGS` — no more "two places that must agree".
- Backward compatible: saved pipelines reference operations by display name and resolve through
  an **alias** map (zero migration).

##### **77 operations (up from ~53)**
- Fixed two long-broken ops: **Watershed** (`peak_local_max` rename) and **Denoise Wavelet**
  (added PyWavelets).
- Added ~22 new techniques across stylize, photo enhancement, segmentation, morphology, and noise
  (e.g. Threshold Binary, Pixelate, Emboss, Motion Blur, Hue Rotate, Color Tint, Pencil Sketch,
  Cartoon, Stylization, Edge-Preserving Smooth, TV/Wavelet Denoise, Skeletonize, Duotone, …).

##### **Typed parameters + interactive inputs**
- Param types: int, float, odd-kernel, angle, enum, **bool**, **color**, and image-coordinate
  **point / points / rect**, with server-side validation/coercion.
- **Pick directly on the preview**: click a seed **point**, drag a **region (ROI)**, or use the
  **eyedropper** (Flood Fill, Crop, Inpaint Region). Coordinates are normalized [0..1] so they
  survive preview scaling and upstream geometry changes.

##### **Incremental live preview**
- A per-step **prefix cache** recomputes only the steps from the point of change (editing the last
  step ≈ 1 op); superseded live requests are cancelled (latest-edit-wins).

##### **Step-by-step comparison**
- Before/after **wipe slider**, **side-by-side of any two pipeline steps**, and a **diff/overlay**
  view.

#### ✨ Enhancements
- **Structured per-step errors** replace silent no-ops — a bad parameter or unknown op surfaces a
  clear error banner instead of returning the image unchanged.
- DB-mode **batch upload** (`/api/images/upload-multiple`) with partial-failure reporting.
- PNG **transparency preserved** on upload; zero-byte uploads rejected with a clean 400.
- **Admin settings now actually take effect** — the DB `SystemSettings` row is the single source of
  truth for retention/session/cleanup policy (was reading hardcoded constants).
- Per-IP **rate limiting on upload and processing** endpoints.

#### 🔒 Security — httpOnly-cookie auth
- JWTs are now delivered as **httpOnly cookies** (`pf_access`, `pf_refresh`) instead of
  `localStorage`, so tokens are no longer readable by JavaScript (mitigates XSS token theft).
- **CSRF protection** via a double-submit cookie (`pf_csrf` echoed in the `X-CSRF-Token`
  header, verified by `CSRFMiddleware`).
- **Refresh-token rotation** + DB revocation on logout, now also wired for Google OAuth.
- Tokens carry a random `jti` (always-unique); cookie attributes are env-driven
  (`COOKIE_SECURE`/`COOKIE_SAMESITE`/`COOKIE_DOMAIN`).
- Guest `session_id` is now a `crypto.randomUUID()` (was a guessable timestamp+random).
- Deployment: the API is served **same-origin** via a Vercel rewrite (`/api/*` → backend)
  so cookies are first-party.

#### 🧪 Quality & Infrastructure
- **Automated tests** (pytest, ~71) + **GitHub Actions CI** (ruff + mypy + pytest, frontend
  type-check/tests) + **pre-commit** hooks.
- Bumped **FastAPI 0.104 → 0.115.6** / **Starlette 0.27 → 0.41.3**, unlocking HTTP-level API tests.
- **Docker** + `docker-compose` for the full stack.

#### 🔥 Removed
- The dual **filesystem storage** path (`images.py` / `processing.py`) and the legacy `main.py`
  `/upload` `/process` shims — images are always stored in the database now.
- The `IMAGE_STORAGE` environment variable (no longer used).
- Published demo admin credentials from the docs (provision your own via `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

#### 🐛 Bug Fixes
- SQLite naive/aware `datetime` crash in the admin *Database → Sessions* view (`ensure_aware`).
- Storage-quota-of-0 divide-by-zero guard.
- Live-preview status no longer reports "updated" before the rendered image is committed.

#### ⏭️ Deferred (documented for follow-up)
- Redis-backed multi-instance rate limiting, downscale-on-drag preview.

---

## [1.1.0] - 2025-10-18

### 🎉 Major New Features

#### **Database Integration**
- **PostgreSQL Support**: Full SQLAlchemy ORM integration with PostgreSQL
- **Database Storage**: Images can now be stored in database (in addition to filesystem)
- **Data Persistence**: All user data, images, and pipelines persist across sessions
- **Migration Framework**: Alembic integration for future schema updates

#### **User Authentication System**
- **User Registration**: Email-based account creation with secure password hashing
- **Login System**: JWT-based authentication with access and refresh tokens
- **Google OAuth**: One-click sign-in with Google (requires configuration)
- **Profile Management**: Users can update their profile information
- **Session Management**: Secure session handling with automatic cleanup

#### **Admin Panel**
- **System Statistics**: View users, sessions, storage, and pipeline stats
- **User Management**: View all users, activate/deactivate accounts, delete users
- **Storage Overview**: Monitor database storage and image counts
- **Session Tracking**: Heartbeat-based active session monitoring (5-minute window)
- **Database Viewer**: PIN-protected viewer for user data and images
- **Manual Cleanup Tools**: Trigger cleanup, fix orphaned images, manage data
- **Settings Management**: Adjust quotas, limits, and retention policies
- **Deletion Tools**: Delete individual users, images, pipelines, or bulk operations

#### **Advanced Session Management**
- **Heartbeat System**: 30-second heartbeat pings to track active sessions
- **Active vs Inactive**: Real-world session tracking (active = heartbeat in last 5 minutes)
- **Session Persistence**: Sessions stored in database, persist across browser restarts
- **IP Tracking**: Track session IP addresses for security
- **Automatic Expiration**: Sessions expire after configured time period

### ✨ Enhancements

#### **Security Improvements**
- **Login Rate Limiting**: Prevent brute force attacks (5 attempts, 15-min lockout)
- **Security Headers**: CSP, XSS protection, HSTS, and more
- **Password Hashing**: bcrypt with proper salting
- **CORS Configuration**: Flexible origin management for secure API access
- **Admin PIN Protection**: Sensitive data requires PIN verification

#### **Storage & Cleanup**
- **Quota Management**: Storage quotas with visual feedback
- **Retention Policies**: Configurable retention periods for guests and users
- **Cleanup Service**: Manual and (future) automatic cleanup of old data
- **Orphaned Image Detection**: Identify and fix mislinked images
- **Session Cleanup**: Remove expired sessions and associated data

#### **Business Rules**
- **User Limits**: Configurable pipeline limits per user type
- **Storage Quotas**: Different quotas for guests vs registered users
- **Image Limits**: Maximum images per session and per upload
- **Retention Periods**: Different policies for uploads vs processed images

### 🛠️ Technical Improvements

#### **Backend Architecture**
- **SQLAlchemy Models**: Comprehensive database models for all entities
- **Database Scripts**: Utilities for init, backup, restore, cleanup, and debugging
- **Middleware System**: Rate limiting, security headers, and CORS
- **Business Logic Layer**: Centralized rules for quotas, limits, and cleanup
- **Settings Manager**: Dynamic system settings stored in database

#### **API Enhancements**
- **Authentication Endpoints**: Register, login, logout, token refresh, user profile
- **Admin Endpoints**: Complete admin API for user and data management
- **OAuth Endpoints**: Google OAuth flow with callback handling
- **Pipeline Endpoints**: Save, load, update, delete pipelines (database-backed)
- **Session Endpoints**: Session creation, heartbeat, and cleanup

#### **Frontend Improvements**
- **Auth Context**: Global authentication state management
- **Protected Routes**: Route guards for authenticated-only pages
- **Login/Register Pages**: Professional authentication UI
- **Admin Panel Component**: Comprehensive admin interface
- **Google Sign-In Button**: One-click OAuth authentication
- **Session Heartbeat**: Automatic background session keepalive

### 📚 Documentation

#### **New Guides**
- `guides/DATABASE_SETUP.md` - Complete database configuration guide
- `guides/ADMIN_PANEL.md` - Admin panel features and usage
- `guides/GOOGLE_OAUTH_SETUP.md` - OAuth configuration instructions
- `deployment/` folder - Comprehensive deployment documentation
- `CURRENT_LIMITATIONS.md` - Known issues and limitations

#### **Deployment Resources**
- Complete Vercel + Render deployment guides
- Environment variable documentation
- Production checklist
- Alternative hosting options guide
- Automated preparation scripts

### 🔧 Infrastructure

#### **Database Schema**
- `users` - User accounts with OAuth support
- `sessions` - Active session tracking with heartbeat
- `uploaded_images` - Binary image storage with thumbnails
- `processed_images` - Processed results storage
- `saved_pipelines` - User pipeline storage
- `processing_history` - Usage analytics and logging
- `login_attempts` - Security audit trail
- `system_settings` - Dynamic configuration storage

#### **Deployment Configuration**
- `render.yaml` - Complete Render deployment config
- `vercel.json` - Vercel frontend configuration
- Automated deployment preparation scripts
- Comprehensive deployment guides

### 🐛 Bug Fixes
- Fixed session cleanup logic to follow real-world standards
- Improved error handling in image processing
- Better CORS configuration management
- Fixed image persistence across page refreshes

### ⚠️ Known Limitations (See CURRENT_LIMITATIONS.md)
- Desktop-only interface (mobile support deferred to V2.0)
- No background cleanup jobs (manual trigger required)
- Admin panel features partially implemented
- Google OAuth requires manual configuration
- Free tier limitations (cold starts, 1GB database)

### 🔄 Breaking Changes
- **Database Required**: V1.1.0 requires PostgreSQL (or SQLite for development)
- **Environment Variables**: New required vars for authentication
- **Configuration Changes**: Different .env structure from V1.0.0

### 📦 Dependencies Added
- `sqlalchemy==2.0.23` - Database ORM
- `asyncpg==0.29.0` - PostgreSQL async driver
- `alembic==1.13.0` - Database migrations
- `psycopg2-binary==2.9.9` - PostgreSQL driver
- `bcrypt==3.2.2` - Password hashing
- `passlib==1.7.4` - Password utilities
- `python-jose==3.3.0` - JWT tokens
- `authlib==1.3.0` - OAuth support
- `google-auth==2.23.4` - Google authentication
- `react-router-dom==6.30.1` - Frontend routing

---

## [1.0.0] - Initial Release

### Features
- Visual pipeline builder with 50+ operations
- Dual processing modes (Live and Batch)
- OpenCV and Scikit-Image operation libraries
- Real-time parameter controls
- Hierarchical operation organization
- Performance analytics and timing
- Undo/Redo system
- Modern React/TypeScript frontend
- FastAPI/Python backend
- Session-based file management
- Dark/light theme support (UI)

### Operations Library
- 13 Basic Operations
- 25+ OpenCV Operations
- 15+ Scikit-Image Operations

### Architecture
- React 18 + TypeScript frontend
- FastAPI backend with OpenCV and Scikit-Image
- Filesystem-based image storage
- Session isolation
- RESTful API design

---

## Migration Guide (1.0.0 → 1.1.0)

### Prerequisites
- PostgreSQL database (or SQLite for development)
- Updated environment variables

### Steps

1. **Update Dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   
   cd frontend
   npm install
   ```

2. **Configure Database**
   ```bash
   # Set in backend/.env
   DATABASE_URL=postgresql://user:password@localhost:5432/pixelflow
   USE_SQLITE=False  # or True for development
   ```

3. **Add Authentication Variables**
   ```bash
   SECRET_KEY=<generate-new-key>
   ```

4. **Initialize Database**
   ```bash
   python database/init_db.py
   ```

5. **Optional: Configure Google OAuth**
   ```bash
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```

6. **Update Frontend**
   - No changes required in code
   - New auth pages automatically available
   - Admin panel accessible to admin users

### Data Migration

**V1.0.0 had no persistent storage**, so no data migration needed.

If you have important session data:
- Export images manually before upgrading
- Re-upload to V1.1.0 after authentication setup

---

## Upcoming

Planned work and known gaps are tracked in [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md).

---

## Links

- **GitHub Repository**: https://github.com/Mauryantitans/PixelFlow
- **V1.0.0 Release**: https://github.com/Mauryantitans/PixelFlow/tree/v1.0.0
- **Documentation**: See `/guides` and `/deployment` folders
- **Issue Tracker**: https://github.com/Mauryantitans/PixelFlow/issues

---

## Notes

### Versioning Scheme
- **Major.Minor.Patch** (Semantic Versioning)
- **Major**: Breaking changes, major new features
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, minor improvements

### Support
- 1.2.0: current
- Earlier versions are not maintained

---

*For detailed limitations and known issues, see [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md)*
