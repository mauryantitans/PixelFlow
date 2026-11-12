# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PixelFlow is a visual image-processing pipeline builder: a React/TypeScript frontend and a FastAPI/Python backend. Users build pipelines from **77** OpenCV / scikit-image / PIL operations and run them in **Live mode** (single image, real-time incremental preview) or **Batch mode** (many images). The operation library is **schema-driven**: the backend registry is the single source of truth and the UI renders each operation's controls dynamically — including interactive inputs (click a point, drag a region, pick a color). Backed by PostgreSQL in production, SQLite in local dev.

## Commands

### Running locally (whole stack)
- `./start.sh` (Bash) or `start.bat` (Windows) — launches backend (SQLite, hot-reload, `USE_SQLITE=True DEBUG=True`) **and** frontend, writing `frontend/.env.local` pointing at `localhost:8000`. This is the fastest no-Docker path.
- `docker compose up` — full stack with real PostgreSQL (backend on :8000, frontend on :3000, db on :5432). Use `docker compose down -v` to wipe the db volume.

### Backend (from `backend/`, venv activated)
- `pip install -r requirements.txt` (runtime) and `pip install -r requirements-dev.txt` (pytest, ruff, mypy)
- `python run.py` — start server (reads `.env`; honors `DEBUG`, `PORT`, etc.)
- `uvicorn app.main:app --reload` — equivalent direct invocation
- `python database/init_db.py` — create tables
- **Quality gate** (matches CI — see `.github/workflows/ci.yml`):
  - `ruff check app/processing tests` and `ruff format --check app/processing tests` (CI's scope; the older modules aren't ruff-clean yet)
  - `mypy` (scoped via `pyproject.toml` to `app/processing` + `app/utils/datetime_utils.py`)
  - `pytest` — full suite (pytest `pythonpath` is set in `pyproject.toml`); `pytest tests/test_executor.py -k coerce` runs a single test/expr; `pytest -q` for quiet
- Database utility scripts live in `backend/database/`: `list_users.py`, `reset_password.py`, `backup_database.py`, `restore_database.py`, `cleanup_database.py`, `migrate_to_postgres.py`, `verify_business_rules.py`
- Migrations: the app runs `alembic upgrade head` itself on every startup (`core/database.run_migrations`, called by `init_db`), so Render and Docker behave the same. `alembic/versions/0001_baseline.py` creates any missing tables and adopts databases built earlier by `create_all`. New migrations must be idempotent (use `app/core/migration_helpers.py`: `add_column_if_missing` etc.) because fresh databases already get current columns from the baseline. Create one with `alembic revision -m "..."` (config `backend/alembic.ini`, env `backend/alembic/env.py`); `tests/test_migrations.py` checks fresh, adopted and repeated runs.
- API docs while running: http://localhost:8000/docs ; health: `/health`

### Frontend (from `frontend/`)
- `npm install`
- `npm start` — dev server (proxies to `localhost:8000`; reads `REACT_APP_API_URL`)
- `npm run build` — production build
- `npm test` — Create React App / Jest test runner (smoke tests). `npx tsc --noEmit` for the strict type-check that CI runs.
- `CI=true npm run build` — what Vercel runs; ESLint warnings fail the build in CI mode.

### Browser checks (need the stack running; puppeteer-core installed outside the repo, path in `TOOLS`)
- `node scripts/e2e/session-flow.js` — sign-in, token expiry, shared-browser sessions (env vars in the file header).
- `node scripts/e2e/workflows.js` — uploads, live preview, batch Stop/Apply, picking, reload.
- `node scripts/e2e/appearance.js` — theme picker: keyboard, saving, reload, typeface, axe on the open panel, 320px.
- `node a11y-reports/scripts/audit.js` (+ `VIEWPORT=320x640`, `UI_THEME=<theme id>`) and `keyboard-checks.js` — accessibility audit; see [a11y-reports/REPORT.md](a11y-reports/REPORT.md).

## Architecture

### The operation registry — the single source of truth (most important contract)
Operations are declared **once, in the backend**, in the `backend/app/processing/` package. There are **no frontend operation config files** — the frontend renders entirely from the schema served by the API.

