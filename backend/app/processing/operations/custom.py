"""
User-defined filters.

* **Custom Kernel**: type your own convolution matrix (3×3 … 9×9) or start from a
  preset. Safe by construction: it is only ever a matrix of numbers.
* **Expression**: one formula per channel (``0.3*r + 0.59*g + 0.11*b``),
  evaluated per pixel by the safe evaluator in ``processing/expression.py``
  (an allow-list of operators and functions; never ``eval``).
* **Custom Filter**: a reusable filter made of existing steps. Saving a pipeline
  "as a filter" stores its steps; adding the filter puts one step in the
  pipeline that runs those steps in order. It's a snapshot, so later edits to
  the saved filter don't change pipelines that already use it.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from PIL import Image

from ..expression import MAX_LENGTH, ExpressionError, compile_formula, evaluate
from ..param_specs import BoolParam, FloatParam, IntParam, MatrixParam, StepsParam, TextParam
from ..registry import OperationSpec, registry

KERNEL_PRESETS: list[dict[str, Any]] = [
    {"label": "Identity", "value": [[0, 0, 0], [0, 1, 0], [0, 0, 0]]},
    {"label": "Box blur", "value": [[1, 1, 1], [1, 1, 1], [1, 1, 1]]},
    {"label": "Gaussian blur", "value": [[1, 2, 1], [2, 4, 2], [1, 2, 1]]},
    {
        "label": "Gaussian blur 5×5",
        "value": [
            [1, 4, 6, 4, 1],
            [4, 16, 24, 16, 4],
            [6, 24, 36, 24, 6],
            [4, 16, 24, 16, 4],
            [1, 4, 6, 4, 1],
        ],
    },
    {"label": "Sharpen", "value": [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]},
    {"label": "Edge detect", "value": [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]},
    {"label": "Emboss", "value": [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]]},
    {"label": "Sobel (vertical edges)", "value": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]},
    {
        "label": "Motion blur 5×5",
        "value": [[1 if r == c else 0 for c in range(5)] for r in range(5)],
    },
]

CUSTOM_FILTER_ID = "custom_filter"


def custom_kernel(image: Image.Image, kernel, normalize=True, offset=0, absolute=False):
    k = np.asarray(kernel, dtype=np.float32)
    total = float(k.sum())
    if normalize and abs(total) > 1e-9:
        k = k / total
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    out = cv2.filter2D(arr, -1, k, borderType=cv2.BORDER_REFLECT_101)
    if absolute:
        out = np.abs(out)
    out = out + float(offset)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def _channel_presets(
    label: str, r: str, g: str | None = None, b: str | None = None
) -> dict[str, Any]:
    return {"label": label, "params": {"red": r, "green": g or r, "blue": b or r}}


EXPRESSION_PRESETS: list[dict[str, Any]] = [
    _channel_presets("Identity", "r", "g", "b"),
    _channel_presets("Invert", "1 - r", "1 - g", "1 - b"),
    _channel_presets("Grayscale (luma)", "l"),
    _channel_presets(
        "Sepia",
        "0.393*r + 0.769*g + 0.189*b",
        "0.349*r + 0.686*g + 0.168*b",
        "0.272*r + 0.534*g + 0.131*b",
    ),
    _channel_presets("Swap red and blue", "b", "g", "r"),
    _channel_presets("Threshold at 50%", "step(0.5, l)"),
    _channel_presets(
        "Solarize", "r if r < 0.5 else 1 - r", "g if g < 0.5 else 1 - g", "b if b < 0.5 else 1 - b"
    ),
    _channel_presets("Brighten shadows (gamma)", "r ** 0.6", "g ** 0.6", "b ** 0.6"),
    _channel_presets(
        "Vignette",
        "r * (1 - 1.2*((x - 0.5)**2 + (y - 0.5)**2))",
        "g * (1 - 1.2*((x - 0.5)**2 + (y - 0.5)**2))",
        "b * (1 - 1.2*((x - 0.5)**2 + (y - 0.5)**2))",
    ),
    _channel_presets("Keep only red", "r", "l", "l"),
]


def expression(image: Image.Image, red="r", green="g", blue="b", amount=1.0):
    formulas = []
    for channel, text in (("red", red), ("green", green), ("blue", blue)):
        try:
            # An empty field leaves that channel as it is.
            formulas.append(compile_formula(text.strip() or channel[0]))
        except ExpressionError as e:
            raise ValueError(f"{channel} formula: {e}") from None
    alpha = image.getchannel("A") if image.mode in ("RGBA", "LA") else None
    src = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    out = np.stack(evaluate(formulas, src), axis=-1)
    if amount < 1.0:
        out = src + (out - src) * float(amount)
    result = Image.fromarray(np.clip(np.rint(out * 255.0), 0, 255).astype(np.uint8))
    if alpha is not None:
        result.putalpha(alpha)
    return result


def custom_filter(image: Image.Image, filter_name="", steps=()):
    from ..executor import execute_step  # imported here: executor imports the registry

    current = image
    for i, step in enumerate(steps, start=1):
        spec = registry.resolve(step["name"])
        if spec is not None and spec.id == CUSTOM_FILTER_ID:
            raise ValueError("a custom filter can't contain another custom filter")
        current, err = execute_step(current, step)
        if err is not None:
            raise ValueError(f"step {i} ({step['name']}): {err.message}")
    return current


registry.register(
    OperationSpec(
        id="custom_kernel",
        label="Custom Kernel",
        category="Custom",
        subcategory="Kernels",
        description="Your own convolution: each pixel becomes the weighted sum of its "
        "neighbours, using the matrix you type. Start from a preset and edit the numbers.",
        fn=custom_kernel,
        params=[
            MatrixParam(
                name="kernel",
                label="Kernel",
                default=KERNEL_PRESETS[4]["value"],
                min_size=3,
                max_size=9,
                value_min=-100,
                value_max=100,
                presets=KERNEL_PRESETS,
                help="Weights applied to each pixel's neighbourhood (centre cell = the pixel itself).",
            ),
            BoolParam(
                name="normalize",
                label="Normalize",
                default=True,
                help="Divide by the sum of the weights (when it isn't zero) so brightness stays the same.",
            ),
            BoolParam(
                name="absolute",
                label="Absolute value",
                default=False,
                help="Use the magnitude of the result; useful for edge kernels, whose output can be negative.",
            ),
            IntParam(
                name="offset",
                label="Offset",
                default=0,
                min=-255,
                max=255,
                help="Added after filtering; 128 centres emboss-style kernels on grey.",
            ),
        ],
    )
)

_FORMULA_HELP = (
    "Per pixel, values 0 to 1. Variables: r, g, b, l (luma), x, y (position 0 to 1), "
    "w, h (size in pixels), pi, e. Operators: + - * / % ** < > == and or not, "
    "a if cond else b. Functions: abs sqrt exp log sin cos tan floor ceil round pow "
    "min max clamp mix step smoothstep where. Leave empty to keep the channel."
)

registry.register(
    OperationSpec(
        id="expression",
        label="Expression",
        category="Custom",
        subcategory="Formulas",
        description="Your own formula for each colour channel, e.g. 0.3*r + 0.59*g + 0.11*b (values 0 to 1).",
        fn=expression,
        presets=EXPRESSION_PRESETS,
        params=[
            TextParam(
                name="red",
                label="Red",
                default="r",
                max_length=MAX_LENGTH,
                code=True,
                help=_FORMULA_HELP,
            ),
            TextParam(
                name="green",
                label="Green",
                default="g",
                max_length=MAX_LENGTH,
                code=True,
                help=_FORMULA_HELP,
            ),
            TextParam(
                name="blue",
                label="Blue",
                default="b",
                max_length=MAX_LENGTH,
                code=True,
                help=_FORMULA_HELP,
            ),
            FloatParam(
                name="amount",
                label="Amount",
                default=1.0,
                min=0.0,
                max=1.0,
                step=0.05,
                help="Blend between the original (0) and the formula's result (1).",
            ),
        ],
    )
)

registry.register(
    OperationSpec(
        id=CUSTOM_FILTER_ID,
        label="Custom Filter",
        category="Custom",
        subcategory="My filters",
        description="One of your saved filters: runs its steps in order.",
        fn=custom_filter,
        hidden=True,
        params=[
            TextParam(name="filter_name", label="Filter name", default=""),
            StepsParam(name="steps", label="Steps", default=[]),
        ],
    )
)
