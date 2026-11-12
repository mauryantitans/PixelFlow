## Summary

<!-- What does this change and why? Link the issue: "Fixes #123". -->

## Type of change

- [ ] `feat`: new feature
- [ ] `fix`: bug fix
- [ ] `docs`: documentation only
- [ ] `test`: tests only
- [ ] `perf` / `a11y` / `chore` / refactor

## How it was tested

<!-- Commands you ran, browsers/devices, screenshots for UI changes. -->

## Checklist

See [CONTRIBUTING.md](../CONTRIBUTING.md).

- [ ] The change is focused, and commits follow the `type(scope): summary` style.
- [ ] Backend gate passes (`backend/`): `ruff check app/processing tests`, `ruff format --check app/processing tests`, `mypy`, `pytest`.
- [ ] Frontend gate passes (`frontend/`): `npx tsc --noEmit`, `npm test -- --watchAll=false`, `CI=true npm run build`.
- [ ] New behaviour has tests (unit tests; a browser check in `scripts/e2e/` for UI flows).
- [ ] UI changes work with the keyboard, in light and dark mode, and at 320px; the accessibility audit is clean.
- [ ] Database changes come with an idempotent Alembic migration in `backend/alembic/versions/`.
- [ ] No operation `id` was renamed or reused, and no alias was removed.
- [ ] Docs are updated (user guide, API reference, env reference, CLAUDE.md, CURRENT_LIMITATIONS.md, CHANGELOG.md as relevant).
- [ ] No secrets, credentials or personal data in code, tests, fixtures or screenshots.
