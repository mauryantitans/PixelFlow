# Development Guide

Conventions and workflows for contributing to PixelFlow.

- **Setup:** [INSTALLATION.md](../INSTALLATION.md) (`./start.sh` / `start.bat`, `docker compose up`, or manual).
- **Architecture and project layout:** [CLAUDE.md §Architecture](../CLAUDE.md#architecture). It covers the
  operation registry in `backend/app/processing/`, pipeline execution and the prefix cache, the backend and
  frontend layout, sessions, and cookie/CSRF auth. It is kept current; this guide doesn't repeat it.
- **Adding an operation:** [ADDING_OPERATIONS.md](ADDING_OPERATIONS.md). Operations are declared once in the
  backend; the UI needs no changes.
- **Environment variables:** [deployment/ENVIRONMENT_VARIABLES.md](../deployment/ENVIRONMENT_VARIABLES.md).

---

## Code style

### Python (backend)

- PEP 8, enforced by **ruff** (`backend/pyproject.toml`: line length 100; rules E, F, W, I, UP, B).
  CI lints and format-checks `app/processing` and `tests`. Older modules are being brought in gradually, so
  new code under `app/processing` must pass the full rule set.
- Type hints on all new functions. **mypy** runs on `app/processing` and `app/utils/datetime_utils.py`.
- Docstrings for public functions (Args / Returns / Raises when they aren't obvious).
- Operation bodies are plain `fn(image, **params) -> PIL.Image`. Validation and coordinate mapping belong in
  the `ParamSpec`s and `coords.py`, not in the operation.

```python
def process_image(image: Image.Image, strength: int = 50) -> Image.Image:
    """Apply the effect with the given strength (0-100)."""
    ...
```

### TypeScript (frontend)

- Functional components and hooks only. No class components.
- Strict types (`npx tsc --noEmit` must pass). Schema DTOs live in `frontend/src/types/index.ts`.
- `const` by default.
- Tailwind utility classes, with a `dark:` variant for every color:

```tsx
<div className="bg-white dark:bg-zinc-900 rounded-lg p-4 border border-slate-300 dark:border-zinc-800">
  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Title</h3>
</div>
```

- Component order: imports, types, component (hooks, handlers, effects, render).
- Don't add per-operation UI. Controls are rendered from the `/operations` schema by
  `components/params/ParamControl.tsx`.

---

## Workflow and commits

1. Branch: `git checkout -b feature/my-change`
2. Make the change, then run the checks below.
3. Test by hand in light and dark mode, with small and large images, and with error cases.
4. Commit and open a PR. CI (`.github/workflows/ci.yml`) runs on every pull request.

Commit message format:

```
type(scope): short description (about 50 characters)

Longer description if needed: what changed and why.

Fixes #123
```

Types used in this repo: `feat`, `fix`, `docs`, `test`, `perf`, `a11y`, `chore` (see
[CONTRIBUTING.md](../CONTRIBUTING.md)).

---

## Testing

### Backend (from `backend/`, venv active)

```bash
pip install -r requirements-dev.txt        # pytest, ruff, mypy on top of requirements.txt

ruff check app/processing tests            # lint (same scope as CI)
ruff format --check app/processing tests   # formatting
mypy                                       # scope is set in pyproject.toml
pytest                                     # full suite (tests/)
pytest tests/test_executor.py -k coerce    # one file / expression
pytest -q                                  # quiet
```

CI runs pytest with `DEBUG=True USE_SQLITE=True SECRET_KEY=ci-secret-key`. Set the same variables if your
`backend/.env` points at PostgreSQL.

### Frontend (from `frontend/`)

```bash
npx tsc --noEmit                 # strict type-check (CI)
npm test -- --watchAll=false     # Jest smoke tests (CI); plain `npm test` starts watch mode
CI=true npm run build            # what Vercel runs: ESLint warnings fail the build
```

There is no separate `npm run lint` script. ESLint runs as part of `npm start` / `npm run build`.

### Browser checks (stack running)

These need `puppeteer-core`, which is installed outside the repo. Environment variables are listed in each
file's header.

```bash
python3 scripts/e2e/make_fixtures.py      # test images -> scripts/e2e/fixtures/
node scripts/e2e/serve-build.js frontend/build 3000   # serve the production build
node scripts/e2e/workflows.js             # uploads, live preview, batch Stop/Apply, picking, reload
node scripts/e2e/session-flow.js          # sign-in, token expiry, shared-browser sessions
node scripts/e2e/custom-filters.js        # kernel editor, step on/off, saved filters
node scripts/e2e/product.js               # samples, drag-and-drop, share links, theme sync
node scripts/e2e/batch-jobs.js            # background batch survives a reload
node scripts/e2e/appearance.js            # theme picker
node a11y-reports/scripts/audit.js        # accessibility audit (VIEWPORT=320x640 for mobile)
node a11y-reports/scripts/keyboard-checks.js
```

See [a11y-reports/REPORT.md](../a11y-reports/REPORT.md).

### Manual checklist

- [ ] Upload one image, then several (file picker)
- [ ] Simple operation (Brightness) and an operation with a kernel (Canny Edge Detection)
- [ ] Live Processing with one image selected; interactive picks (Flood Fill seed point, Crop region)
- [ ] Batch mode: Apply Pipeline, then Stop mid-run
- [ ] Reorder steps (buttons / Alt+Arrow), undo/redo, reload the page (pipeline persists)
- [ ] Save and load a pipeline (signed in)
- [ ] Gallery, Inspector (normal / slider / difference views), downloads
- [ ] Admin panel (admin account), Google sign-in (if configured), sign out

---

## Debugging

### Backend

- Run with `DEBUG=True` for hot reload and SQL echo (`echo=settings.DEBUG` on the engine).
- Log level is set by `logging.basicConfig(level=logging.INFO, ...)` in `backend/app/main.py`. Change it to
  `logging.DEBUG` temporarily for more detail.
- Use `logger.debug(...)` / `logger.info(...)` rather than `print`.
- Interactive API docs at http://localhost:8000/docs.
- A failing pipeline step returns a structured `StepError` (shown in the step's error banner) instead of
  failing the whole request. Check that first.
- Inspect the database with the scripts in [backend/database/README.md](../backend/database/README.md)
  (`python database/list_users.py`, `python database/debug_images.py`, `python database/debug_pipelines.py`).

### Frontend

- React DevTools for component state and props.
- Browser Network tab for API calls. Auth is in httpOnly cookies (`pf_access`, `pf_refresh`); unsafe requests
  must carry `X-CSRF-Token` matching the `pf_csrf` cookie.
- The header connection badge only pings `GET /api/health`.

---

## Dependencies

- **Backend:** add the pinned package to `backend/requirements.txt` (runtime) or `requirements-dev.txt`
  (tooling), then `pip install -r ...`.
- **Frontend:** `npm install <package>` (updates `package.json` and `package-lock.json`; CI uses `npm ci`).

---

## Database schema changes

Schema changes are Alembic migrations, and the backend applies them itself on every start
(`run_migrations()` in `backend/app/core/database.py`), on Render, Docker and locally alike.

1. Change the model in `backend/app/models/db_models.py`.
2. Add a revision in `backend/alembic/versions/` (`alembic revision -m "..."` from `backend/`) whose
   `down_revision` is the current head.
3. Make it **idempotent** with `backend/app/core/migration_helpers.py` (`add_column_if_missing`,
   `has_table`, …): a fresh database already gets current columns from `0001_baseline`, and older
   production databases were built by `create_all` before migrations existed.
4. `pytest tests/test_migrations.py` checks a fresh database, an adopted one and a repeated run.

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for PostgreSQL specifics.

---

## Common tasks

- **New API route:** add a module under `backend/app/api/routes/`, register its router in
  `backend/app/api/__init__.py` (everything is mounted under `/api`), and add a test in `backend/tests/`.
  Unsafe cookie-authenticated requests go through the CSRF middleware.
- **New operation:** see [ADDING_OPERATIONS.md](ADDING_OPERATIONS.md).
- **New component:** add it under `frontend/src/components/` and import it where needed. The dev server
  hot-reloads.

---

## Troubleshooting

Local setup problems (ports, `SECRET_KEY`, database connection, CORS, cookies) are covered in
[INSTALLATION.md §Troubleshooting](../INSTALLATION.md#troubleshooting). Development-specific ones:

- **Changes not reflecting (backend):** hot reload needs `DEBUG=True` or `--reload` (`start.sh` uses it).
- **`tsc` passes but the Vercel build fails:** run `CI=true npm run build`. ESLint warnings are errors there.
- **mypy or ruff fails in CI only:** run them from `backend/` with the same paths as above. Scope is set in
  `pyproject.toml`.

---

## Learning resources

[FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy](https://docs.sqlalchemy.org/) ·
[Pydantic](https://docs.pydantic.dev/) · [OpenCV Python](https://docs.opencv.org/4.x/d6/d00/tutorial_py_root.html) ·
[scikit-image](https://scikit-image.org/docs/stable/) · [React](https://react.dev/) ·
[TypeScript](https://www.typescriptlang.org/docs/) · [Tailwind CSS](https://tailwindcss.com/docs) ·
[React Router](https://reactrouter.com/)
