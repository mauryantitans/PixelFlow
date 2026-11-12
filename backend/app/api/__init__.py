from fastapi import APIRouter, Response

from ..core.config import settings
from .routes import admin, auth, client_errors, images_db, jobs, oauth, pipelines, processing_db

api_router = APIRouter()

# Include route modules
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["authentication"]
)

api_router.include_router(
    oauth.router,
    prefix="/auth",
    tags=["oauth"]
)

api_router.include_router(
    pipelines.router,
    prefix="/pipelines",
    tags=["pipelines"]
)

# Images are stored in the database (the filesystem path was removed in Phase 6).
api_router.include_router(
    images_db.router,
    prefix="/images",
    tags=["images"]
)
api_router.include_router(client_errors.router, tags=["monitoring"])

api_router.include_router(
    jobs.router,
    prefix="/processing/jobs",
    tags=["processing"],
)

api_router.include_router(
    processing_db.router,
    prefix="/processing",
    tags=["processing"]
)

api_router.include_router(
    admin.router,
    tags=["admin"]
)

# Root endpoint
@api_router.get("/")
async def root():
    return {
        "message": "PixelFlow API",
        "version": settings.VERSION,
        "status": "running"
    }

@api_router.get("/health")
async def health(response: Response):
    """Liveness check used by the frontend connection indicator.

    Deliberately cheap: no database access, no session writes, never cached,
    and exempt from rate limiting (see RateLimiting.EXEMPTED_PATHS).
    """
    response.headers["Cache-Control"] = "no-store"
    return {
        "status": "healthy",
        "service": "PixelFlow API"
    }
