"""Operations must not corrupt the image (uint8 overflow / garbage output).

Exposure, Gamma Correction, Contrast Stretching and Unsharp Mask used to
multiply an already-0..255 result by 255 (or hit a float32 bug), inverting /
wrapping colours even at their "no change" settings.
"""

import numpy as np
import pytest
from PIL import Image

from app.processing.executor import execute_step
from app.processing.registry import ensure_registered


@pytest.fixture(scope="module")
def image():
    ensure_registered()
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 256, size=(48, 64, 3), dtype=np.uint8)
    arr[:, :8] = 0  # make sure the full 0..255 range is present
    arr[:, -8:] = 255
    return Image.fromarray(arr)


def _diff(a, b):
    return np.abs(
        np.asarray(a.convert("RGB")).astype(int) - np.asarray(b.convert("RGB")).astype(int)
    ).mean()


@pytest.mark.parametrize(
    "name,params",
    [
        ("Exposure", {"amount": 0}),
        ("Gamma Correction", {"gamma": 1.0}),
        ("Contrast Stretching", {"in_range": "dtype"}),
        ("Brightness", {"brightness": 0}),
    ],
)
def test_identity_settings_leave_the_image_unchanged(image, name, params):
    out, err = execute_step(image, {"name": name, "params": params})
    assert err is None
    assert _diff(image, out) < 2.0


@pytest.mark.parametrize(
    "name,params",
    [
        ("Exposure", {"amount": 80}),
        ("Gamma Correction", {"gamma": 0.5}),
        ("Contrast Stretching", {"in_range": "image"}),
        ("Unsharp Mask", {"radius": 2, "amount": 2.0}),
    ],
)
def test_real_settings_change_the_image_without_wrapping(image, name, params):
    if name == "Contrast Stretching":
        # needs a low-contrast image to have something to stretch
        arr = (np.asarray(image).astype(np.float64) * 0.5 + 64).astype(np.uint8)
        arr[:, :8], arr[:, -8:] = 20, 235
        image = Image.fromarray(arr)
    out, err = execute_step(image, {"name": name, "params": params})
    assert err is None
    b = np.asarray(out.convert("RGB")).astype(int)
    # Black stays dark and white stays bright: a uint8 wrap-around would flip them.
    assert b[:, :8].mean() < 60
    assert b[:, -8:].mean() > 195
    assert 0 < _diff(image, out) < 120


def test_unsharp_mask_math(image):
    # The slider's minimum amount is 0.5, so check the identity case directly.
    from app.utils.image_processing import ImageProcessor

    assert _diff(image, ImageProcessor.apply_unsharp_mask(image, 1, 0.0)) == 0
    flat = Image.fromarray(np.full((16, 16, 3), 128, np.uint8))
    assert np.asarray(ImageProcessor.apply_unsharp_mask(flat, 2, 2.0)).mean() == 128
