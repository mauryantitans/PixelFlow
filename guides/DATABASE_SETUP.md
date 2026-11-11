# Database Setup Guide

Installing and configuring PostgreSQL for PixelFlow, moving data from SQLite, and the schema.

- Local SQLite setup and the first admin: [INSTALLATION.md](../INSTALLATION.md)
- Utility scripts (backup, restore, cleanup, list users, reset password): [backend/database/README.md](../backend/database/README.md)
- All database-related environment variables: [deployment/ENVIRONMENT_VARIABLES.md](../deployment/ENVIRONMENT_VARIABLES.md)

---

## Choosing a database

| | SQLite | PostgreSQL |
|---|---|---|
| Setup | None: `USE_SQLITE=True` (what `start.sh` / `start.bat` use) | A server: local install, `docker compose up`, or a managed host |
| File / location | `backend/pixelflow.db` | `DATABASE_URL` |
| Concurrent writes | Limited (file lock) | Yes |
| Use for | Local development, tests | Production (Render), shared environments |

`USE_SQLITE` defaults to `False`. Without it, the backend uses `DATABASE_URL`, which defaults to
`postgresql://postgres:postgres@localhost:5432/pixelflow`.

Images are stored in the database (`uploaded_images.image_data`, `processed_images.image_data`), so the
database is the only persistent store.

---

## PostgreSQL with Docker (quickest)

`docker compose up` starts PostgreSQL 15 (`postgres` / `postgres`, database `pixelflow`, port 5432) together
with the backend and frontend. `docker compose down -v` wipes the data volume. To run only the database and
point a locally run backend at it:

```bash
docker compose up db
# backend/.env
USE_SQLITE=False
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pixelflow
```

---

## Installing PostgreSQL

**Windows:** the installer from https://www.postgresql.org/download/windows/ (include the command line
tools), or `choco install postgresql`.

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```
or [Postgres.app](https://postgresapp.com/).

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

**Fedora / RHEL:**
```bash
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

`pg_dump` and `psql` must be on `PATH` if you use the backup/restore scripts.

---

## Configuring PostgreSQL

### 1. Create the database and user

```bash
sudo -u postgres psql      # Windows: psql -U postgres
```

```sql
CREATE DATABASE pixelflow;
CREATE USER pixelflow_user WITH PASSWORD 'a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE pixelflow TO pixelflow_user;

-- PostgreSQL 15+: the public schema needs an explicit grant
\c pixelflow
GRANT ALL ON SCHEMA public TO pixelflow_user;
\q
```

Generate a password with `openssl rand -base64 32`. Avoid `@`, `:` and `/` in it, or URL-encode them in
`DATABASE_URL`.

### 2. Point the backend at it

In `backend/.env`:

```env
USE_SQLITE=False
DATABASE_URL=postgresql://pixelflow_user:a_strong_password@localhost:5432/pixelflow
# Remote / managed servers usually need TLS:
# DATABASE_URL=postgresql://user:pass@host:5432/pixelflow?sslmode=require
```

Format: `postgresql://user:password@host:port/database`. A `postgres://` URL (as Render and Heroku provide)
is rewritten to `postgresql://` automatically.

### 3. Start the backend

```bash
cd backend
python run.py
```

On startup `init_db()` runs `Base.metadata.create_all`, creating any missing tables. It retries the connection
with exponential backoff (`DB_CONNECT_RETRIES`, default 5) and logs the host it couldn't reach if all attempts
fail. The `system_settings` row is created with default values the first time it's read. Create the first
admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD` or `python database/init_db.py` (see
[INSTALLATION.md](../INSTALLATION.md#first-admin-account)).

### 4. Check

```bash
psql -h localhost -U pixelflow_user -d pixelflow -c '\dt'
```

The tables listed under [Schema](#schema) should be there.

### Hardening (self-hosted servers)

- `postgresql.conf`: keep `listen_addresses = 'localhost'` unless the app runs on another host.
- `pg_hba.conf`: allow only the app host, with password auth, for example
  `host  pixelflow  pixelflow_user  10.0.0.5/32  scram-sha-256`.
- Use TLS (`?sslmode=require`) for any non-local connection.
- Use a dedicated user (not `postgres`) and schedule backups
  ([backup_database.py](../backend/database/README.md#backup_databasepy)).

---

## Migrating from SQLite to PostgreSQL

`backend/database/migrate_to_postgres.py` copies **users, saved pipelines, processing history and API keys**
from SQLite into the PostgreSQL database in `DATABASE_URL`. Sessions, images, login attempts, refresh tokens,
shared links and system settings are **not** copied.

1. Create the PostgreSQL database (above) and back up the SQLite file.
2. In `backend/.env`, set `USE_SQLITE=False` and `DATABASE_URL=postgresql://...`. The script refuses to run
   while either one still points at SQLite.