- `processing/param_specs.py` — the `ParamSpec` types: `int`, `float`, `odd_kernel`, `angle`, `enum`, `bool`, `color`, and image-coordinate `point` / `points` / `rect`. Each spec knows its constraints, `.coerce()` (validate+normalize a raw value), `.schema()` (the DTO sent to the UI), and (for coords) `.to_pixels()`.
- `processing/registry.py` — `OperationSpec` (stable snake_case `id`, `label`, `category`/`subcategory`, `description`, ordered `params`, the `fn` callable, and `aliases` = legacy display names) and the `OperationRegistry` singleton. `ensure_registered()` lazily imports the operation modules. **`id` is the stable identity; never reuse/rename an id, and never remove an alias** — saved pipelines (`SavedPipeline.pipeline_data`) reference operations by display-name string and resolve through the alias map with zero migration.
- `processing/coords.py` — the ONE place for coordinate↔pixel mapping (normalized [0..1] → pixels), odd-kernel enforcement, and color parsing.
- `processing/executor.py` — `execute_step(image, step)`: resolve id/alias → validate+coerce params → map normalized coords against the *current* image size → run the callable. Returns a structured `StepError` per step instead of a silent no-op; one bad step never 500s the batch.
- `processing/preview_cache.py` — per-session LRU of intermediate images keyed by cumulative prefix hashes (powers incremental live preview).
- `processing/operations/` — the actual functions, registered declaratively: `_builtins.py` (the original ~53 ops), `interactive.py` (Flood Fill, Crop, Inpaint Region — point/ROI/color), `extras.py` and `extras2.py` (the +22 stylize/photo/segmentation/morphology batches). Operation bodies are plain `fn(image, **params) -> PIL.Image`.

**Coordinates are normalized [0..1] everywhere** in transport/storage and converted to pixels once in `coords.py` at execution. This survives preview downscaling and upstream geometry changes (e.g. an upstream Resize auto-rescales a seed point/ROI for free).

To add an operation: write the function, register an `OperationSpec` with typed params, and import its module in `registry.ensure_registered()`. The UI needs **no changes**. See [guides/ADDING_OPERATIONS.md](guides/ADDING_OPERATIONS.md).

### Pipeline execution
Pipelines are ordered lists of `{name, params}` steps. `ImageProcessor.apply_operation` delegates to `executor.execute_step`. `apply_pipeline_with_timing_from_image(image, pipeline, source_key=...)` runs steps sequentially through the executor, captures each intermediate, records per-step millisecond timing and per-step `StepError`s into a `ProcessingResult`, and uses the **prefix cache** to recompute only the steps from the first change onward (`cached_prefix_len` reports reuse). `source_key = "{session}|{image_id}"` is threaded from the processing routes.

### The `/operations` schema endpoint
`GET /api/processing/operations` returns the grouped schema (`version`, `categories[] → subcategories[] → operations[]` with typed `params`) plus a legacy flat `operations` list + `total_count` for backward compat. The frontend fetches it once at startup.

### Backend layout (`backend/app/`)
- `main.py` — app factory, lifespan (init db with connection retries, auto-create first admin, start/stop the DB cleanup scheduler), middleware wiring (CORS is added **last** so it is outermost and 403/429 responses keep CORS headers), global exception handler.
- `processing/` — the operation engine (see above). `utils/image_processing.py` is now a thin `ImageProcessor` façade over the executor + prefix cache.
- `core/config.py` — central `Settings` (env-driven). **Fails fast** (`sys.exit(1)`) in production if `SECRET_KEY` is still the default. Rewrites Render/Heroku `postgres://` → `postgresql://`. `USE_SQLITE=True` switches `DATABASE_URL` to a local SQLite file.
- `core/security_config.py` — constants for CORS origins, rate limits (incl. per-IP upload/processing limits), login lockout, session/token expiry, file-upload limits. `core/business_rules.py` — quota/retention **seed defaults only**; the live policy is read from the DB `SystemSettings` row (admin-editable).
- `core/database.py` — SQLAlchemy engine, `SessionLocal`, `Base`, `get_db` dependency.
- `models/db_models.py` — all ORM tables (`User`, `RefreshToken`, `LoginAttempt`, `Session`, `UploadedImage`, `ProcessedImage`, `SavedPipeline`, `ProcessingHistory`, `APIKey`, `SharedPipeline`, `SystemSettings`). `models/schemas.py` — Pydantic request/response models. `models/__init__.py` — `PipelineStep` (its `params` value type is widened to allow nested list/dict for coord params) and `StepError`.
- `api/routes/` — `auth`, `oauth` (Google), `pipelines`, `admin`, `images_db` (upload incl. `/upload-multiple`), `processing_db` (`load_image_from_db`, the `/operations` schema, live/batch processing). Images are always stored in the database (the old filesystem router pair was removed).
- `middleware/` — `RateLimitMiddleware` (per client IP + path, in memory; `TRUSTED_PROXY_HOPS` picks the real client IP from `X-Forwarded-For` behind Render/Vercel; `/health` and `/api/health` are exempt), `SecurityHeadersMiddleware`, `CSRFMiddleware`.
- `utils/` — `auth.py` (JWT/bcrypt, cookies), `admin_pin.py` (server-side admin PIN: 15-min signed cookie, `require_admin_pin`, wrong-PIN lockout), `session_db.py` (session activity: sliding expiry, ownership, guest→user linking), `cleanup_scheduler.py` (runs `cleanup_service.run_full_cleanup` every 15 min), `cleanup_service.py`, `quota_manager.py`, `settings_manager.py` (DB settings + validation), `datetime_utils.py`, `init_admin.py`. `session_manager.py` is **deprecated/unused** (old filesystem storage).

