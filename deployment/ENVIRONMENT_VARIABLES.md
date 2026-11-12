# Environment variables

The one reference for every variable PixelFlow reads. Other docs link here instead of
repeating it. Backend values go in `backend/.env` locally (template: `backend/.env.example`)
or in Render → your service → Environment. Frontend values go in Vercel → Project → Settings →
Environment Variables. They are compiled in at build time, so redeploy after changing them.

## Backend

### Must set in production

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Render's Internal Database URL works when the backend is on Render. `postgres://` is rewritten to `postgresql://`. |
| `SECRET_KEY` | output of `python -c "import secrets; print(secrets.token_urlsafe(32))"` | Signs tokens and the admin-PIN cookie. The app **refuses to start** in production with the default. |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Comma-separated CORS origins, no trailing slash. (`CORS_ORIGINS` is not read.) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Creates the first admin on startup if no admin exists. Optional: `ADMIN_USERNAME`, `ADMIN_FULL_NAME`. |
| `TRUSTED_PROXY_HOPS` | `2` | How many proxies append to `X-Forwarded-For`. `2` when the browser calls Vercel, which proxies `/api` to Render (the recommended setup). `1` when the browser calls Render directly. Default `0` uses the socket peer: behind proxies every visitor then shares one rate-limit bucket. |
| `DEBUG` | `False` | `True` enables reload and relaxes production checks. |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `ALLOWED_ORIGINS_REGEX` | — | Extra origins by regex, e.g. Vercel previews: `https://your-app(-[a-z0-9]+)*\.vercel\.app`. |
| `USE_SQLITE` | `False` | `True` uses a local SQLite file instead of `DATABASE_URL` (what `start.sh` does). |
| `COOKIE_SECURE` | on unless `DEBUG` | Secure flag on auth cookies. |
| `COOKIE_SAMESITE` | `lax` | Keep `lax` with the same-origin proxy. `none` (forces Secure) only for cross-site API calls, which Safari blocks. |
| `COOKIE_DOMAIN` | — | Only to share cookies across subdomains. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Enable Google sign-in ([guide](../guides/GOOGLE_OAUTH_SETUP.md)). The ID token is verified with the client ID. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/auth/google/callback` | Only used by the legacy redirect route `GET /api/auth/google/login`. The app's Google button uses a popup and needs no redirect URI. |
| `DB_CONNECT_RETRIES`, `DB_CONNECT_BASE_DELAY` | `5`, `1` (s) | Startup retries while the database wakes up (exponential backoff). |
| `DB_CLEANUP_INTERVAL_SECONDS` | `900` | How often the built-in cleanup job runs. Whether it deletes anything is the admin's Auto-cleanup switch (Admin → Retention). |
| `DB_CLEANUP_INITIAL_DELAY_SECONDS` | `120` | Delay before the first run after startup. |
| `HOST`, `PORT` | `0.0.0.0`, `8000` | Render sets `PORT` itself. |
| `APP_NAME`, `VERSION` | `PixelFlow`, `1.3.0` | Shown at `/` and in logs. |

### Image storage (optional)

Image bytes are stored in the database by default. With `STORAGE_BACKEND=s3` they go to a
private S3-compatible bucket instead (AWS S3, Cloudflare R2, MinIO); the database keeps the
object key, the metadata and the small thumbnail. The API still serves every image itself
(no public URLs). Setup: [Object storage](DEPLOYMENT_GUIDE.md#object-storage-optional).

| Variable | Default | Notes |
|---|---|---|
| `STORAGE_BACKEND` | `database` | `database` or `s3`. Any other value, or `s3` without `S3_BUCKET`, **stops startup** with a message naming the problem. |
| `S3_BUCKET` | — | Required with `s3`. Keep the bucket private. |
| `S3_ENDPOINT_URL` | — (AWS) | For R2: `https://<account-id>.r2.cloudflarestorage.com`. For MinIO: e.g. `http://localhost:9000`. |
| `S3_REGION` | — | AWS region (e.g. `eu-central-1`); `auto` for R2. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | Set both, or neither to use the AWS default credential chain (IAM role, `AWS_*` variables). |
| `S3_PREFIX` | `pixelflow/` | Prefix of every object key (`<prefix>uploads/<id>.jpg`). Rows store the full key, so changing it later doesn't break existing images. |

Switching to `s3` is safe at any time: existing images stay in the database and remain readable;
new uploads go to the bucket. Switching back to `database` makes bucket images unreadable (the
API returns 503 with an explanation) until `s3` is configured again.

Token lifetimes (access 30 min, refresh 7 days), rate limits and upload limits are constants in
`backend/app/core/security_config.py`, not environment variables. Quotas, retention periods
and session lifetimes are edited in the admin panel (stored in the `system_settings` table).

## Frontend

| Variable | Value | Notes |
|---|---|---|
| `REACT_APP_API_URL` | `/api` in production | Relative, so the API is same-origin and cookies are first-party. `frontend/vercel.json` rewrites `/api/*` to the Render backend: set its destination to your backend URL. Locally `start.sh` writes `http://localhost:8000/api` to `frontend/.env.local`. |
| `REACT_APP_GOOGLE_CLIENT_ID` | — | Shows the Google button. Must match the backend's `GOOGLE_CLIENT_ID`. |
| `REACT_APP_TOKEN_REFRESH_MINUTES` | `20` | Refresh tokens proactively after this many minutes. Keep it below the 30-minute access-token lifetime. |

## Troubleshooting

- **A variable has no effect.** Check the exact (case-sensitive) name against the tables above,
  then redeploy. Frontend variables must start with `REACT_APP_` and need a new build.
- **CORS error in the browser.** `ALLOWED_ORIGINS` must contain the exact origin (scheme, host,
  no trailing slash). With the Vercel proxy, requests are same-origin and CORS doesn't apply.
- **Signed out after every request, or 403 CSRF errors in production.** The frontend is calling
  the backend cross-site. Use `REACT_APP_API_URL=/api` with the Vercel rewrite.
- **Backend won't start: database unreachable.** Check `DATABASE_URL`. A Render free database is
  deleted 30 days after creation; the startup log names the host it couldn't reach.
- **Everyone hits the rate limit at once.** Set `TRUSTED_PROXY_HOPS`.
