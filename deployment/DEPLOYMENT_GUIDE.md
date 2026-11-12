# PixelFlow Deployment Guide

The canonical guide for deploying PixelFlow (v1.3.0): **backend + PostgreSQL on Render**, **frontend on Vercel**. Free tiers are enough for personal and demo use.

- Environment variables: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) (full reference)
- Go-live review: [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)
- Other hosts and self-hosting: [ALTERNATIVE_HOSTING_OPTIONS.md](ALTERNATIVE_HOSTING_OPTIONS.md)

---

## Architecture

```
Browser ──► Vercel (React app, same origin)
              │  /api/*  rewrite (frontend/vercel.json)
              ▼
            Render web service (FastAPI) ──► Render PostgreSQL
```

Why the rewrite matters:

- Auth uses **httpOnly cookies** (`pf_access`, `pf_refresh`) plus a readable `pf_csrf` cookie. Unsafe `/api` requests must echo it in an `X-CSRF-Token` header (double-submit CSRF).
- Vercel and Render are different sites. Called directly, the cookies would be third-party and blocked by Safari/Chrome.
- So the frontend calls a **relative** `/api` (`REACT_APP_API_URL=/api`) and Vercel proxies it to Render. The cookies become first-party (`SameSite=Lax`).
- Any other frontend host needs an equivalent same-origin `/api` proxy.

---

## Before you start

- Code pushed to a GitHub repository; no `.env` files committed.
- Render and Vercel accounts connected to GitHub.
- Optional: run `deployment/prepare-for-deployment.ps1` (Windows PowerShell). It checks the project files and Git status and prints a fresh `SECRET_KEY`.

---

## Part 1: Backend + database on Render

### Option A: Blueprint (recommended)

The root `render.yaml` defines the backend web service (`pixelflow-backend`) and the database (`pixelflow-db`). It does **not** define a frontend site.

1. Render Dashboard → **New → Blueprint** → select the repository.
2. Render creates the database and web service. `DATABASE_URL` is wired from the database, and `SECRET_KEY` is generated.
3. In **pixelflow-backend → Environment**, add or check these values:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the first admin account. It is created on startup only if no admin exists yet. There are **no default credentials**. `ADMIN_USERNAME` and `ADMIN_FULL_NAME` are optional.
   - `TRUSTED_PROXY_HOPS=2`: requests arrive through the Vercel rewrite and then Render's proxy. Use `1` only if browsers call Render directly. Without this, every visitor shares one rate-limit bucket (Render's proxy IP).
   - `ALLOWED_ORIGINS`: set it to your Vercel URL after Part 2, comma-separated.
   - `ALLOWED_ORIGINS_REGEX`: change the `pixelflow` prefix to your Vercel project name (this allows preview URLs).
   - Google OAuth (optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. See [../guides/GOOGLE_OAUTH_SETUP.md](../guides/GOOGLE_OAUTH_SETUP.md).
4. Save. Render redeploys.

Notes from `render.yaml`:

- `PYTHON_VERSION=3.11.9` is required. On Render's default Python, the pinned numpy/scikit-image/psycopg2 versions have no wheels and the build fails.
- The service runs with `--workers 1` because the rate limiter is in memory.

### Option B: Manual setup

1. **New → PostgreSQL**. Name `pixelflow-db`, database `pixelflow`, PostgreSQL 16, plan Free. Pick a region.
2. **New → Web Service** from the repository. Use the **same region** as the database.
   ```
   Root Directory: backend
   Runtime:        Python 3
   Build Command:  pip install -r requirements.txt
   Start Command:  uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
   Health Check:   /health
   ```
3. Set the must-set variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Internal Database URL of the Render database (`postgres://` is rewritten to `postgresql://` automatically) |
   | `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account |
   | `TRUSTED_PROXY_HOPS` | `2` |
   | `PYTHON_VERSION` | `3.11.9` |

   Also set `DEBUG=False` and `USE_SQLITE=False`. Everything else has defaults; see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

### What happens on startup

- With `DEBUG=False`, the app **refuses to start** if `SECRET_KEY` is still the default value.
- Tables are created automatically on startup. No manual `init_db.py` step is needed.
- The first admin is created from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if no admin exists.
- Database cleanup (expired sessions, old images) runs inside the backend every 15 minutes. You don't need a cron job. Retention settings live in the admin panel.

### Verify

- `https://your-backend.onrender.com/api/health` (or `/health`) returns `{"status": "healthy", ...}`.
- `https://your-backend.onrender.com/docs` shows the API docs.

---

## Part 2: Frontend on Vercel

1. **Point the proxy at your backend.** In `frontend/vercel.json`, set the `/api/:path*` rewrite destination to your Render URL:
   ```json
   { "source": "/api/:path*", "destination": "https://YOUR-BACKEND.onrender.com/api/:path*" }
   ```
   Commit and push. No code change is needed; `services/api.ts` reads `REACT_APP_API_URL`.
2. Vercel → **Add New → Project** → import the repository.
   ```
   Framework Preset: Create React App
   Root Directory:   frontend
   ```
3. Environment variables:
   - `REACT_APP_API_URL=/api` (relative, so the rewrite handles it)
   - `REACT_APP_GOOGLE_CLIENT_ID` (optional, only for Google Sign-In)
4. **Deploy.** Vercel runs `CI=true npm run build`, so ESLint warnings fail the build.
5. Back on Render, set `ALLOWED_ORIGINS=https://your-app.vercel.app` (exact URL, `https://`, no trailing slash) and let it redeploy.

Cookie settings (`COOKIE_SECURE` defaults to on in production; `COOKIE_SAMESITE` defaults to `lax`) need no change when you use the proxy.

Custom domain (optional): Vercel → Project → Settings → Domains. Then add the domain to `ALLOWED_ORIGINS`.

---

## Part 3: Smoke test

- The app loads at the Vercel URL with no console errors.
- Upload an image, add an operation, and check the live preview. Run a batch.
- Register or sign in, save a pipeline, and reload. The pipeline and images persist.
- Sign in as the admin from `ADMIN_EMAIL`. The admin panel opens; its user-data views ask for the admin PIN.

---

## Object storage (optional)

Images are stored in PostgreSQL by default, which fills the free 1 GB database quickly. To
keep image bytes in an S3-compatible bucket instead (the database then holds only metadata,
object keys and small thumbnails), use Cloudflare R2 (free tier: 10 GB, no egress fees), AWS S3
or MinIO. Variables: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md#image-storage-optional).

**Cloudflare R2 in brief**
1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `pixelflow-images`). Leave public
   access off: the API serves images itself, after its ownership checks. (Cloudflare may ask
   for a payment method before enabling R2, even on the free tier.)
