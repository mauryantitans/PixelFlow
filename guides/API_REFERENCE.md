# API Reference

PixelFlow's REST API. The live, always-accurate schema is at `http://localhost:8000/docs`
(Swagger) and `/openapi.json`; this page explains how the pieces fit together.

**Base URL:** `http://localhost:8000/api` locally. In production the frontend calls `/api` on
its own origin and Vercel proxies it to the backend (needed for first-party cookies).

---

## Authentication

Sign-in sets **httpOnly cookies**; tokens never appear in response bodies.

| Cookie | Lifetime | Purpose |
|---|---|---|
| `pf_access` | 30 min | Access token, sent on every request (`Path=/`). |
| `pf_refresh` | 7 days | Refresh token, sent only to `/api/auth` (rotated on every refresh). |
| `pf_csrf` | 7 days | Readable by JS; echo it in `X-CSRF-Token`. |
| `pf_admin_pin` | 15 min | Admin PIN grant, sent only to `/api/admin`. |

**CSRF.** Cookie-authenticated `POST`/`PUT`/`PATCH`/`DELETE` requests under `/api` must send
`X-CSRF-Token` equal to the `pf_csrf` cookie, or get 403. Exempt: register, login, OAuth, and the
session-id-keyed `heartbeat` / `cleanup-session`. Also exempt: forgot-password, reset-password
and verify-email, which act only through the email address or the token in the body, and
`client-errors`, which can only add a log line.

**Non-browser clients** can send `Authorization: Bearer <token>` instead of cookies (no CSRF
header needed then), e.g. a token from `create_access_token` in tests.

**Refreshing.** `POST /api/auth/refresh` reads `pf_refresh`, rotates it and re-sets all cookies.
The web app refreshes proactively after 20 minutes and retries once on a 401.

| Endpoint | Notes |
|---|---|
| `POST /auth/register` | `{email, username, password, full_name?}` → 201 + user. |
| `POST /auth/login` | `{email, password}` → user; sets cookies. Repeated failures lock the account temporarily. |
| `POST /auth/refresh` | Rotates tokens → `{success: true}`. 401 if the refresh token is invalid. |
| `POST /auth/logout` | Clears cookies, revokes refresh tokens. |
| `GET /auth/me` · `PUT /auth/me` · `DELETE /auth/me` | Current user; update profile; delete account. The user includes `email_verified` and `preferences`. |
| `PUT /auth/me/preferences` | `{ui_theme?, mode?}` → user. Saves the appearance to the account so it follows the user to other browsers. `ui_theme` is a theme id (`^[a-z][a-z0-9-]{0,31}$`), `mode` is `light` or `dark`; keys you leave out are kept. |
| `GET /auth/google/status` · `GET /auth/google/login` · `POST /auth/google/callback` | Google sign-in, only when configured. |
| `POST /auth/forgot-password` | `{email}` → always the same 200 `{success, message}`, whether or not the account exists. Emails a reset link (Google-only accounts get a "use Google sign-in" email instead); at most one per address per minute. |
| `POST /auth/reset-password` | `{token, new_password}` → 200. The token comes from the emailed link, is valid 1 hour and works once. Applies the password policy (422), revokes all the user's refresh tokens and clears the login lockout; the user then signs in. 400 `{detail: {message, code}}` with `code` `token_expired` or `token_invalid`. |
| `POST /auth/verify-email` | `{token}` → `{success, email, already_verified, message}`. Link valid 48 hours, bound to the current address. 400 as above. |
| `POST /auth/resend-verification` | Signed in. Emails a new verification link. 400 `already_verified`; 429 `email_throttled` within a minute of the last one. |

---

## Sessions

