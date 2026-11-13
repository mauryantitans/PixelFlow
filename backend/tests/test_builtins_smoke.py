"""Smoke test: every registered built-in operation executes through the
executor with its default parameters without producing a StepError.

Guards against signature/parameter drift between the registry specs and the
operation callables.
"""

import numpy as np
from PIL import Image

from app.processing.executor import execute_step
from app.processing.registry import registry


def _sample_image() -> Image.Image:
    # A gradient gives feature/segmentation ops real content to work on.
    arr = np.tile(np.linspace(0, 255, 96, dtype="uint8"), (72, 1))
    rgb = np.stack([arr, np.roll(arr, 10, axis=1), 255 - arr], axis=-1)
    return Image.fromarray(rgb, "RGB")


def test_every_builtin_runs_with_defaults():
    img = _sample_image()
    failures = []
    for spec in registry.all():
        params = {p.name: p.default for p in spec.params if p.default is not None}
        out, err = execute_step(img, {"name": spec.id, "params": params})
        if err is not None:
            failures.append((spec.id, err.kind, err.message))
        else:
            assert out is not None

    assert not failures, f"operations failed to execute: {failures}"


def test_registry_has_expected_count():
    # 77 built-in operations + Custom Kernel + Expression + the (hidden) Custom Filter step
    assert len(registry.all()) == 80
