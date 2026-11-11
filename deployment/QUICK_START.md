# Quick Start (moved)

The deployment steps now live in one place: **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**.

- Step-by-step list: [DEPLOYMENT_GUIDE.md#deployment-checklist](DEPLOYMENT_GUIDE.md#deployment-checklist)
- Environment variables: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- Go-live review: [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)

In short: deploy the backend and database with the root `render.yaml` Blueprint, and set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `TRUSTED_PROXY_HOPS`. Point the `/api` rewrite in `frontend/vercel.json` at your Render URL, deploy `frontend/` to Vercel with `REACT_APP_API_URL=/api`, then set `ALLOWED_ORIGINS` on Render.