2. R2 → **Manage API tokens** → **Create API token** with *Object Read & Write*, limited to that
   bucket. Copy the Access Key ID, the Secret Access Key and the S3 endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`).
3. On the Render backend set `STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_ENDPOINT_URL`,
   `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and redeploy. Incomplete
   settings stop startup with a message in the log.
4. Upload an image and check that an object appears under `pixelflow/uploads/` in the bucket.

Images uploaded before the switch stay in the database and keep working. Deletes (by users,
admins and the cleanup job) also remove the objects; a bucket error is logged and never blocks
the delete. `pg_dump` backups don't include bucket objects, so back up the bucket separately.

---

## Free tier limits

**Render**
- The web service spins down after 15 minutes idle. The first request after that takes about 30 seconds.
- Free PostgreSQL (1 GB) **expires 30 days after creation and is then deleted**. After that the backend crash-loops on startup with `could not translate host name "dpg-..."`. Create a new database (or use a paid plan) and point `DATABASE_URL` at it. Back up before then, e.g. `pg_dump` against the External Database URL.
- Paid: Starter ($7/month) is always-on.

**Vercel**
- The hobby tier is generous for personal projects (100 GB bandwidth/month).

**Keep the backend warm (optional).** Use a free external pinger (e.g. cron-job.org or UptimeRobot) to call `https://your-backend.onrender.com/api/health` every 14 minutes. `/api/health` touches no database and is exempt from rate limiting.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Build fails on Render | `PYTHON_VERSION=3.11.9` is set; read the build log. |
| 502 / service won't start | Render logs; `DATABASE_URL`; `SECRET_KEY` is not the default; the free database has not expired. |
| Signed out right after login, or 403 CSRF errors | `REACT_APP_API_URL` must be `/api`, not the Render URL; the `vercel.json` rewrite must point at your backend. |
| CORS errors | `ALLOWED_ORIGINS` matches the exact frontend URL (https, no trailing slash); redeploy the backend. |
| Everyone hits rate limits together | Set `TRUSTED_PROXY_HOPS` (2 behind the Vercel rewrite). |
| No admin account | Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` and redeploy. They are only used when no admin exists yet. |
| `REACT_APP_*` value ignored | The name must start with `REACT_APP_`; redeploy after changing it. Values are baked in at build time. |
| Vercel build fails on warnings | Run `CI=true npm run build` and `npx tsc --noEmit` locally. |

Logs: Render → service → **Logs**; Vercel → project → **Deployments**.

---

## Redeploying and rollback

- Push to the deployed branch. Render and Vercel auto-deploy.
- Manual: Render → **Manual Deploy → Deploy latest commit**; Vercel → **Deployments → Redeploy**.
- Rollback: Render → **Events** → roll back to a previous deploy; Vercel → **Deployments** → **Promote to Production** on an earlier build.

---

## Deployment checklist

- [ ] Repository pushed; no `.env` committed
- [ ] Render database and backend created (Blueprint or manual), same region
- [ ] `SECRET_KEY`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TRUSTED_PROXY_HOPS` set; `DEBUG=False`
- [ ] `/api/health` returns healthy
- [ ] `frontend/vercel.json` rewrite points at your Render URL
- [ ] Vercel project deployed with `REACT_APP_API_URL=/api`
- [ ] `ALLOWED_ORIGINS` (and `ALLOWED_ORIGINS_REGEX`) updated with your Vercel URL
- [ ] Smoke test passed (Part 3)
- [ ] Database expiry date noted (free tier: 30 days)
- [ ] Reviewed [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)
