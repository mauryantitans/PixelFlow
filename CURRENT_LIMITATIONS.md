# Current limitations

**Version:** 1.2.0 · **Last updated:** November 2026

What PixelFlow does *not* do yet, or does with known trade-offs. Fixed items are not kept
here; see [CHANGELOG.md](CHANGELOG.md) for what changed and when.

---

## Accounts and sign-in

| Limitation | Notes |
|---|---|
| Emails go to the log by default | `EMAIL_BACKEND` defaults to `console`, which only writes each email (link included) to the backend log. Password-reset and verification emails reach people only with `EMAIL_BACKEND=smtp` and `SMTP_*` set ([variables](deployment/ENVIRONMENT_VARIABLES.md#email-password-reset-and-verification)). |
| Email verification is a reminder, not a gate | Unverified accounts can use everything; the workspace shows a banner until the address is verified. |
| A password reset doesn't end open sessions at once | It revokes every refresh token, but an access token already issued stays valid until it expires (at most 30 minutes). |
| Google sign-in is off until configured | Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (backend) and `REACT_APP_GOOGLE_CLIENT_ID` (frontend). See [guides/GOOGLE_OAUTH_SETUP.md](guides/GOOGLE_OAUTH_SETUP.md). The button is hidden otherwise. |
| Appearance follows the account only when signed in | Signed out, the theme and light/dark choice are kept per browser. |
| Basic user management | Admins can view, deactivate and delete users and their data, but can't change roles or edit profiles from the panel. |
| Admin PIN grant is per browser | A correct PIN unlocks user data for 15 minutes in that browser only (server-enforced). 5 wrong PINs lock that admin out for 15 minutes. |

## Images and processing

| Limitation | Notes |
|---|---|
| Upload formats: JPEG, PNG, BMP, TIFF (≤ 50 MB, ≤ 20 per upload) | EXIF metadata is not kept: uploads are re-encoded on the server. |
| Results are JPEG | Processed images are encoded as JPEG (quality 95). There is no output-format or quality choice, and transparency in a PNG upload is flattened in the results (the stored original keeps it). |
| One background worker per backend process | Batch jobs run one at a time, first come first served, on a single thread. A large batch from one person delays everyone queued behind it. Live preview is processed inside its request. |
| Jobs restart from the beginning after a server restart | A job interrupted by a restart or deploy is queued again and processes all its images again. At most 100 images per job. |
| A batch is resumed only in the tab that started it | The job id is kept per tab. Reloading resumes the run; closing the tab doesn't stop the job, but a new tab can't show its results. |
| Batch results expire with processed images | A finished job's results are readable while its processed images are kept (1 h for guests, 24 h for signed-in users by default), then return 410. Finished jobs themselves are deleted after a day. |
| Job progress is polled | The browser polls about once a second, and those requests count toward the per-IP processing rate limit (150 per minute). |
| Custom filters are snapshots | Adding a saved filter copies its steps into the pipeline. Editing the filter later doesn't update pipelines that already use it; filters can't contain other filters. Saving filters needs an account. |
| Custom Kernel limits | Square, odd sizes from 3×3 to 9×9, weights from −100 to 100. |
| Expression limits | One formula per colour channel, up to 200 characters each; per pixel only (no neighbouring pixels: use Custom Kernel for that); alpha passes through unchanged; no user-defined variables or functions. |
| Images are stored in Postgres by default | Simple, but it fills a small database quickly. Optional S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) keeps image bytes out of the database (`STORAGE_BACKEND=s3`, see [deployment/DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md#object-storage-optional)). Images uploaded before the switch stay in the database. |
| Uploaded images' alt text is their file name | The app can't know what a photo shows; users can't add a description yet. |

## Sharing

| Limitation | Notes |
|---|---|
| A share link shows the whole recipe | Anyone with the link sees the pipeline's name, description, every step with its parameter values, and the owner's username. Images are never shared. |
| Links don't expire | A link works until the owner clicks **Stop sharing** (or deletes the pipeline). There is no expiry date or password. |

## Sessions and data retention

- Work is tied to a **browser session**:
  - Images are not shared across devices.
  - Signing out starts a fresh guest session.
  - Signing back in restores your session in that browser.
- The pipeline you are building, the image selection and the Live toggle are kept per **tab** and
  survive a reload.
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
| Single instance | Rate limiting, the admin-PIN lockout, the email and client-error throttles and the live-preview cache are in memory, so they don't work across several instances. Use Redis before scaling out. (Job claiming is already safe with several instances.) |
| Rate limits need `TRUSTED_PROXY_HOPS` behind proxies | Without it, all visitors share one rate-limit bucket. See [deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md). |
| No automated backups / replication | Manual scripts: `backend/database/backup_database.py`, `restore_database.py`. |

## Observability

| Limitation | Notes |
|---|---|
| Error tracking is opt-in | Server and browser errors reach Sentry only when `SENTRY_DSN` is set; otherwise they are only in the backend log. Browser errors are sent without an SDK: message, stack, path and user agent, no breadcrumbs or source maps. |
| Uptime check needs setup | `.github/workflows/uptime.yml` runs every 30 minutes, but only after the `PRODUCTION_URL` repository variable is set. An outage opens a GitHub issue; there is no paging or chat alert. |
| No usage analytics | By choice. |

## Accessibility

- Automated WCAG 2.1 AA checks pass on every audited page, in every theme, at desktop and 320px widths: Lighthouse,
  axe-core, keyboard checks, reflow, text spacing and 200% text (see
  [a11y-reports/REPORT.md](a11y-reports/REPORT.md) and [a11y-reports/themes/README.md](a11y-reports/themes/README.md)).
- CI re-runs the audit on every pull request and on pushes to the main branches, but only at
  desktop size with the default theme. The 320px and per-theme runs are manual.
- Still to do by hand: a screen-reader pass (VoiceOver checklist in the report), and testing on
  real phones with VoiceOver / TalkBack.

## Not built yet

- Processing history: the `ProcessingHistory` table exists, but nothing records to it yet and there is no page for it.
- API keys: the `APIKey` table exists, but no route issues or accepts keys.
- Favourites, collaboration, webhooks, paid tiers.

## Suggested next steps

1. Run batch jobs in a separate worker service (or several threads) so one large batch doesn't hold up others, and resume interrupted jobs from the last finished image.
2. Move rate limits, lockouts and throttles to Redis so the backend can run more than one instance.
3. Automated database backups.
4. Output format and quality choice (PNG with transparency, WebP).
5. Run the 320px and per-theme accessibility audits in CI too.