Each browser sends a `session_id` (a UUID it generates). The server records **activity** on it
(upload, listing the workspace's images, processing) and slides its expiry forward. A session
belongs to the user signed in when it was created:

| Status | `detail.error` | When |
|---|---|---|
| 401 | `sign_in_required` | The session belongs to an account but the request isn't signed in (e.g. expired cookies). Sign in again. |
| 409 | `session_owned_by_another_user` | The session belongs to a different account. Start a new session id. |
| 403 | — | Reading or deleting another user's image. |

---

## Images

| Endpoint | Notes |
|---|---|
| `POST /images/upload` | Multipart `file`, `session_id`. JPEG/PNG/BMP/TIFF, ≤ 50 MB. → `{success, image: {id, filename, width, height, format, size_bytes, …}, thumbnail}`. |
| `POST /images/upload-multiple` | Multipart `files[]` (≤ 20), `session_id`. |
| `GET /images/session/{session_id}/images` | `?thumbnails_only=true` (what the app uses on load) or `?include_data=true` (full images). |
| `GET /images/image/{image_id}` | Full image as a data URL; `?thumbnail=true` for the thumbnail. |
| `DELETE /images/image/{image_id}` | Owner only. |
| `POST /images/cleanup-session` | `{session_id}`: delete a session's images (owner only). |
| `POST /images/heartbeat` | **Deprecated.** Kept for old clients; never creates a session. Use `GET /api/health` to check connectivity. |

Upload errors: 400 (empty/unsupported/corrupt file), 413 (too large), 507 (storage quota
exceeded; body has `current_mb`, `quota_mb`, `file_size_mb`, `percentage_used`).

---

## Processing

### Operation schema

```http
GET /api/processing/operations
```

Returns the operation library as a grouped, typed schema (the single source of truth the
frontend renders its controls from), plus a flat legacy list for backward compatibility.

**Response (abridged):**
```json
{
  "success": true,
  "version": "2",
  "total_count": 78,
  "categories": [
    {
      "name": "Basic",
      "subcategories": [
        {
          "name": "Adjustments",
          "operations": [
            {
              "id": "brightness",
              "label": "Brightness",
              "category": "Basic",
              "subcategory": "Adjustments",
              "description": "Adjust image brightness",
              "interactive": false,
              "hidden": false,
              "params": [
                {"name": "amount", "label": "Brightness", "type": "int", "default": 0,
                 "min": -100, "max": 100, "help": "", "advanced": false}
              ]
            }
          ]
        }
      ]
    }
  ],
  "operations": ["Brightness", "Contrast", "..."]
}
```

Every param has `name`, `label`, `type`, `default`, `help` and `advanced`. `type` is one of:

| `type` | Extra fields | Value sent |
|---|---|---|
| `int`, `float`, `angle` | `min`, `max`, `step` | number |
| `odd_kernel` | `min`, `max`, `step` (2) | odd integer |
| `enum` | `options: [{value, label}]` | one option value |
| `bool` | | `true` / `false` |
| `color` | | `"#RRGGBB"` (or `[r, g, b]`) |
| `point`, `points`, `rect` | `space` (`normalized`); `points` also `min_points`, `max_points` | normalized [0..1] coordinates, picked on the preview |
| `matrix` | `min_size`, `max_size`, `value_min`, `value_max`, `presets: [{label, value}]` | square, odd-sized list of rows of numbers (Custom Kernel) |
| `text` | `max_length` | string (trimmed and cut to `max_length`) |
| `steps` | `max_steps` (30) | list of `{name, params, enabled}` (the body of a saved filter) |

Operations with `"hidden": true` are in `categories` but not in the legacy `operations` list or
`total_count`. They run when a pipeline names them, but the palette doesn't list them. Today that is only
**Custom Filter**, the step that runs a saved filter's `steps` in order (a filter can't contain
another filter). So the count is 78: the 77 built-in operations plus Custom Kernel.

### Live processing (one image)

```http
POST /api/processing/process-live
```

**Request Body:**
```json
{
  "image_id": "uuid-here",
  "pipeline": [
    {"name": "Brightness", "params": {"amount": 20}},
    {"name": "Crop", "params": {"roi": {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8}}}
  ],
  "session_id": "session_id_here"
}
```

Operation identity is the `name` (a display label or `id`); both resolve through the
backend alias map. Params use the keys from each operation's schema. Coordinate params are
sent as normalized [0..1] values. A step may carry `"enabled": false`: it is skipped (the image
passes through unchanged) and reports no error. `enabled` defaults to `true`.

