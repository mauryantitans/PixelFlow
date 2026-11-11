from fastapi import APIRouter, Response
from .routes import images_db, processing_db, auth, oauth, pipelines, admin

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
        "version": "1.0.0",
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
