"""Where image bytes live: the database (default) or S3-compatible object storage.

``get_image_store()`` builds the store from settings once (``STORAGE_BACKEND``,
``S3_*``); ``set_image_store()`` swaps it (tests, or a reset with ``None``).
Routes never talk to a store directly: they use the helpers in
``app.storage.images`` (``save_image_bytes``, ``read_image_bytes``,
``delete_image_objects``).
"""

from __future__ import annotations

import threading

from .base import DatabaseStore, ImageStore, ObjectNotFound, StorageError

__all__ = [
    "DatabaseStore",
    "ImageStore",
    "ObjectNotFound",
    "StorageError",
    "build_image_store",
    "get_image_store",
    "set_image_store",
]

_store: ImageStore | None = None
_lock = threading.Lock()


def build_image_store() -> ImageStore:
    """The store described by the current settings."""
    from app.core.config import settings

    if settings.STORAGE_BACKEND == "s3":
        from .s3 import S3Store

        return S3Store(
            settings.S3_BUCKET,
            region=settings.S3_REGION,
            endpoint_url=settings.S3_ENDPOINT_URL,
            access_key_id=settings.S3_ACCESS_KEY_ID,
            secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        )
    return DatabaseStore()


def get_image_store() -> ImageStore:
    global _store
    if _store is None:
        with _lock:
            if _store is None:
                _store = build_image_store()
    return _store


def set_image_store(store: ImageStore | None) -> None:
    """Replace the process-wide store; ``None`` rebuilds it from settings on next use."""
    global _store
    with _lock:
        _store = store