### Frontend layout (`frontend/src/`)
- `App.tsx` — top-level orchestrator; the palette/search/add-op all read the operation schema (with a loading/error state when the schema is unavailable).
- `contexts/` — `AuthContext` (user state; keeps the browser session in step with who is signed in via `SessionUtils.syncWithUser`), `PipelineContext` (pipeline + undo/redo history, kept in `sessionStorage` across reloads), `OperationSchemaContext` (fetches `/operations` once; exposes `palette`/`getOp`/`getDefaults`), `PickerContext` (which step/param is currently capturing an interactive pick).
- `components/params/ParamControl.tsx` — renders the correct control per param `type` (sliders, enum, bool, color, and coordinate placeholders). `components/PreviewCanvas.tsx` — the interactive overlay (click=point, drag=ROI, eyedropper=color), object-contain-aware coordinate mapping. `components/CompareSlider.tsx`, `DiffView.tsx`, `Inspector.tsx` — comparison views. `components/PipelineStep.tsx` — a step's controls + per-step error banner.
- `hooks/` — `index.ts`: `useImages` (thumbnails first, then full images one by one; partial-upload aware), `useLiveProcessing` (debounced, prefix-cache aware, request cancellation, surfaces `stepErrors`), `useBatchProcessing` (one run at a time, abortable), `usePipeline`, `useSession` (reactive session id), `useUI`, `useStatus`, `useModal`, `useTheme`, `useKeyboardShortcuts`. Also `useConnectionStatus.ts` (pings `/api/health`), `useDialog.ts` (accessible modal focus trap), `useDocumentTitle.ts`.
- `services/` — `api.ts` (`ApiService`: upload, process, `getOperationsSchema`, `processLive` with an abort signal, images, file validation; errors keep `status`/`response`/`code`), `auth.ts` (auth + pipelines), `tokenRefresh.ts` (shared request/response interceptors: proactive token refresh, CSRF header, 401 refresh-and-retry), `cookies.ts`.
- `theme/` — UI themes. Every Tailwind palette class reads a CSS variable (`--c-<palette>-<shade>`, see `tailwind.config.js`) with Tailwind's value as fallback, so **Classic sets nothing** and other themes set the neutral (slate/gray/zinc…), accent (blue/indigo/sky) and decorative (purple/pink/teal…) palettes; red/orange/amber/yellow/green keep their meaning. `themes.ts` (theme list, fonts, `applyUiTheme`), `appearance.ts` (theme + light/dark mode store, `useAppearance`, `initAppearance` runs before first render), `palettes.generated.ts` (from `frontend/scripts/gen-themes.py`, which matches each shade's **luminance** to the Tailwind shade it replaces so WCAG contrast carries over — regenerate rather than hand-edit). `components/AppearanceMenu.tsx` is the header picker; `components/BrandMark.tsx` the logo (same in every theme). Non-Classic overrides (neutral sidebar, single-accent feature icons) live at the end of `index.css` under `html[data-ui-theme]:not([data-ui-theme="classic"])`. Use Tailwind palette classes (not hex) in components so they follow the theme.
- `types/index.ts` — TS interfaces and the schema DTOs (`ParamSpecDTO`, `OperationSpecDTO`, `OperationSchema`, `StepErrorDTO`). The old static `*_OPERATION_CONFIGS` were removed.

### Sessions, cleanup and the connection indicator
Each browser has a session id (`SessionUtils`, localStorage). The server records **activity** on it (upload, opening the workspace, processing): `session_db.create_or_update_session` creates the row on first upload, slides `expires_at` forward on activity (throttled to one write/min) and refuses a session owned by another user (upload → 409 `session_owned_by_another_user`; signed-out owner → 401 `sign_in_required`). Signing out switches to a fresh guest session; signing back in restores the account's session in that browser. "Active" in the admin panel = activity in the last 15 min. `cleanup_scheduler` runs `CleanupService.run_full_cleanup` every 15 min (honours the admin auto-cleanup switch; retention/lifetimes come from `SystemSettings`). The header's `ConnectionStatus` badge only pings `GET /api/health` (no DB, no session writes); `/images/heartbeat` is deprecated and never creates sessions.

