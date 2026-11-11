# Database Utility Scripts

Command-line helpers for PixelFlow's database. PostgreSQL installation, configuration and the schema are in
[guides/DATABASE_SETUP.md](../../guides/DATABASE_SETUP.md). Local setup is in
[INSTALLATION.md](../../INSTALLATION.md).

## How to run them

From `backend/`, with the venv active:

```bash
cd backend
python database/list_users.py
```

All scripts are interactive or take no input. **None of them accept command-line flags or arguments.**

Which database they use:

All scripts use the app's settings: `backend/.env` plus the shell environment. `USE_SQLITE=True` means
`backend/pixelflow.db`; otherwise `DATABASE_URL`.

| Script | Purpose |
|---|---|
| `init_db.py` | Create tables and an admin user (interactive) |
| `list_users.py` | Print all users |
| `reset_password.py` | Set a new password for a user (interactive) |
| `backup_database.py` | Timestamped backup (`pg_dump`, or file copy for SQLite) |
| `restore_database.py` | Restore a backup (interactive) |
| `cleanup_database.py` | Run the cleanup job once, now |
| `migrate_to_postgres.py` | Copy data from SQLite to PostgreSQL |
| `verify_business_rules.py` | Check that quota and cleanup rules are wired into the code |
| `debug_images.py`, `debug_pipelines.py` | Dump sessions/images or saved pipelines |

---

### init_db.py

```bash
python database/init_db.py
```

Creates any missing tables (`Base.metadata.create_all`, the same thing the backend does on startup), then
prompts for an admin's email, username, optional full name and password (min 8 characters, entered twice). It
refuses if that email or username already exists, and offers to retry. Existing data is never dropped.

You don't need it to get started: tables are created on startup, and setting `ADMIN_EMAIL` /
`ADMIN_PASSWORD` creates the first admin automatically. There are no default credentials.

### list_users.py

```bash
python database/list_users.py
```

Prints every user's ID, email, username, full name, active/admin flags and created/updated times. It doesn't
show OAuth fields or pipeline counts.

### reset_password.py

```bash
python database/reset_password.py
```

Lists all users (admins marked `[ADMIN]`), asks you to pick one by number, then asks for the new password
(min 8 characters, entered twice) and stores its bcrypt hash. It also works for Google-only users, giving them
a password. Existing refresh tokens are not revoked.

### backup_database.py

```bash
USE_SQLITE=False DATABASE_URL=postgresql://user:pass@localhost:5432/pixelflow \
  python database/backup_database.py
```

- **PostgreSQL** (`USE_SQLITE` not `True`): runs `pg_dump --clean --if-exists --no-owner --no-privileges`
  into `backend/database/backups/pixelflow_backup_YYYYMMDD_HHMMSS.sql`. `pg_dump` must be on `PATH`.
  `postgres://` URLs and `?sslmode=` are supported.
- **SQLite** (`USE_SQLITE=True`): copies `backend/pixelflow.db` to
  `backend/database/backups/pixelflow_sqlite_backup_YYYYMMDD_HHMMSS.db`.

Backups go to **`backend/database/backups/`**, and only the 10 most recent of each type are kept. The script
exits with status 1 on failure, so it can be scheduled:

```bash
# crontab: daily at 02:00 (reads backend/.env)
0 2 * * * cd /path/to/PixelFlow/backend && env/bin/python database/backup_database.py
```

For managed databases (Render and similar), the provider's backups are usually the better option.

### restore_database.py

```bash
python database/restore_database.py
```

Lists the backups of the current type in `backend/database/backups/`, asks for a number, and asks for confirmation (`yes`).

- **PostgreSQL:** runs `psql -f <backup>.sql`. The dump contains `DROP ... IF EXISTS`, so existing tables are
  replaced. `psql` must be on `PATH`.
- **SQLite:** first copies the current `backend/pixelflow.db` to `pixelflow.db.backup`, then
  overwrites it with the chosen backup.

Restart the backend afterwards.

### cleanup_database.py

```bash
python database/cleanup_database.py
```

Runs `CleanupService.run_full_cleanup` once, the same job the backend runs every 15 minutes. It deletes
expired sessions and their images, uploads and processed images past their retention, orphaned images, and
expired refresh tokens, then prints counts. Retention periods come from the `system_settings` row (Admin panel).
The `CleanupTriggers` constants in `app/core/business_rules.py` can switch individual tasks off. User accounts
and saved pipelines are never touched.

It runs even when the admin **auto-cleanup** switch is off (the switch only pauses the background job), the
same as the admin panel's "Run Cleanup Now" button.

### migrate_to_postgres.py

```bash
python database/migrate_to_postgres.py
```

Copies users, saved pipelines, processing history and API keys from SQLite into the PostgreSQL database in
`DATABASE_URL`, after a `yes` confirmation. It requires `USE_SQLITE=False` and a PostgreSQL `DATABASE_URL`,
and reads SQLite from `backend/pixelflow.db` (the app's local database). What is and
isn't copied, and how duplicates are handled:
[DATABASE_SETUP.md §Migrating](../../guides/DATABASE_SETUP.md#migrating-from-sqlite-to-postgresql).

### verify_business_rules.py

```bash
python database/verify_business_rules.py
```

A code check, not a data check. It inspects the source of the pipeline, upload and logout routes to confirm
the quota, image-count and logout-cleanup rules are referenced, checks that the cleanup service and quota
manager import, and prints the seed defaults from `app/core/business_rules.py`. The live values are in
`system_settings` (Admin panel).

### debug_images.py / debug_pipelines.py

```bash
python database/debug_images.py      # sessions with their image counts, uploaded/processed images
python database/debug_pipelines.py   # saved pipelines with owner and pipeline_data
```

Read-only dumps for debugging.

---

## Troubleshooting

- **`No module named 'app'` / `'sqlalchemy'`:** activate the backend venv first.
- **`database is locked` (SQLite):** stop the backend, or anything else holding `backend/pixelflow.db`, and
  retry.
- **Backup/restore uses the wrong database:** check `USE_SQLITE` / `DATABASE_URL` in `backend/.env` (or the
  shell, which takes precedence).
- **`pg_dump` / `psql` not found:** install the PostgreSQL client tools and add them to `PATH` (Windows:
  `C:\Program Files\PostgreSQL\<version>\bin`).
- **`Failed to parse DATABASE_URL`:** use `postgresql://user:password@host:port/dbname` with no query string
  and no `:` or `@` in the password.
- PostgreSQL connection and permission errors:
  [DATABASE_SETUP.md §Troubleshooting](../../guides/DATABASE_SETUP.md#troubleshooting-postgresql).

## Security

- Backups contain password hashes and users' images. Keep `backend/database/backups/` out of version control
  (the root `.gitignore` covers `*.db` files but not the `.sql` dumps there) and store copies securely.
- Use a dedicated database user, not `postgres`, and strong passwords.
- Never commit `.env` files.
