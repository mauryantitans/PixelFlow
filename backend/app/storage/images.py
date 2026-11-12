"""Read, write and delete the bytes of image rows, wherever they are stored.

Every access to ``UploadedImage.image_data`` / ``ProcessedImage.image_data``
goes through these helpers:

* ``save_image_bytes(row, data, content_type)`` - object storage: upload the
  object and set ``row.storage_key`` (``image_data`` stays NULL); database
  mode: set ``row.image_data``.
* ``read_image_bytes(row)`` - ``image_data`` when the row has it (rows written
  before object storage was enabled keep working), else the object.
* ``delete_image_objects(rows_or_keys, db=...)`` - remove the objects of rows
  being deleted. With ``db`` the removal waits until that session commits
  (and is dropped on rollback), so a failed DB delete never loses bytes, and a
  failing bucket never blocks the DB delete (failures are only logged).

ORM deletes (``db.delete(row)``, including cascades from a Session or an
UploadedImage to its processed images) are picked up automatically by the
``before_flush`` hook below, which feeds the same deferred deletion. Bulk
``query.delete()`` bypasses the ORM, so those call sites pass the keys
explicitly (see ``object_keys``).

Thumbnails always stay in the database (small, needed for fast gallery loads).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from . import get_image_store
from .base import StorageError

logger = logging.getLogger(__name__)

# Tables whose rows carry image bytes (``image_data`` / ``storage_key``).
_FOLDERS = {"uploaded_images": "uploads", "processed_images": "processed"}
_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/webp": ".webp",
}
_PENDING = "pixelflow_pending_object_deletes"


def _is_image_row(obj: Any) -> bool:
    return getattr(type(obj), "__tablename__", None) in _FOLDERS


def object_key_for(row: Any, content_type: str = "") -> str:
    """``<S3_PREFIX><uploads|processed>/<row id><ext>``."""
    from app.core.config import settings

    folder = _FOLDERS.get(getattr(type(row), "__tablename__", ""), "images")
    if not getattr(row, "id", None):
        raise StorageError("An image row needs its id before its bytes can be stored.")
    return f"{settings.S3_PREFIX}{folder}/{row.id}{_EXTENSIONS.get(content_type, '')}"


def save_image_bytes(row: Any, data: bytes, content_type: str) -> None:
    """Store ``data`` for ``row`` (set its id first). Raises StorageError on failure."""
    store = get_image_store()
    if store.keeps_bytes_in_database:
        row.image_data = data
        row.storage_key = None
        return
    key = object_key_for(row, content_type)
    store.put(key, data, content_type)
    row.storage_key = key
    row.image_data = None


def read_image_bytes(row: Any) -> bytes:
    """The image's bytes. Raises StorageError (ObjectNotFound) when they can't be read."""
    if row.image_data is not None:
        return bytes(row.image_data)
    if row.storage_key:
        return get_image_store().get(row.storage_key)
    raise StorageError(f"Image {row.id} has no stored bytes.")


def _keys(rows: Iterable[Any]) -> list[str]:
    keys: list[str] = []
    for row in rows:
        key = row if isinstance(row, str) else getattr(row, "storage_key", None)
        if key:
            keys.append(key)
    return keys


def _delete_now(keys: Iterable[str]) -> int:
    unique = list(dict.fromkeys(keys))
    if not unique:
        return 0
    try:
        get_image_store().delete_many(unique)
    except Exception:
        # Never let the bucket fail a delete: the rows are gone either way, and
        # a leftover object only costs storage.
        logger.exception(
            "Could not delete %d image object(s) from object storage (e.g. %s)",
            len(unique),
            unique[0],
        )
        return 0
    logger.info("Deleted %d image object(s) from object storage", len(unique))
    return len(unique)


def delete_image_objects(rows: Iterable[Any], *, db: Session | None = None) -> int:
    """Remove the stored objects of ``rows`` (ORM rows or storage keys).

    With ``db`` the deletion runs after that session's next commit (dropped on
    rollback); returns the number of keys queued. Without ``db`` it runs now,
    best effort; returns the number deleted. Rows without a ``storage_key``
    (bytes in the database) are ignored.
    """
    keys = _keys(rows)
    if db is None:
        return _delete_now(keys)
    if keys:
        db.info.setdefault(_PENDING, set()).update(keys)
    return len(keys)


def object_keys(db: Session, model: Any, *criteria: Any) -> list[str]:
    """Storage keys of the ``model`` rows matching ``criteria`` (for bulk deletes)."""
    query = db.query(model.storage_key).filter(model.storage_key.isnot(None), *criteria)
    return [key for (key,) in query]


# --- ORM hooks: deletes (including cascades) remove their objects after commit ---


@event.listens_for(Session, "before_flush")
def _collect_deleted_objects(session: Session, flush_context: Any, instances: Any) -> None:
    # Session.delete() applies delete cascades immediately, so cascaded children
    # (a Session's images, an image's processed versions) are already here.
    rows = [obj for obj in session.deleted if _is_image_row(obj)]
    if rows:
        delete_image_objects(rows, db=session)


@event.listens_for(Session, "after_commit")
def _delete_pending_objects(session: Session) -> None:
    keys = session.info.pop(_PENDING, None)
    if keys:
        _delete_now(keys)


@event.listens_for(Session, "after_rollback")
def _forget_pending_objects(session: Session) -> None:
    session.info.pop(_PENDING, None)