### Auth (httpOnly cookies + CSRF)
JWT access + refresh tokens (`python-jose`, bcrypt via `passlib`) are delivered as **httpOnly cookies**, never in response bodies or `localStorage`:
- `set_auth_cookies`/`clear_auth_cookies` in `utils/auth.py` set `pf_access` (httpOnly, Path=/), `pf_refresh` (httpOnly, Path=/api/auth), and a non-httpOnly `pf_csrf`. `get_current_user`/`_optional` read the token from the `pf_access` cookie or, for non-browser clients, an `Authorization: Bearer` header.
- **CSRF**: `middleware/csrf.py` enforces a double-submit cookie — cookie-authenticated unsafe requests (POST/PUT/DELETE/PATCH under `/api`) must send `X-CSRF-Token` matching the `pf_csrf` cookie. Exempt: login/register/oauth (no session yet) and the session-id-keyed `heartbeat`/`cleanup-session` (reached via fetch/beacon). The frontend echoes the cookie via axios request interceptors (`services/api.ts`, `services/auth.ts`).
- `/auth/login` and the OAuth callback set the cookies and return only the user; `/auth/refresh` reads the refresh cookie, **rotates** it (DB-backed `RefreshToken`, hashed), and re-sets cookies; `/auth/logout` clears cookies and revokes refresh tokens. Tokens carry a random `jti` so they're always unique.
- **Token refresh**: the access cookie lasts 30 min and the browser stops sending it afterwards, and image/processing routes accept guests, so the frontend refreshes **proactively** (`services/tokenRefresh.ts`: before a request, if `pf_csrf` exists and the tokens are 20+ min old) with a 401 refresh-and-retry fallback on both axios clients. A rejected refresh fires `pixelflow:auth-expired` → signed out.
- Cookie attributes are env-driven: `COOKIE_SECURE` (default on in prod), `COOKIE_SAMESITE` (default `lax`), `COOKIE_DOMAIN`. **In production the frontend must be same-origin with the API** (a Vercel rewrite proxies `/api/*` → the Render backend; set `REACT_APP_API_URL=/api`) so cookies are first-party — see `frontend/vercel.json` and `deployment/DEPLOYMENT_GUIDE.md`.

**Password reset / email verification** (`/auth/forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification`): no token table — `utils/account_tokens.py` signs JWTs with a `purpose` and a fingerprint (HMAC of the password hash for reset, of the email for verify) so links are single-use; `utils/email.py` sends via `EMAIL_BACKEND` `console` (logs, default) or `smtp`, never raising, from FastAPI `BackgroundTasks`; links point at `FRONTEND_URL`. Forgot/reset/verify are CSRF-exempt; verification only drives the frontend's `VerifyEmailBanner`, it gates nothing.

Optional Google OAuth (`authlib`) gated on `GOOGLE_CLIENT_ID`/`SECRET`. First admin is auto-created on startup from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if no admin exists. The admin panel's user-data views are protected by an **admin PIN enforced server-side** (`utils/admin_pin.py`).

## Configuration notes
- Backend env lives in `backend/.env` (template: `backend/.env.example`). Key vars: `DATABASE_URL`, `SECRET_KEY`, `USE_SQLITE`, `DEBUG`, `ALLOWED_ORIGINS`, `ALLOWED_ORIGINS_REGEX` (for Vercel preview URLs), `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ADMIN_*`, `TRUSTED_PROXY_HOPS`, `DB_CLEANUP_INTERVAL_SECONDS`, `DB_CONNECT_RETRIES`. Full list in [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md).
- Frontend env: `REACT_APP_API_URL` (`/api` in production, via the Vercel rewrite), `REACT_APP_GOOGLE_CLIENT_ID`, optional `REACT_APP_TOKEN_REFRESH_MINUTES` (default 20).
- CORS: defaults to localhost origins in dev; in production set `ALLOWED_ORIGINS` (comma-separated) and/or `ALLOWED_ORIGINS_REGEX`.
- Supported uploads: JPEG/PNG/BMP/TIFF, up to 50MB, max 20 files per batch (enforced both client- and server-side); PNG alpha is preserved.

## Deployment
Frontend → Vercel, backend + PostgreSQL → Render. Config in `deployment/` (`render.yaml`, `vercel.json`) and root `render.yaml`. Dockerfiles exist in `backend/` and `frontend/` plus a root `docker-compose.yml`. Do **not** put real credentials in docs — provision the first admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
