# Alternative Hosting Options for PixelFlow

The supported, documented setup is **Render (backend + PostgreSQL) + Vercel (frontend)**. See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md). This page covers other hosts and self-hosting.

Free tiers and prices change often. Check each provider's current pricing before you choose.

---

## The one hard requirement: a same-origin `/api`

Auth uses httpOnly cookies (`pf_access`, `pf_refresh`, `pf_csrf`) with double-submit CSRF. Browsers block these cookies as third-party when the frontend calls a backend on another site. So whatever you host on:

- Build the frontend with `REACT_APP_API_URL=/api` (relative).
- Have the frontend host proxy `/api/*` to the backend's `/api/*`. On Vercel this is the rewrite in `frontend/vercel.json`.
- On the backend, set `ALLOWED_ORIGINS` to the frontend URL and `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app. Everything else is in [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

Pointing `REACT_APP_API_URL` straight at the backend (e.g. `https://my-backend.example.com/api`) breaks sign-in in Safari and Chrome.

---

## Other backend hosts (keep the frontend on Vercel)

With the frontend on Vercel, changing the backend only means changing the rewrite destination in `frontend/vercel.json`. `REACT_APP_API_URL` stays `/api`.

### Railway
- Create a project from GitHub with root `backend/`, and add a PostgreSQL service.
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- Optional `backend/railway.json`:
  ```json
  {
    "build": { "builder": "NIXPACKS" },
    "deploy": {
      "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1",
      "restartPolicyType": "ON_FAILURE"
    }
  }
  ```

### Fly.io
- Needs the `fly` CLI. From `backend/`, run `fly launch`, then `fly postgres create` and attach it, then `fly deploy`.
- `backend/Dockerfile` exists, but its entrypoint starts uvicorn with `--reload` on port 8000. Override the command for production (see [Self-hosting](#self-hosting)).

Not recommended: Heroku (no free tier) and PythonAnywhere (very limited free tier).

---

## Other frontend hosts (keep the backend on Render)

Each one must proxy `/api/*` to the backend.

### Netlify
Base directory `frontend`, build `npm run build`, publish `build`, `REACT_APP_API_URL=/api`. `frontend/netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "build"

# Same-origin API proxy (must come before the SPA fallback)
[[redirects]]
  from = "/api/*"
  to = "https://YOUR-BACKEND.onrender.com/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/static/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Cloudflare Pages
Preset Create React App, root `frontend`, output `build`, `REACT_APP_API_URL=/api`. Pages `_redirects` cannot proxy to another domain. Add a Pages Function (or Worker) on `/api/*` that forwards requests to the backend.

### GitHub Pages
Static hosting only, with no way to proxy `/api`. Cookie auth will not work reliably. **Not supported.**

---

## Database alternatives

Any PostgreSQL works. Set `DATABASE_URL` (`postgres://` is rewritten to `postgresql://`). Supabase and Neon both offer hosted Postgres. MySQL services are not supported.

---

## Self-hosting

### Docker

The root `docker-compose.yml` is a **development** stack: `DEBUG=True`, a dev `SECRET_KEY`, the backend with `--reload`, and the React dev server. Use `docker compose up` for local work only. For production:

- Backend: build `backend/Dockerfile`. Override its entrypoint so it does not use `--reload`:
  ```yaml
  entrypoint: ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
  ```
  Set `DEBUG=False`, a real `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `TRUSTED_PROXY_HOPS`. Drop the source-code volume mounts.
- Database: a PostgreSQL container with a strong password and a named volume. Don't publish port 5432 publicly.
- Frontend: `frontend/Dockerfile` runs the dev server. For production, run `REACT_APP_API_URL=/api npm run build` and serve `frontend/build/` as static files from the reverse proxy.

### Reverse proxy (same origin)

Serve the built frontend and proxy `/api` from one domain. nginx example:

```nginx
server {
    server_name pixelflow.example.com;
    client_max_body_size 100m;   # nginx default is 1 MB; uploads go up to 50 MB per file

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /srv/pixelflow/build;
        try_files $uri /index.html;
    }
}
```

With only this proxy in front of the app, use `TRUSTED_PROXY_HOPS=1`. Add one for each extra proxy (e.g. Cloudflare).

### PostgreSQL on a server

```sql
CREATE DATABASE pixelflow;
CREATE USER pixelflow_user WITH PASSWORD 'change-me';
GRANT ALL PRIVILEGES ON DATABASE pixelflow TO pixelflow_user;
\c pixelflow
GRANT ALL ON SCHEMA public TO pixelflow_user;
```

Tables are created on startup (and `alembic upgrade head` runs in the Docker entrypoint). See [../guides/DATABASE_SETUP.md](../guides/DATABASE_SETUP.md).

### SSL / HTTPS

HTTPS is required: in production, auth cookies are `Secure` (`COOKIE_SECURE` defaults to on when `DEBUG=False`).
- Let's Encrypt: `sudo certbot --nginx -d pixelflow.example.com` (renewal runs automatically; check it with `certbot renew --dry-run`).
- Cloudflare in front: use "Full (strict)" SSL mode.
- Cloud load balancers (AWS ALB, GCP) can terminate TLS for you.

### Backups and maintenance

- Back up with `backend/database/backup_database.py` (restore with `restore_database.py`) or `pg_dump`. Schedule it with cron, e.g. `0 2 * * * cd /path/to/backend && python database/backup_database.py`.
- Cleanup of expired sessions and images runs **inside the backend** every 15 minutes. It needs no cron.

### Scaling

- Run **one worker per backend instance** (`--workers 1`). The rate limiter and the live-preview prefix cache are in memory and per process.
- More workers or instances would split rate-limit counters and lower cache hits. A shared (e.g. Redis-backed) limiter is **not implemented**.
- To scale, start with a larger instance (more CPU/RAM for image processing) and a managed PostgreSQL with backups.

### Rollback

- Render / Railway / Fly.io: redeploy a previous release from the dashboard or CLI.
- Docker: tag images per release (e.g. `pixelflow-backend:1.2.0`), then point compose at the previous tag and run `docker compose up -d`.
- Source: check out the last good tag or commit, rebuild and redeploy. Back up the database before running migrations.
