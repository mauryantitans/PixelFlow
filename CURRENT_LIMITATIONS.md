# Current limitations

**Version:** 1.3.0 · **Last updated:** November 2026

What PixelFlow does *not* do yet, or does with known trade-offs. Fixed items are not kept
here; see [CHANGELOG.md](CHANGELOG.md) for what changed and when.

---

## Accounts and sign-in

| Limitation | Notes |
|---|---|
| Emails need an SMTP provider | Password-reset and verification emails go out only with `EMAIL_BACKEND=smtp` and `SMTP_*` set ([variables](deployment/ENVIRONMENT_VARIABLES.md)); the default only logs them. Verification is a reminder, not a gate: unverified accounts can use everything. |
| A password reset doesn't end open sessions at once | It revokes every refresh token, but an access token already issued stays valid until it expires (at most 30 minutes). |
| Google sign-in is off until configured | Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (backend) and `REACT_APP_GOOGLE_CLIENT_ID` (frontend). See [guides/GOOGLE_OAUTH_SETUP.md](guides/GOOGLE_OAUTH_SETUP.md). The button is hidden otherwise. |
| Basic user management | Admins can view, deactivate and delete users and their data, but can't change roles or edit profiles from the panel. |
| Admin PIN grant is per browser | A correct PIN unlocks user data for 15 minutes in that browser only (server-enforced). 5 wrong PINs lock that admin out for 15 minutes. |

## Images and processing

| Limitation | Notes |
|---|---|
| Upload formats: JPEG, PNG, BMP, TIFF (≤ 50 MB, ≤ 20 per upload) | Results download as PNG/JPEG. There is no output-format or quality choice, and EXIF metadata is not kept. |
| No drag-and-drop upload | Images are added with the file picker (keyboard accessible). |
| Processing is synchronous | Large images and heavy operations (e.g. Non-Local Means) can take seconds per image. Batch mode processes one image at a time. There is no background job queue. |
| Images are stored in Postgres | Simple, but it fills a small database quickly. Object storage (S3/R2) would scale better. |
| Uploaded images' alt text is their file name | The app can't know what a photo shows; users can't add a description yet. |

## Sessions and data retention

- Work is tied to a **browser session**:
  - Images are not shared across devices.
  - Signing out starts a fresh guest session.
  - Signing back in restores your session in that browser.
- The pipeline you are building is kept per **tab** and survives a reload.
- **Automatic cleanup deletes data by design.** When it's on (Admin → Retention, on by default), the server removes data past the configured periods every 15 minutes. Defaults:
  - guest uploads: 24 h;
  - user uploads: 7 days;
  - processed results: 1 h (guests) / 24 h (users);
  - sessions: 24 h (guests) / 7 days (users) after their last activity.

## Hosting (Render / Vercel free tiers)

| Limitation | Notes |
|---|---|
| Cold starts | Render's free web service sleeps after ~15 min idle; the first request can take up to a minute. The header shows "Server waking up…". |
| Free Postgres expires | Render deletes free databases 30 days after creation. The app then fails to start: the log names the unreachable host and the likely cause. Upgrade, or recreate the database and update `DATABASE_URL`. |
| Single instance | Rate limiting and the admin-PIN lockout are in memory, so they don't work across several instances. Use Redis before scaling out. |
| Rate limits need `TRUSTED_PROXY_HOPS` behind proxies | Without it, all visitors share one rate-limit bucket. See [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md). |
| No schema migrations in use | Alembic is configured, but the app relies on `create_all`, which creates missing tables and never alters existing ones. |
| No automated backups / replication | Manual scripts: `backend/database/backup_database.py`, `restore_database.py`. |

## Observability

There is no error tracking (e.g. Sentry), uptime alerting or usage analytics. `GET /api/health`
is available for an external uptime monitor.

## Accessibility

- Automated WCAG 2.1 AA checks pass on every audited page, at desktop and 320px widths: Lighthouse,
  axe-core, keyboard checks, reflow, text spacing and 200% text (see
  [a11y-reports/REPORT.md](a11y-reports/REPORT.md)).
- Still to do by hand: a screen-reader pass (VoiceOver checklist in the report), and testing on
  real phones with VoiceOver / TalkBack.

## Not built yet

- Processing history: the `ProcessingHistory` table exists, but nothing records to it yet and there is no page for it.
- Share-by-link for pipelines (public pipelines exist).
- Turning a pipeline step off without removing it.
- Favourites, collaboration, API keys, webhooks, paid tiers.

## Suggested next steps

1. Object storage for images, plus a job queue for heavy processing.
2. Error tracking and uptime monitoring; automated database backups.
3. Accessibility regression checks in CI (the audit scripts in `a11y-reports/scripts/`).
4. Alembic migrations for schema changes.
