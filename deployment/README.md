# Deployment folder

PixelFlow deploys the backend and PostgreSQL to **Render** and the frontend to **Vercel**. Start with the guide.

| File | Purpose |
|---|---|
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | **Canonical guide.** Render + Vercel steps, the same-origin `/api` proxy, free-tier limits, troubleshooting, checklist. |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | Reference for every backend and frontend environment variable. |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Go-live review: security, testing, monitoring, legal, maintenance, sign-off. |
| [ALTERNATIVE_HOSTING_OPTIONS.md](ALTERNATIVE_HOSTING_OPTIONS.md) | Other hosts (Railway, Fly.io, Netlify, Cloudflare Pages) and self-hosting with Docker. |
| [QUICK_START.md](QUICK_START.md) | Pointer to the guide (kept for old links). |
| `render.yaml` | Copy of the root `render.yaml` Blueprint (backend web service + database). Render reads the **root** copy. |
| `vercel.json` | Copy of `frontend/vercel.json`. Vercel reads **`frontend/vercel.json`**; edit that one. |
| `prepare-for-deployment.ps1` | PowerShell pre-flight: checks the project files and Git status, prints a new `SECRET_KEY`, and copies `vercel.json` into `frontend/` if it is missing. |

Related guides: [../guides/DATABASE_SETUP.md](../guides/DATABASE_SETUP.md), [../guides/GOOGLE_OAUTH_SETUP.md](../guides/GOOGLE_OAUTH_SETUP.md), [../guides/ADMIN_PANEL.md](../guides/ADMIN_PANEL.md).
