"""Custom Kernel, Custom Filter (steps saved as one filter) and disabled steps."""

import numpy as np
import pytest
from PIL import Image

from app.processing.executor import execute_step
from app.processing.registry import ensure_registered


@pytest.fixture(scope="module")
def image():
    ensure_registered()
    rng = np.random.default_rng(1)
    return Image.fromarray(rng.integers(0, 256, size=(40, 52, 3), dtype=np.uint8))


def arr(im):
    return np.asarray(im, dtype=np.int16)


def test_identity_kernel_changes_nothing(image):
    out, err = execute_step(
        image, {"name": "Custom Kernel", "params": {"kernel": [[0, 0, 0], [0, 1, 0], [0, 0, 0]]}}
    )
    assert err is None and np.array_equal(arr(out), arr(image))


def test_box_blur_is_normalized_and_smooths(image):
    out, err = execute_step(image, {"name": "custom_kernel", "params": {"kernel": [[1] * 3] * 3}})
    assert err is None
    assert abs(arr(out).mean() - arr(image).mean()) < 3  # brightness kept
    assert arr(out).std() < arr(image).std()  # smoother


def test_edge_kernel_with_absolute_value(image):
    flat = Image.new("RGB", (20, 20), (90, 90, 90))
    edge = [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]
    out, err = execute_step(
        flat, {"name": "Custom Kernel", "params": {"kernel": edge, "absolute": True}}
    )
    assert err is None and arr(out).max() == 0  # a flat image has no edges


@pytest.mark.parametrize(
    "kernel, message",
    [
        ([[1, 2], [3, 4]], "odd"),
        ([[1, 2, 3], [1, 2, 3]], "square"),
        ([[0, 0, 0], [0, 999, 0], [0, 0, 0]], "between"),
        ([[0, 0, 0], [0, "x", 0], [0, 0, 0]], "numbers"),
        ([[1] * 11] * 11, "odd, between"),
    ],
)
def test_invalid_kernels_are_reported(image, kernel, message):
    out, err = execute_step(image, {"name": "Custom Kernel", "params": {"kernel": kernel}})
    assert err is not None and err.kind == "invalid_params" and message in err.message
    assert out is image


def test_custom_filter_runs_its_steps(image):
    steps = [{"name": "Grayscale", "params": {}}, {"name": "Invert", "params": {}}]
    out, err = execute_step(
        image, {"name": "Custom Filter", "params": {"filter_name": "Neg", "steps": steps}}
    )
    expected = image
    for s in steps:
        expected, _ = execute_step(expected, s)
    assert err is None and np.array_equal(arr(out), arr(expected))


def test_custom_filter_skips_disabled_steps(image):
    steps = [{"name": "Invert", "params": {}, "enabled": False}]
    out, err = execute_step(image, {"name": "Custom Filter", "params": {"steps": steps}})
    assert err is None and np.array_equal(arr(out), arr(image))


def test_custom_filter_reports_the_failing_step(image):
    steps = [{"name": "Grayscale", "params": {}}, {"name": "No Such Op", "params": {}}]
    _, err = execute_step(image, {"name": "Custom Filter", "params": {"steps": steps}})
    assert err is not None and "step 2 (No Such Op)" in err.message


def test_custom_filters_cannot_nest(image):
    inner = {"name": "Custom Filter", "params": {"steps": [{"name": "Invert", "params": {}}]}}
    _, err = execute_step(image, {"name": "Custom Filter", "params": {"steps": [inner]}})
    assert err is not None and "can't contain another custom filter" in err.message


def test_disabled_step_passes_the_image_through(image):
    out, err = execute_step(image, {"name": "Invert", "params": {}, "enabled": False})
    assert err is None and out is image


def test_schema_lists_kernel_presets_and_hides_custom_filter(client):
    data = client.get("/api/processing/operations").json()
    ops = {
        op["id"]: op
        for c in data["categories"]
        for s in c["subcategories"]
        for op in s["operations"]
    }
    kernel = next(p for p in ops["custom_kernel"]["params"] if p["name"] == "kernel")
    assert kernel["type"] == "matrix" and len(kernel["presets"]) >= 5
    assert ops["custom_filter"]["hidden"] is True and ops["custom_kernel"]["hidden"] is False


def test_disabled_step_in_live_processing(client):
    import io

    buf = io.BytesIO()
    Image.new("RGB", (16, 12), (10, 120, 200)).save(buf, "PNG")
    up = client.post(
        "/api/images/upload",
        files={"file": ("a.png", buf.getvalue(), "image/png")},
        data={"session_id": "s-toggle"},
    )
    image_id = up.json()["image"]["id"]
    body = lambda enabled: {  # noqa: E731
        "image_id": image_id,
        "session_id": "s-toggle",
        "pipeline": [{"name": "Invert", "params": {}, "enabled": enabled}],
    }
    on = client.post("/api/processing/process-live", json=body(True)).json()["results"][-1]
    off = client.post("/api/processing/process-live", json=body(False)).json()["results"][-1]
    assert on != off  # the prefix cache tells the two apart
