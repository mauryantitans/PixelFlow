"""The Expression operation and its safe formula evaluator."""

import time

import numpy as np
import pytest
from PIL import Image

from app.processing.executor import execute_step
from app.processing.expression import ExpressionError, compile_formula
from app.processing.registry import ensure_registered, registry


@pytest.fixture(scope="module")
def image():
    ensure_registered()
    rng = np.random.default_rng(7)
    return Image.fromarray(rng.integers(0, 256, size=(30, 44, 3), dtype=np.uint8))


def arr(im):
    return np.asarray(im, dtype=np.int16)


def run(image, **params):
    return execute_step(image, {"name": "Expression", "params": params})


def test_defaults_are_identity(image):
    out, err = run(image)
    assert err is None
    assert np.array_equal(arr(out), arr(image))


def test_invert_and_amount(image):
    out, err = run(image, red="1 - r", green="1 - g", blue="1 - b")
    assert err is None
    assert np.abs(arr(out) - (255 - arr(image))).max() <= 1
    half, err = run(image, red="1 - r", green="1 - g", blue="1 - b", amount=0.0)
    assert err is None and np.array_equal(arr(half), arr(image))


def test_luma_and_empty_field_keeps_channel(image):
    out, err = run(image, red="l", green="", blue="b")
    assert err is None
    a, src = arr(out), arr(image)
    luma = 0.299 * src[..., 0] + 0.587 * src[..., 1] + 0.114 * src[..., 2]
    assert np.abs(a[..., 0] - luma).max() <= 1
    assert np.array_equal(a[..., 1], src[..., 1])


def test_position_variables_make_a_gradient():
    ensure_registered()
    flat = Image.new("RGB", (11, 5), (0, 0, 0))
    out, err = run(flat, red="x", green="y", blue="0")
    assert err is None
    a = arr(out)
    assert a[0, 0, 0] == 0 and a[0, -1, 0] == 255
    assert a[0, 0, 1] == 0 and a[-1, 0, 1] == 255


def test_conditionals_comparisons_and_functions(image):
    out, err = run(
        image,
        red="1 if r > 0.5 else 0",
        green="where(g < 0.5 and not b > 0.9, 0, 1)",
        blue="clamp(mix(b, 1, 0.5) + step(0.2, b) * 0, 0, 1)",
    )
    assert err is None
    a, src = arr(out), arr(image)
    assert set(np.unique(a[..., 0])) <= {0, 255}
    assert np.array_equal(a[..., 0] == 255, src[..., 0] / 255 > 0.5)


def test_overflow_nan_and_division_by_zero_are_clipped(image):
    out, err = run(image, red="9**9**9**9", green="r / 0", blue="log(0) + sqrt(0 - 1)")
    assert err is None
    a = arr(out)
    assert (a[..., 0] == 255).all()
    assert a.min() >= 0 and a.max() <= 255


def test_alpha_is_kept():
    ensure_registered()
    rgba = Image.new("RGBA", (6, 4), (10, 20, 30, 77))
    out, err = run(rgba, red="1 - r")
    assert err is None and out.mode == "RGBA"
    assert out.getpixel((0, 0)) == (245, 20, 30, 77)


@pytest.mark.parametrize(
    "formula, message",
    [
        ('__import__("os").system("x")', "attribute access"),
        ('__import__("os")', "unknown function '__import__'"),
        ("(r)(g)", "unknown function 'r'"),
        ("(1 + r)(g)", "only functions can be called"),
        ("r.__class__", "attribute access"),
        ("r[0]", "indexing"),
        ('"text"', "only numbers"),
        ("lambda: 1", "lambdas"),
        ("[r for r in g]", "lambdas and comprehensions"),
        ("(r, g)", "lists, tuples"),
        ("open(1)", "unknown function 'open'"),
        ("q + 1", "unknown name 'q'"),
        ("abs", "is a function"),
        ("min(r)", "takes 2 to 8"),
        ("pow(r, e=2)", "name=value"),
        ("r // 2", "//"),
        ("True", "only numbers"),
        ("1e999", "too large"),
        ("r +", "syntax error"),
        ("(x := 1)", "can't use"),
        ("+".join(["r"] * 70), "too long"),
        ("r" + " + r" * 80, "longer than 200"),
    ],
)
def test_unsafe_or_invalid_formulas_are_rejected(image, formula, message):
    out, err = run(image, red=formula)
    assert err is not None
    assert message in err.message
    assert "red" in err.message
    assert out is image or np.array_equal(arr(out), arr(image))


def test_compile_rejects_without_running():
    with pytest.raises(ExpressionError):
        compile_formula("().__class__.__bases__[0].__subclasses__()")


def test_large_image_is_fast():
    ensure_registered()
    big = Image.new("RGB", (1600, 1200), (100, 150, 200))
    t = time.perf_counter()
    _, err = run(big, red="sin(x * pi * 8) * 0.5 + 0.5", green="smoothstep(0.2, 0.8, y)", blue="l")
    assert err is None
    assert time.perf_counter() - t < 3


def test_presets_run_cleanly(image):
    spec = registry.resolve("expression")
    assert spec is not None and len(spec.presets) >= 8
    for preset in spec.presets:
        assert set(preset["params"]) <= {p.name for p in spec.params}
        _, err = run(image, **preset["params"])
        assert err is None, preset["label"]


def test_schema_exposes_presets_and_code_fields():
    ensure_registered()
    schema = registry.resolve("expression").schema()
    assert schema["category"] == "Custom" and schema["presets"]
    red = next(p for p in schema["params"] if p["name"] == "red")
    assert red["type"] == "text" and red["code"] is True and red["max_length"] == 200
