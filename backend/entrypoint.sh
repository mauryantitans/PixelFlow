#!/bin/sh
set -e

# Migrations run inside the app at startup (app.core.database.run_migrations),
# so Docker and Render behave the same.
echo "==> Starting PixelFlow backend..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 1 \
    --reload
