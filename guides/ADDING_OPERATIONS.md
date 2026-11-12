# Adding operations

Operations are declared **once, in the backend**. The frontend renders every control from the
schema at `GET /api/processing/operations`, so adding an operation needs **no frontend
changes**.

## 1. Write the function

A plain function that takes a PIL image and keyword params and returns a PIL image. Put it in
an existing module under `backend/app/processing/operations/` (e.g. `extras2.py`) or a new one.

```python
import cv2
import numpy as np
from PIL import Image

def posterize_edges(image: Image.Image, levels=4, edge_strength=1.0, outline=True):
    arr = np.array(image.convert("RGB"))
    step = 256 // int(levels)
    out = (arr // step) * step
    if outline:
        edges = cv2.Canny(cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY), 80, 160)
        out[edges > 0] = (out[edges > 0] * (1 - min(edge_strength, 1.0))).astype(np.uint8)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
```

Rules of thumb:
- Work in RGB (`image.convert("RGB")`) and return `uint8`. Clip **before** casting: overflow
  wraps around silently.
- Params arrive already validated and coerced (ints are ints, kernels are odd, colors are
  `(r, g, b)` tuples, coordinates are **pixels** of the current image).
- If an interactive param isn't set yet (e.g. no point picked), return the image unchanged.
- Raise an exception for real failures. The executor turns it into a per-step error banner
  instead of failing the pipeline.

## 2. Register it

```python
from ..param_specs import BoolParam, FloatParam, IntParam
from ..registry import OperationSpec, registry

registry.register(OperationSpec(
    id="posterize_edges",            # stable snake_case id: never rename or reuse
    label="Posterize Edges",         # display name (saved pipelines store this)
    category="Basic",                # palette grouping
    subcategory="Effects",
    description="Flat color bands with dark outlines.",
    fn=posterize_edges,
    params=[
        IntParam(name="levels", label="Levels", default=4, min=2, max=16),
        FloatParam(name="edge_strength", label="Edge strength", default=1.0, min=0.0, max=1.0, step=0.05),
        BoolParam(name="outline", label="Outline", default=True),
    ],
))
```

If you add a new module, import it in `ensure_registered()` in
`backend/app/processing/registry.py`.

**Renaming later:** change `label`, and add the old label to `aliases=[...]`. Never remove an
alias. Saved pipelines refer to operations by display name and resolve through the alias map.

**Hidden operations:** `hidden=True` keeps an operation runnable (pipelines can name it and the
executor resolves it) but leaves it out of the palette, the legacy `operations` list and
`total_count`. Use it for steps that the UI adds some other way. The one example is
`custom_filter` in `operations/custom.py`, which the UI adds from **Custom → My filters**.

## Parameter types

All take `name`, `label`, `default`, and optionally `help` (tooltip text) and `advanced`.

| Class | `type` in schema | Extra fields | Control | Value your function gets |
|---|---|---|---|---|
| `IntParam` | `int` | `min`, `max`, `step` | slider | `int`, clamped |
| `FloatParam` | `float` | `min`, `max`, `step` | slider | `float`, clamped |
| `OddKernelParam` | `odd_kernel` | `min`, `max` | slider (odd values only) | odd `int` |
| `AngleParam` | `angle` | `min`, `max`, `step` | slider (degrees) | `float` |
| `EnumParam` | `enum` | `options=[(value, label), ...]` | select | one of the values |
| `BoolParam` | `bool` | | switch | `bool` |
| `ColorParam` | `color` | `alpha` | color picker + eyedropper | `(r, g, b)` |
| `PointParam` | `point` | | click on the preview | `(x, y)` pixels, or `None` |
| `PointsParam` | `points` | `min_points`, `max_points` | several clicks | list of `(x, y)` |
| `RectParam` | `rect` | | drag a region | `(x, y, w, h)` pixels, or `None` |
| `MatrixParam` | `matrix` | `min_size`, `max_size` (odd), `value_min`, `value_max`, `presets=[{"label", "value"}]` | matrix editor with presets and a size picker | square `list[list[float]]`, odd size |
| `TextParam` | `text` | `max_length` (80) | text field | `str`, trimmed and cut to `max_length` |
| `StepsParam` | `steps` | `max_steps` (30) | read-only list of the steps | `list` of `{"name", "params", "enabled"}` |

`StepsParam` is for operations that run other steps (see `custom_filter`): pass each step to
`execute_step` rather than calling operation functions directly, so validation, coordinates and
`enabled` work the same as in a pipeline.

Coordinates are stored and sent as normalized `[0..1]` values and converted to pixels in
`processing/coords.py` against the image **at that step**. A point picked before an upstream
Resize or Crop therefore still lands in the right place.

## 3. Test it

Add a test next to the others in `backend/tests/` (see `test_extras_ops.py`):

```python
from app.processing.executor import execute_step
from app.processing.registry import registry

def test_posterize_edges():
    assert registry.resolve("posterize_edges") is not None
    out, err = execute_step(_gradient(), {"name": "Posterize Edges", "params": {"levels": 3}})
    assert err is None and out.size == _gradient().size
```

Then run the quality gate from `backend/`, as CI does: `ruff check app/processing tests`,
`ruff format --check app/processing tests`, `mypy` (scope set in `pyproject.toml`), `pytest`.
The registry and API tests count operations (`test_registry.py`, `test_operations_api.py`,
`test_builtins_smoke.py`), so update those counts when you add one. If your operation has a "no change" setting (e.g. amount 0), add it to
the identity cases in `test_operation_ranges.py`, which catches uint8 wrap-around.

## 4. Check it in the app

Start the stack (`./start.sh`). The operation appears in the palette under its category with
the right controls. Nothing to change in `frontend/`.
