"""
Per-prefix intermediate-image cache for incremental live preview.

A pipeline produces one output image per step. Each step's output is cached
under a cumulative *prefix hash* derived from the source image identity and the
canonical (op, params) of every step up to and including it. When the user edits
step *k*, the prefix hashes for steps 0..k-1 are unchanged (cache hits) while
k..n change — so only steps k..n need to be recomputed.

The cache is a process-wide LRU bounded by entry count and total bytes; stored
images are copied in/out so callers can't mutate cached state.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict

from PIL import Image

_MAX_ENTRIES = 256
_MAX_BYTES = 256 * 1024 * 1024  # 256 MB


class _LRUImageCache:
    def __init__(self) -> None:
        self._d: OrderedDict[str, tuple[Image.Image, int]] = OrderedDict()
        self._bytes = 0
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Image.Image | None:
        with self._lock:
            entry = self._d.get(key)
            if entry is None:
                self.misses += 1
                return None
            self._d.move_to_end(key)
            self.hits += 1
            return entry[0].copy()

    def put(self, key: str, image: Image.Image) -> None:
        nbytes = image.width * image.height * max(1, len(image.getbands()))
        with self._lock:
            if key in self._d:
                _, old = self._d.pop(key)
                self._bytes -= old
            self._d[key] = (image.copy(), nbytes)
            self._bytes += nbytes
            self._d.move_to_end(key)
            while self._d and (len(self._d) > _MAX_ENTRIES or self._bytes > _MAX_BYTES):
                _, (img, nb) = self._d.popitem(last=False)
                self._bytes -= nb

    def clear(self) -> None:
        with self._lock:
            self._d.clear()
            self._bytes = 0


#: Process-wide singleton.
cache = _LRUImageCache()


def _step_signature(step: dict) -> str:
    return json.dumps(
        {
            "name": step.get("name"),
            "params": step.get("params", {}),
            "enabled": step.get("enabled", True) is not False,
        },
        sort_keys=True,
        default=str,
    )


def prefix_hashes(source_key: str, pipeline: list[dict]) -> list[str]:
    """Return the cumulative prefix hash after each step (index-aligned to pipeline)."""
    hasher = hashlib.sha256()
    hasher.update(source_key.encode("utf-8"))
    out: list[str] = []
    for step in pipeline:
        hasher.update(b"\x00")
        hasher.update(_step_signature(step).encode("utf-8"))
        out.append(hasher.hexdigest())
    return out
