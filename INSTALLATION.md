# PixelFlow Installation Guide

How to run PixelFlow (v1.2.0) on your own machine, create the first admin, and fix common local problems.
For production see [deployment/DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md).

---

## Prerequisites

- **Python 3.11** (the version used by `backend/Dockerfile`, `runtime.txt` and CI)
- **Node.js 18+** and npm (CI uses Node 20; the frontend Docker image uses Node 18)
- **Git**
- Optional: **Docker** (for `docker compose`) or a local **PostgreSQL** server. SQLite needs no setup.

```bash
git clone https://github.com/Mauryantitans/PixelFlow.git
cd PixelFlow
```

---

## Option 1: one command (SQLite, no Docker)

```bash
./start.sh        # macOS / Linux / Git Bash
start.bat         # Windows
```

The script:

- finds or creates a virtualenv (`env/`, `.venv/` or `venv/` at the repo root, or `backend/env`, `backend/.venv`) and installs `backend/requirements.txt`;
- starts the backend on http://localhost:8000 with `USE_SQLITE=True DEBUG=True` and hot reload (database file: `backend/pixelflow.db`);
- runs `npm install` if `frontend/node_modules` is missing;
- writes `frontend/.env.local` with `REACT_APP_API_URL=http://localhost:8000/api` (only if the file doesn't exist yet);
- starts the frontend on http://localhost:3000.

Press Ctrl+C to stop both. Values in `backend/.env` (for example `ADMIN_EMAIL`, see below) are still read; `USE_SQLITE` and `DEBUG` set by the script take precedence.

## Option 2: Docker Compose (PostgreSQL)

```bash
docker compose up            # first run builds the images
docker compose down -v       # stop and wipe the database volume
```

Backend on :8000, frontend on :3000, PostgreSQL 15 on :5432 (`postgres` / `postgres`, database `pixelflow`).
The compose file sets a development `SECRET_KEY` and `DEBUG=True`.

## Option 3: manual setup

**Backend** (terminal 1):

```bash
cd backend
python -m venv env
source env/bin/activate          # Windows: env\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
```

Edit `backend/.env`. The template defaults to PostgreSQL, so for local SQLite set at least:

```env
USE_SQLITE=True
DEBUG=True
SECRET_KEY=<output of: python -c "import secrets; print(secrets.token_urlsafe(32))">
```

With `DEBUG=False` the backend refuses to start while `SECRET_KEY` is the default. Every other variable is
documented in [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md).

```bash
python run.py                    # or: uvicorn app.main:app --reload
```

Tables are created automatically on startup (`Base.metadata.create_all`), so no separate init step is needed.

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm start
```

The frontend calls `REACT_APP_API_URL`, which must include the `/api` prefix. Locally it defaults to
`http://localhost:8000/api`, so `frontend/.env.local` is optional. Create it only to change the URL or to add
`REACT_APP_GOOGLE_CLIENT_ID`.

To use PostgreSQL instead of SQLite, see [guides/DATABASE_SETUP.md](guides/DATABASE_SETUP.md).

---

## First admin account

There are **no default credentials**. Create the first admin in one of two ways:

1. **On startup (recommended).** Add to `backend/.env` and start (or restart) the backend:
   ```env
   ADMIN_EMAIL=you@example.com
   ADMIN_PASSWORD=<a strong password>
   # optional: ADMIN_USERNAME (default "admin"), ADMIN_FULL_NAME
   ```
   If no admin exists yet, one is created from these values. If an admin already exists, they are ignored.
   With Docker Compose, put them in `backend/.env` and rebuild (`docker compose up --build`), or add them
   under the backend service's `environment:` in `docker-compose.yml`.

2. **Interactively.** From `backend/` with the venv active:
   ```bash
   python database/init_db.py
   ```
   It creates the tables and prompts for email, username, optional full name and password (min 8 characters).

Other users register through the app (http://localhost:3000/auth). To reset a forgotten password or list
accounts, use the scripts in [backend/database/README.md](backend/database/README.md).

Google sign-in is optional: [guides/GOOGLE_OAUTH_SETUP.md](guides/GOOGLE_OAUTH_SETUP.md).

---

## Verify the installation

```bash
curl http://localhost:8000/health
# {"status":"healthy","app":"PixelFlow","version":"...", ...}
```

API docs: http://localhost:8000/docs. Then open http://localhost:3000/app, upload an image, add an
operation (for example Grayscale) and click **Apply Pipeline**.

---

## Troubleshooting

**`ModuleNotFoundError` when starting the backend**
Activate the venv and run `pip install -r requirements.txt` from `backend/`.

**Backend exits with "SECRET_KEY is still the default insecure value"**
Set `SECRET_KEY` in `backend/.env`, or set `DEBUG=True` for local development.

**Backend can't connect to the database**
You are on the PostgreSQL default (`USE_SQLITE` unset or `False`) without a running server. Set
`USE_SQLITE=True`, use `docker compose up`, or follow [guides/DATABASE_SETUP.md](guides/DATABASE_SETUP.md).

**Port 8000 or 3000 already in use**
```bash
lsof -i :8000                     # macOS / Linux, then: kill <PID>
netstat -ano | findstr :8000      # Windows, then: taskkill /F /PID <PID>
```
Or set `PORT=8001` in `backend/.env` (and point `REACT_APP_API_URL` at it). `npm start` offers another port
when 3000 is taken.

**CORS errors in the browser console**
With `ALLOWED_ORIGINS` unset, the usual localhost dev origins are allowed; once set (the template sets
`http://localhost:3000`), only the listed origins are. If you open the frontend from another host or port, add
that exact origin to `ALLOWED_ORIGINS` in `backend/.env` (comma-separated, no trailing slash).

**Signed in, but requests act as a guest (or 403 CSRF errors)**
Auth uses httpOnly cookies. Open the frontend at `http://localhost:3000` (not `127.0.0.1`, unless both the
frontend and `REACT_APP_API_URL` use the same host), and restart `npm start` after changing `.env.local`.

**Start with a clean local database**
Stop the backend, delete `backend/pixelflow.db`, and start it again. Tables are recreated and the
`ADMIN_EMAIL` admin is created again. With Docker: `docker compose down -v`.

**`npm install` fails**
`npm cache clean --force`, delete `frontend/node_modules`, and run `npm install` again.

**The app still looks the same after a change**
Hard-refresh the browser (Ctrl+Shift+R). The backend only hot-reloads with `DEBUG=True` (or `--reload`).

---

## Next steps

- [Getting Started](guides/GETTING_STARTED.md): using the app
- [Development](guides/DEVELOPMENT.md): code style, tests, debugging
- [Adding Operations](guides/ADDING_OPERATIONS.md)
- [Admin Panel](guides/ADMIN_PANEL.md)
- [API Reference](guides/API_REFERENCE.md)
- [Deployment](deployment/DEPLOYMENT_GUIDE.md)

Questions and bugs: [GitHub Issues](https://github.com/Mauryantitans/PixelFlow/issues).

## License

PixelFlow is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
