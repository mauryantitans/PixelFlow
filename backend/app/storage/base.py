"""The image-store contract and the default database "store".

A store is a dumb key -> bytes map. Keys are full object keys (prefix
included) and are what the database rows keep in ``storage_key``, so changing
``S3_PREFIX`` later never strands existing rows.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


class StorageError(RuntimeError):
    """The image store could not complete an operation."""


class ObjectNotFound(StorageError):
    """The store has no object under the requested key."""


@runtime_checkable
class ImageStore(Protocol):
    #: True when image bytes stay in the database row (no external objects).
    keeps_bytes_in_database: bool

    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...

    def delete_many(self, keys: Iterable[str]) -> None: ...


class DatabaseStore:
    """Marker store for ``STORAGE_BACKEND=database`` (the default).

    Bytes live in ``image_data``; there are no objects. Rows that were written
    while object storage was enabled still carry a ``storage_key``: reading them
    fails with a clear message instead of a confusing empty image.
    """

    keeps_bytes_in_database = True

    def put(self, key: str, data: bytes, content_type: str) -> None:
        raise StorageError(
            "STORAGE_BACKEND=database stores image bytes in the row, not as objects."
        )

    def get(self, key: str) -> bytes:
        raise StorageError(
            f"This image is stored in object storage (key {key!r}), but STORAGE_BACKEND is "
            "'database'. Set STORAGE_BACKEND=s3 and the S3_* settings to read it."
        )

    def delete(self, key: str) -> None:
        self.delete_many([key])

    def delete_many(self, keys: Iterable[str]) -> None:
        keys = list(keys)
        if keys:
            logger.warning(
                "STORAGE_BACKEND=database: %d object(s) left in object storage "
                "(e.g. %s); delete them from the bucket manually.",
                len(keys),
                keys[0],
            )