**Response:**
```json
{
  "success": true,
  "results": [
    "data:image/jpeg;base64,...",  // After step 1
    "data:image/jpeg;base64,..."   // After step 2 (final)
  ],
  "total_time": 0.156,
  "step_timings": [
    {"step_index": 0, "step_name": "Brightness", "duration": 45},
    {"step_index": 1, "step_name": "Crop", "duration": 12}
  ],
  "step_errors": [null, null]
}
```

`step_errors` is an array aligned with the pipeline; an entry is `null` when the step
succeeded, or `{"op", "kind", "message", "param_errors": [...]}` when a step's params were
invalid or the op failed (the pipeline is not aborted — one bad step is reported, not fatal).

### Batch processing (synchronous)

```http
POST /api/processing/process
```

**Request Body:** like live, but `image_ids: string[]` instead of a single `image_id`.
The response includes `processed_images`, optional `intermediate_results`, `step_timings`,
and a per-image `step_errors`. The whole batch runs inside the request. The web app uses
background jobs instead (below).

### Background batch jobs

The web app runs batches as jobs. A worker thread in the backend processes queued jobs one at a
time, so a run continues if the browser reloads or closes. A job belongs to the account that
started it; a guest's job belongs to its session, so guests pass `?session_id=` on every call
below. Someone else's job returns 404.

| Endpoint | Notes |
|---|---|
| `POST /processing/jobs` | Body as for `/processing/process` (`image_ids` ≤ 100, `pipeline`, `session_id`) → 202 `{job}`. 400 if either list is empty or too long. |
| `GET /processing/jobs/{id}` | → `{job}`: `id`, `status` (`queued`, `running`, `done`, `failed`, `cancelled`), `total`, `completed`, `results[]`, `error`, `created_at`, `finished_at`. |
| `GET /processing/jobs/{id}/results/{i}` | Image `i`'s output after every step: `{image_id, steps: [data URL…], final}`. 404 until that image is `done`; 410 once its processed images were removed by cleanup. |
| `POST /processing/jobs/{id}/cancel` | A queued job is cancelled at once; a running job stops before its next image. → `{job}`. |

Each `results[]` entry, in image order: `{image_id, status, error, total_time, step_timings,
step_errors}`, where `status` is `done`, `skipped` (not your image, or deleted) or `failed`. Poll
`GET /processing/jobs/{id}` and fetch each result once its status is `done`. A job interrupted
by a server restart is queued again and starts over from its first image. Finished jobs are
deleted by the cleanup job after a day.

---

## Pipelines (signed in)

| Endpoint | Notes |
|---|---|
| `GET /pipelines/` | Your pipelines. |
| `POST /pipelines/` | `{name, description?, pipeline_data: [{name, params}], is_public?, category?, tags?}` → 201. Counts toward the per-user pipeline limit. |
| `GET /pipelines/public` | Public pipelines. |
| `GET /pipelines/{id}` | Loading increments `usage_count`. |
| `PUT /pipelines/{id}` · `DELETE /pipelines/{id}` | Owner only. |
| `POST /pipelines/{id}/duplicate` | Also counts toward the limit. |

`GET /pipelines/?category=Custom%20filter` lists the user's saved filters (pipelines saved
with "Save as a reusable filter" get that category). Saved steps reference operations by display
name; old names keep working through the registry's alias map.

### Share by link

| Endpoint | Notes |
|---|---|
| `GET /pipelines/{id}/share` | Owner only. → `{share: {token, path, view_count}}`, or `{share: null}` when not shared. |
| `POST /pipelines/{id}/share` | Owner only. Creates the link (or returns the existing one) → `{share}`. `path` is `/p/{token}`, a frontend route. |
| `DELETE /pipelines/{id}/share` | Owner only. → 204; the old link stops working. |
| `GET /pipelines/shared/{token}` | **Public**, no sign-in. → `{name, description, pipeline_data, author, created_at, view_count}`; each call counts a view. 404 if the link doesn't exist or was turned off. |

A share link exposes the pipeline's name, description, steps with their parameter values, and
the owner's username. It never exposes images.

---

## Admin (`is_admin` only)