3. Run it from `backend/` (it reads the app's SQLite file, `backend/pixelflow.db`) and answer `yes` at the prompt:
   ```bash
   python database/migrate_to_postgres.py
   ```

Notes:

- Tables are created first. Users already present (same email) and pipelines already present (same name and
  owner) are skipped. Processing history is not de-duplicated, so a second run copies it again.
- Primary keys are reassigned, and foreign keys are remapped to the new IDs.
- Google link fields (`oauth_provider`, `oauth_id`, `profile_picture`) are not copied. Google users are
  re-linked by email the next time they sign in with Google.
- The SQLite file is left untouched.

Afterwards, verify with `python database/list_users.py` and by signing in to the app.

---

## Schema

The source of truth is `backend/app/models/db_models.py`. Tables:

| Table | Holds | Notable columns |
|---|---|---|
| `users` | Accounts | `email`, `username` (unique), `hashed_password` (NULL for Google-only users), `is_active`, `is_admin`, `oauth_provider`, `oauth_id`, `profile_picture` |
| `refresh_tokens` | Hashed refresh tokens, rotated on every refresh | `user_id`, `token_hash`, `expires_at` |
| `login_attempts` | Sign-in audit and lockout | `email`, `ip_address`, `success`, `attempt_time`, `failure_reason` |
| `sessions` | Browser sessions (id from the frontend) | `user_id`, `last_active`, `expires_at` |
| `uploaded_images` | Uploaded originals as binary | `session_id`, `user_id`, `image_data`, `thumbnail_data`, `width`, `height`, `size_bytes`, `uploaded_at`, `last_accessed` |
| `processed_images` | Results and intermediates | `session_id`, `original_image_id`, `image_data`, `pipeline_data`, `step_index`, `is_final`, `processed_at` |
| `saved_pipelines` | Users' saved pipelines | `user_id`, `name`, `pipeline_data` (JSON list of `{name, params}` steps), `is_public`, `is_template`, `tags` |
| `shared_pipelines` | Share links for pipelines | `pipeline_id`, `share_token`, `expires_at`, `view_count` |
| `processing_history` | Per-run timing | `user_id`, `pipeline_id`, `image_count`, `total_processing_time`, `step_timings` |
| `api_keys` | Hashed API keys | `user_id`, `key_hash`, `key_prefix`, `expires_at` |
| `system_settings` | One row of admin-editable policy | quotas, retention hours/days, session lifetimes, `enable_auto_cleanup`, `admin_pin_hash` |

Saved pipelines reference operations by display name, which resolve through the registry's alias map. Never
rename operation ids or remove aliases (see [CLAUDE.md](../CLAUDE.md#architecture)).

### Schema changes and Alembic

The app creates missing tables at startup but never alters existing ones. Alembic is configured
(`backend/alembic.ini`, `backend/alembic/env.py`), but the repository has no `alembic/versions/` yet, so
`alembic upgrade head` (run by the Docker entrypoint) has nothing to apply. A column change on an existing
database currently needs a manual `ALTER TABLE`. To adopt migrations, see
[DEVELOPMENT.md §Database schema changes](DEVELOPMENT.md#database-schema-changes).

---

## Maintenance

- **Cleanup** runs inside the backend every 15 minutes (`DB_CLEANUP_INTERVAL_SECONDS`). It only deletes when
  the admin's auto-cleanup switch is on; retention comes from `system_settings`. For a manual run, use
  `python database/cleanup_database.py`.
- **Backups:** `python database/backup_database.py`, or your host's managed backups.
- **Size:**
  ```sql
  SELECT pg_size_pretty(pg_database_size('pixelflow'));
  SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size
  FROM pg_tables WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(tablename::regclass) DESC;
  ```
  `uploaded_images` and `processed_images` dominate because they hold image bytes.
- **Connection pool:** `backend/app/core/database.py` creates the engine with `pool_pre_ping=True`,
  `pool_size=5` and `max_overflow=10`. Raise these only if your server's `max_connections` allows it.

---

## Troubleshooting (PostgreSQL)

| Symptom | Fix |
|---|---|
| `Connection refused` / backend exits after retries | The server isn't running or isn't listening. Check `brew services list`, `sudo systemctl status postgresql`, or `docker compose ps`, and the host/port in `DATABASE_URL`. |
| `password authentication failed` | Credentials in `DATABASE_URL` don't match. Reset with `ALTER USER pixelflow_user WITH PASSWORD '...';` |
| `database "pixelflow" does not exist` | `CREATE DATABASE pixelflow;` then grant privileges (step 1). |
| `permission denied for schema public` | PostgreSQL 15+: `\c pixelflow` then `GRANT ALL ON SCHEMA public TO pixelflow_user;` |
| Backend still uses SQLite | `USE_SQLITE=True` is set (`start.sh` / `start.bat` always set it). Use `python run.py` or `docker compose up`. |
| Managed database rejects the connection | Add `?sslmode=require`. On Render, use the Internal Database URL when the backend is on Render too. |

SQLite and script problems: [backend/database/README.md](../backend/database/README.md#troubleshooting).
Local setup problems: [INSTALLATION.md](../INSTALLATION.md#troubleshooting).
