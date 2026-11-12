# Security policy

## Supported versions

Security fixes go into the latest release line only.

| Version | Supported |
|---|---|
| 1.2.x | Yes |
| < 1.2 | No. Please upgrade. |

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** ([direct link](https://github.com/Mauryantitans/PixelFlow/security/advisories/new)).
This creates a private advisory that only you and the maintainers can see. If that option isn't
available, send a private message to the maintainer through their GitHub profile,
[@Mauryantitans](https://github.com/Mauryantitans), asking for a private channel, without
details of the problem.

Please include:

- what the problem is and what an attacker could do with it;
- the affected version or commit, and where (endpoint, component, file);
- steps to reproduce, or a proof of concept;
- your setup if it matters: deployment (local, Docker, Render + Vercel), `STORAGE_BACKEND`, browser;
- whether the issue is already public anywhere.

Only test against your own local or self-hosted instance. Don't test against the public demo
deployment, other people's accounts or data, and don't run denial-of-service or spam tests.

### What to expect

| Step | Target |
|---|---|
| Acknowledgement | Within 7 days |
| First assessment (confirmed or not, severity) | Within 14 days |
| Fix or mitigation for confirmed issues | As soon as practical, depending on severity; you'll get updates along the way |

PixelFlow is maintained by volunteers, so these are targets, not guarantees. We'll agree on a
disclosure date with you, publish an advisory with the fix, and credit you unless you'd rather stay
anonymous.

## Security model

What the code implements today. Configuration lives in `backend/app/core/security_config.py` and
[deployment/ENVIRONMENT_VARIABLES.md](deployment/ENVIRONMENT_VARIABLES.md).

**Authentication and sessions**

- Passwords are hashed with bcrypt (8 to 128 characters). After 5 failed sign-ins an account is locked
  for 15 minutes.
- Access and refresh tokens are JWTs delivered only as **httpOnly cookies** (`pf_access`, 30 minutes;
  `pf_refresh`, 7 days, sent only to `/api/auth`), never in response bodies or `localStorage`.
  `Secure` is on by default in production and `SameSite` defaults to `lax`.
- Refresh tokens are stored hashed (SHA-256) and **rotated** on every refresh: the old token is deleted,
  so it can't be used again. Sign-out and password reset revoke all of a user's refresh tokens.
- **CSRF**: cookie-authenticated `POST`/`PUT`/`PATCH`/`DELETE` requests under `/api` must send an
  `X-CSRF-Token` header that matches the `pf_csrf` cookie (double-submit). The few exempt endpoints act
  only through a token in the body or a client-supplied session id, never through the auth cookie.
- Password-reset links are signed, valid for 1 hour and single use; verification links are valid 48 hours
  and bound to the current address. The forgot-password response is the same whether or not an account
  exists, and each address gets at most one email of each kind per minute.
- In production the app **refuses to start** with the default `SECRET_KEY`.

**Admin access**

- Admin routes require an admin account. Views and deletes of individual users' data also require the
  **admin PIN, enforced on the server**: a correct PIN sets a signed, httpOnly cookie scoped to
  `/api/admin` for 15 minutes. The PIN is stored hashed; 5 wrong PINs lock that admin out for 15 minutes.

**Authorization**

- Ownership is checked on every image, pipeline, share link and batch job. A signed-in user's images can
  be read or processed only by that user; others get 403. Admins see other users' data only through the
  admin endpoints, which require the PIN. Pipelines are private unless
  marked public; only the owner can change, delete or share them. Another account's job returns 404.
- Guest images and jobs have no account. They are reached by random UUIDs, and guest jobs also need the
  session id. A session that belongs to an account can't be used by someone else (409) or while signed
  out (401).
- Share links (`/p/{token}`, random 16-character tokens) expose a pipeline's name, description, steps and
  the owner's username, never images. The owner can turn a link off at any time.

**Abuse limits**

- Per-IP rate limits per minute: auth 10, upload 30, processing 150, admin 30, other 100. Behind proxies,
  `TRUSTED_PROXY_HOPS` picks the real client IP from `X-Forwarded-For` (the entry written by the outermost
  trusted proxy, so clients can't spoof it).
- Uploads: JPEG, PNG, BMP and TIFF only (by extension), at most 50 MB each and 20 per request, plus per-session
  image limits and storage quotas. Every file is decoded with Pillow and re-encoded before it is stored, so
  files that aren't valid images are rejected and the original bytes are never served back.
- Operation parameters are validated and coerced by typed specs before any code runs. Custom kernels are
  only matrices of numbers, and a saved filter can't contain another filter.

**Transport and browser**

- Security headers on API responses: a Content Security Policy, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
  `Permissions-Policy`. HSTS is off in the app by default; Render and Vercel serve HTTPS.
- CORS allows only the configured origins. In production the frontend calls the API on its own origin
  through a Vercel rewrite, so cookies are first-party.

**Data and monitoring**

- Images are stored in the database or, optionally, a **private** S3-compatible bucket. The API serves the
  bytes itself; there are no public object URLs.
- Error tracking is off unless `SENTRY_DSN` is set. When on, Sentry is initialised with
  `send_default_pii=False` (no cookies, request bodies or user emails). Browser error reports contain only
  the message, stack, page path and user agent, and are length-capped and rate limited.

## Known limitations

Rate limits, the admin-PIN lockout and email throttles are kept in memory, so they apply per backend
instance. An access token stays valid until it expires (at most 30 minutes) even after sign-out or a
password reset. See [CURRENT_LIMITATIONS.md](CURRENT_LIMITATIONS.md).
