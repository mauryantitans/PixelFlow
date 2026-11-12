"""
Operation registry — the single source of truth for image-processing
operations: their stable id, display metadata, typed parameter specs, and the
callable that performs the work.

The frontend renders its controls from `registry.to_schema()`, and the
executor validates pipeline steps against the same specs. Legacy display-name
strings (used by already-saved pipelines and the current static-config UI) are
registered as `aliases`, so `resolve()` keeps them working.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field

from .param_specs import ParamSpec


def slugify(label: str) -> str:
    """'Gaussian Blur' -> 'gaussian_blur'."""
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s


@dataclass
class OperationSpec:
    id: str
    label: str
    category: str
    fn: Callable
    subcategory: str | None = None
    description: str = ""
    params: list[ParamSpec] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    #: Resolvable and executable, but not listed in the palette (e.g. the
    #: "Custom Filter" step, which is added from a saved filter, not clicked).
    hidden: bool = False

    @property
    def interactive(self) -> bool:
        """True if any parameter needs the image (point/points/rect)."""
        return any(p.needs_image for p in self.params)

    def schema(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "category": self.category,
            "subcategory": self.subcategory,
            "description": self.description,
            "interactive": self.interactive,
            "hidden": self.hidden,
            "params": [p.schema() for p in self.params],
        }


class OperationRegistry:
    def __init__(self) -> None:
        self._by_id: dict[str, OperationSpec] = {}
        self._index: dict[str, str] = {}  # id/alias (lowercased) -> id

    def register(self, spec: OperationSpec) -> OperationSpec:
        if spec.id in self._by_id:
            raise ValueError(f"duplicate operation id: {spec.id}")
        self._by_id[spec.id] = spec
        self._add_key(spec.id, spec.id)
        self._add_key(spec.label, spec.id)
        for alias in spec.aliases:
            self._add_key(alias, spec.id)
        return spec

    def _add_key(self, key: str, op_id: str) -> None:
        k = key.strip().lower()
        existing = self._index.get(k)
        if existing and existing != op_id:
            raise ValueError(f"operation key {key!r} maps to both {existing!r} and {op_id!r}")
        self._index[k] = op_id

    def resolve(self, name: str | None) -> OperationSpec | None:
        """Resolve an id, label, or legacy alias to its OperationSpec."""
        ensure_registered()
        op_id = self._index.get((name or "").strip().lower())
        return self._by_id.get(op_id) if op_id else None

    def all(self) -> list[OperationSpec]:
        ensure_registered()
        return list(self._by_id.values())

    def to_schema(self) -> dict:
        """Full schema grouped by category -> subcategory -> operations."""
        ensure_registered()
        categories: dict[str, dict[str | None, list[dict]]] = {}
        order: list[str] = []
        for spec in self._by_id.values():
            if spec.category not in categories:
                categories[spec.category] = {}
                order.append(spec.category)
            categories[spec.category].setdefault(spec.subcategory, []).append(spec.schema())

        return {
            "version": "2",
            "categories": [
                {
                    "name": cat,
                    "subcategories": [
                        {"name": sub, "operations": ops} for sub, ops in categories[cat].items()
                    ],
                }
                for cat in order
            ],
        }


#: Process-wide singleton.
registry = OperationRegistry()

_bootstrapped = False


def ensure_registered() -> None:
    """Populate the registry on first use (lazy to avoid import cycles)."""
    global _bootstrapped
    if not _bootstrapped:
        _bootstrapped = True
        from .operations import (  # noqa: F401  (register on import)
            _builtins,
            custom,
            extras,
            extras2,
            interactive,
        )
