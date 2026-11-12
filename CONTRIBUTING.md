# Contributing to PixelFlow

Thanks for helping. This page covers how to propose a change and what a pull request needs to pass.
By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** with the [bug report form](https://github.com/Mauryantitans/PixelFlow/issues/new/choose).
  Include steps to reproduce, the browser and the theme.
- **Suggest a feature** with the feature request form. Describe the problem first, then the idea.
- **Fix a bug or build a feature.** For anything larger than a small fix, open an issue first so we can
  agree on the approach before you write code.
- **Add an operation.** Usually one function and one registration; see below.
- **Improve the docs.** Corrections are welcome, especially where the docs and the code disagree.
- **Test accessibility** with a screen reader or on a phone, and report what you find.

Security problems are the exception: don't open a public issue. See [SECURITY.md](SECURITY.md).

## Set up

- Install and run the stack: [INSTALLATION.md](INSTALLATION.md). The quickest path is `./start.sh`
  (or `start.bat` on Windows): backend on SQLite with hot reload plus the frontend, no Docker needed.
- Project structure and the main contracts (operation registry, auth, sessions, jobs):
  [CLAUDE.md](CLAUDE.md). Code style, debugging and common tasks: [guides/DEVELOPMENT.md](guides/DEVELOPMENT.md).
- API: [guides/API_REFERENCE.md](guides/API_REFERENCE.md), and `http://localhost:8000/docs` while the
  backend runs. Environment variables: [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md).

## Branches and commits

Branch from `React_FastAPI` (the branch CI badges and deploys track) and give the branch a short,
descriptive name, e.g. `fix/batch-stop` or `feat/webp-output`.

Commit messages follow the Conventional Commits style used in the history:

```
type(scope): short summary in the imperative, lower case

Optional body: what changed and why, wrapped at ~72 characters.

Fixes #123
```

| Type | Use for |
|---|---|
| `feat` | A new user-facing feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `test` | Tests only (unit, browser checks) |
| `perf` | A performance improvement |
| `a11y` | Accessibility work that isn't a plain bug fix (audits, reports) |
| `chore` | Versions, dependencies, tooling |

The scope is optional and names the area: `auth`, `ops`, `processing`, `db`, `storage`, `ui`, `ux`,
`api`, `a11y`, `e2e`, `deploy`. Examples from the log:
`feat(processing): background batch jobs with a database-backed queue`,
`fix(rate-limit): real client IP behind proxies; higher processing limit`.

Keep commits focused: one logical change each, with its tests and docs.

## Quality gate

CI (`.github/workflows/ci.yml`) runs these on every pull request. Run them before you push.

**Backend** (from `backend/`, virtual environment active, `pip install -r requirements-dev.txt`):

```bash
ruff check app/processing tests
ruff format --check app/processing tests
mypy
DEBUG=True USE_SQLITE=True SECRET_KEY=ci-secret-key pytest
```

Ruff and mypy are scoped (in CI and `pyproject.toml`) to the modules that are already clean. New code in
those paths must pass; please don't widen the scope and reformat unrelated files in the same change.

**Frontend** (from `frontend/`, after `npm ci`):

```bash
npx tsc --noEmit
CI=true npm test -- --watchAll=false
CI=true npm run build     # ESLint warnings fail the build, as on Vercel
```

**Browser checks** (CI's `e2e` job). They drive a real browser against a production build. You need
`puppeteer-core` (and, for the accessibility checks, `@axe-core/puppeteer`, `axe-core`, `lighthouse`)
installed outside the repo, with that folder in `TOOLS`:

```bash
npm install --no-save --prefix /tmp/e2e-tools puppeteer-core@23.11.1 @axe-core/puppeteer@4.14.0 axe-core@4.14.0 lighthouse@12.8.2
export TOOLS=/tmp/e2e-tools CHROME_PATH=/path/to/chrome

python3 scripts/e2e/make_fixtures.py /tmp/fixtures             # test images
(cd frontend && REACT_APP_API_URL=http://localhost:8000/api npm run build)
node scripts/e2e/serve-build.js frontend/build 3000             # serves the build on :3000
# backend on :8000 (e.g. USE_SQLITE=True DEBUG=True uvicorn app.main:app), test accounts registered

node scripts/e2e/workflows.js        # uploads, live preview, batch Stop/Apply, picking, reload
node scripts/e2e/session-flow.js     # sign-in, token expiry, shared-browser sessions
node scripts/e2e/custom-filters.js   # kernel editor, step on/off, save and reuse a filter
node scripts/e2e/product.js          # samples, drag-and-drop, share links, theme sync
node scripts/e2e/batch-jobs.js       # reload during a batch, results still arrive
node scripts/e2e/appearance.js       # theme picker
PHASE=ci node a11y-reports/scripts/audit.js
python3 a11y-reports/scripts/check-summary.py a11y-reports/ci/summary.json
```

Each script's header lists the environment variables it needs (images, accounts). The `e2e` job in
`ci.yml` shows the exact values CI uses.

## Adding an operation

Operations are declared once, in the backend registry; the UI renders their controls from the schema, so
no frontend change is needed. Follow [guides/ADDING_OPERATIONS.md](guides/ADDING_OPERATIONS.md): write the
function, register an `OperationSpec` with typed params, add a test. Never rename or reuse an operation
`id`, and never remove an alias: saved pipelines depend on them.

## Database changes

Change the models in `backend/app/models/db_models.py` **and** add an Alembic revision in
`backend/alembic/versions/` (next number, `down_revision` set to the current head). Migrations run
automatically at startup on databases of different ages, so make them idempotent with the helpers in
`backend/app/core/migration_helpers.py`. `tests/test_migrations.py` must keep passing.

## Accessibility

PixelFlow targets **WCAG 2.1 Level AA**, and the audit in CI fails on any finding. For UI changes:

- Every control has an accessible name; icon-only buttons need an `aria-label`.
- Everything works with the keyboard, with a visible focus ring. Dialogs keep focus inside (use
  `useDialog`) and close with Escape.
- Use Tailwind palette classes, not hex colours, so contrast holds in every theme and in dark mode.
- Status changes that matter are announced (`utils/announce.ts`).
- The layout works at 320px wide without sideways scrolling.

Run the audit for the states you touched. For layout changes also run `VIEWPORT=320x640`, and for colour
changes at least one other theme (`UI_THEME=verdant`). See [a11y-reports/REPORT.md](a11y-reports/REPORT.md).
If you add a new page or dialog, add it to `a11y-reports/scripts/audit.js`.

## Documentation

Update the docs in the same pull request as the code:

- User-visible behaviour: [guides/GETTING_STARTED.md](guides/GETTING_STARTED.md).
- Endpoints or request/response shapes: [guides/API_REFERENCE.md](guides/API_REFERENCE.md).
- Environment variables: [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md) only;
  other docs link to it.
- Architecture or contracts: [CLAUDE.md](CLAUDE.md).
- New known gaps or trade-offs, or a gap you closed: [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md).
- Notable changes: [CHANGELOG.md](CHANGELOG.md), under the upcoming version.

Write plainly: short sentences, facts checked against the code, no real credentials or personal data.

## Pull request checklist

- [ ] The change is focused, and the PR description says what changed and why (link the issue).
- [ ] Backend gate passes: `ruff check`, `ruff format --check`, `mypy`, `pytest`.
- [ ] Frontend gate passes: `npx tsc --noEmit`, `npm test`, `CI=true npm run build`.
- [ ] New behaviour has tests (unit tests, and a browser check for UI flows).
- [ ] UI changes checked with the keyboard, in light and dark mode, at 320px; the accessibility audit is clean.
- [ ] Schema changes come with an idempotent migration.
- [ ] Docs and the changelog are updated.
- [ ] No secrets, credentials or personal data in code, tests, fixtures or screenshots.

A maintainer reviews every pull request. CI must be green before merge.