| Endpoint | Notes |
|---|---|
| `GET /admin/stats/overview` · `GET /admin/storage/overview` | Counts; sessions are `active` (activity in the last 15 min), `idle` and `expired`. |
| `GET /admin/settings` · `PUT /admin/settings` | Quotas, retention, session lifetimes, `enable_auto_cleanup`. Invalid values → 422 and nothing is saved. |
| `GET /admin/cleanup/stats` · `POST /admin/cleanup/run` | Preview / run the cleanup job now (it also runs every 15 min when auto-cleanup is on). |
| `GET /admin/users` · `POST /admin/users/{id}/toggle-active` | User list; activate/deactivate. |
| `GET /admin/security/login-attempts` · `DELETE /admin/security/clear-login-attempts/{email}` | Login lockouts. |
| `POST /admin/pin/set` | `{pin, current_pin?}`: 4–6 digits. Changing an existing PIN needs `current_pin`. Sets `pf_admin_pin`. |
| `POST /admin/pin/verify` | `{pin}` → sets `pf_admin_pin` (15 min). 5 wrong PINs → 429 with `Retry-After`. |

**PIN-protected** (403 `pin_required` without a valid `pf_admin_pin`): everything that reads or
deletes individual users' data: `GET /admin/database/overview?include_user_data=true`,
`/admin/database/users`, `/admin/database/images`, `/admin/database/users/{id}/images`,
`/admin/database/users/{id}/pipelines`, `/admin/database/sessions`, `/admin/database/debug`,
`DELETE /admin/database/users/{id}?confirm=DELETE_USER`, `DELETE /admin/database/images/{id}`,
`DELETE /admin/database/pipelines/{id}`.

Storage-tab maintenance needs admin plus a confirmation string, not the PIN:
`POST /admin/database/delete-all-images?confirm=DELETE_ALL_IMAGES`,
`POST /admin/database/delete-all-sessions?confirm=DELETE_ALL_SESSIONS`,
`POST /admin/database/fix-orphaned-images`.

---

## Health

`GET /api/health` (also `/health`): no database access, no session writes, `Cache-Control:
no-store`, exempt from rate limiting. Use it for uptime monitors; the app's header badge pings
it.

---

## Client error reports

`POST /api/client-errors` with `{kind?, message, stack?, path?, user_agent?}` → 204. The web app
sends uncaught browser errors here. They are written to the backend log and, when `SENTRY_DSN`
is set, forwarded to Sentry. Fields are length-capped (message 2,000 characters, stack 8,000).
No sign-in, no CSRF header. Reports past 10 per client IP per minute are dropped silently
(still 204).

---

## Rate limits

Per client IP and per minute: auth 10, upload 30, processing 150 (including the job routes,
so polling counts), admin 30, everything else 100. Exceeding one returns 429 `{"detail": "Too many requests. Please slow down and try again
later."}`. Behind proxies, set `TRUSTED_PROXY_HOPS` so the real client IP is used (see
[deployment/ENVIRONMENT_VARIABLES.md](../deployment/ENVIRONMENT_VARIABLES.md)).

---

## Errors

FastAPI's format: `{"detail": "..."}` or `{"detail": {"error": "code", "message": "..."}}` for
the coded errors above; request validation errors are 422 with a `detail` list.

---

## Example (Python, guest)

```python
import uuid, requests

API = "http://localhost:8000/api"
session_id = str(uuid.uuid4())

with open("photo.jpg", "rb") as f:
    r = requests.post(f"{API}/images/upload", files={"file": f}, data={"session_id": session_id})
image_id = r.json()["image"]["id"]

r = requests.post(f"{API}/processing/process-live", json={
    "image_id": image_id,
    "session_id": session_id,
    "pipeline": [{"name": "Grayscale", "params": {}}, {"name": "Invert", "params": {}}],
})
final = r.json()["results"][-1]   # data URL of the last step
```

Signed in with a cookie session (`requests.Session()` keeps the cookies):

```python
s = requests.Session()
s.post(f"{API}/auth/login", json={"email": "you@example.com", "password": "..."})
csrf = {"X-CSRF-Token": s.cookies["pf_csrf"]}
s.post(f"{API}/pipelines/", headers=csrf, json={"name": "Mono", "pipeline_data": [{"name": "Grayscale", "params": {}}]})
print([p["name"] for p in s.get(f"{API}/pipelines/").json()])
```
