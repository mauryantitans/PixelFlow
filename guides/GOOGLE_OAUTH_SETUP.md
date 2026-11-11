# Google OAuth Setup Guide

Enable "Continue with Google" sign-in for PixelFlow. It's optional: without it, the button is hidden and
email/password accounts work as usual.

---

## How it works

PixelFlow uses **Google Identity Services** (the Google button in a popup), not a server-side redirect:

1. The frontend loads `https://accounts.google.com/gsi/client` and renders the button, but only when
   `REACT_APP_GOOGLE_CLIENT_ID` is set.
2. The user picks an account. Google returns a signed **ID token** to the page.
3. The frontend POSTs it to `POST /api/auth/google/callback` (`{REACT_APP_API_URL}/auth/google/callback`).
4. The backend verifies the token against `GOOGLE_CLIENT_ID` and requires a verified email. It then finds the
   user by Google ID, or by email (linking an existing password account), or creates a new user with a
   generated username and the Google profile picture.
5. The backend sets the usual **httpOnly auth cookies** (`pf_access`, `pf_refresh`, plus `pf_csrf`) and
   returns only the user record. No token is stored in `localStorage`.

Because there is no redirect, Google only needs your frontend's **Authorized JavaScript origins**.

Backend routes (mounted under `/api/auth`, in `backend/app/api/routes/oauth.py`):

| Route | Used by the app | Purpose |
|---|---|---|
| `POST /api/auth/google/callback` | Yes | Verifies the ID token and signs the user in |
| `GET /api/auth/google/status` | No (diagnostic) | Reports whether `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set and the configured `redirect_uri` |
| `GET /api/auth/google/login` | No | Legacy redirect to Google's consent page with `redirect_uri=GOOGLE_REDIRECT_URI` |

`GOOGLE_REDIRECT_URI` (default `http://localhost:3000/auth/google/callback`) is only used by the legacy
`/google/login` route. The frontend doesn't call that route and has no `/auth/google/callback` page, so you
don't need to register a redirect URI for the button flow.

---

## Step 1: Google Cloud project and consent screen

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Open **APIs & Services → OAuth consent screen** (shown as **Google Auth Platform** in newer consoles).
   - App name, user support email, developer contact email.
   - Audience **External**. While the app is in **Testing**, add your Google account under **Test users**.
   - The default scopes `openid`, `email` and `profile` are all PixelFlow needs.

You don't need to enable any extra API. The deprecated Google+ API is not used.

## Step 2: OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. **Authorized JavaScript origins.** For local development, add both:
   ```
   http://localhost
   http://localhost:3000
   ```
   Add `http://127.0.0.1:3000` only if you open the app on that host.
4. **Authorized redirect URIs:** leave empty (see [How it works](#how-it-works)).
5. Create, and copy the **Client ID** (`...apps.googleusercontent.com`). The client secret isn't used to verify
   sign-ins.

Changes to origins can take a few minutes to take effect.

## Step 3: Backend

In `backend/.env`:

```env
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
# Optional: only reported by /api/auth/google/status ("configured" is true when both are set)
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Restart the backend.

## Step 4: Frontend

The frontend must use the **same** client ID. Add it to `frontend/.env.local` (`start.sh` / `start.bat` create
this file with `REACT_APP_API_URL`, so keep that line):

```env
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

Restart `npm start`. `REACT_APP_*` values are read at start/build time. With Docker Compose, set
`REACT_APP_GOOGLE_CLIENT_ID` (and `GOOGLE_CLIENT_ID` for the backend) in `docker-compose.yml` instead.

## Step 5: Test

1. Open http://localhost:3000/auth. The Google button appears.
2. Sign in with a test user. You land on `/app`, signed in.
3. Optional checks:
   ```bash
   curl http://localhost:8000/api/auth/google/status
   ```
   In the database, the user row has `oauth_provider = 'google'` and an `oauth_id`. `list_users` doesn't print
   these fields, so query the `users` table directly.

---

## Production

- Create a **separate OAuth client** for production. Don't reuse the development one.
- **Authorized JavaScript origins:** your frontend origin, for example `https://your-app.vercel.app` (and a
  custom domain if you have one). Vercel preview URLs change per deploy, so add any you want to test.
- **Backend (Render):** `GOOGLE_CLIENT_ID` (and optionally `GOOGLE_CLIENT_SECRET`), plus `ALLOWED_ORIGINS`
  set to your frontend origin.
- **Frontend (Vercel):** `REACT_APP_GOOGLE_CLIENT_ID` (same ID), and `REACT_APP_API_URL=/api` so the callback
  goes through the same-origin `/api` rewrite and the auth cookies are first-party. Redeploy after changing it.
- To let anyone sign in (not only test users), publish the app on the consent screen. Google may require
  verification.

Full variable reference: [deployment/ENVIRONMENT_VARIABLES.md](../deployment/ENVIRONMENT_VARIABLES.md).
Deployment steps: [deployment/DEPLOYMENT_GUIDE.md](../deployment/DEPLOYMENT_GUIDE.md).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No Google button | `REACT_APP_GOOGLE_CLIENT_ID` is unset (or still the `YOUR_GOOGLE_CLIENT_ID...` placeholder), or the dev server wasn't restarted. Check the browser console. |
| Google error "origin is not allowed" / `origin_mismatch` | Add the exact origin you're browsing from (scheme, host and port) to Authorized JavaScript origins, then wait a few minutes. |
| `400 Invalid Google token` from the backend | The backend's `GOOGLE_CLIENT_ID` differs from the frontend's `REACT_APP_GOOGLE_CLIENT_ID`, or is unset. |
| `400 Email not verified by Google` | The Google account's email isn't verified. |
| "Access blocked: this app's request is invalid" or "app hasn't been verified" | Add the account under Test users, or publish the app on the consent screen. |
| Signs in, but the next request acts as a guest (production) | The frontend calls the backend cross-site, so cookies are dropped. Use `REACT_APP_API_URL=/api` with the Vercel rewrite. |
| CORS error on `/auth/google/callback` (local) | The page's origin isn't in `ALLOWED_ORIGINS` (see [INSTALLATION.md](../INSTALLATION.md#troubleshooting)). |

---

## Security notes

- Keep client IDs and secrets in `.env` files or the host's environment settings, never in git.
- Use separate OAuth clients for development, staging and production.
- Google is the only built-in provider. The `users.oauth_provider` / `oauth_id` columns are generic, but there
  is no code for other providers.

## References

- [Google Identity Services: Sign in with Google for web](https://developers.google.com/identity/gsi/web/guides/overview)
- [Verify the Google ID token on your server](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
