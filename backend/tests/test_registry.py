"""Tests for the operation registry."""

from app.processing.registry import registry, slugify


def test_slugify():
    assert slugify("Gaussian Blur") == "gaussian_blur"
    assert slugify("RGB to HSV") == "rgb_to_hsv"
    assert slugify("Non-Local Means Denoising") == "non_local_means_denoising"


def test_all_builtins_registered():
    ops = registry.all()
    # 53 built-ins + 2 interactive + 10 extras (batch 1) + 12 extras2 (batch 2)
    assert len(ops) == 79  # 77 built-in + Custom Kernel + Custom Filter


def test_resolve_by_id_label_and_alias():
    # id
    assert registry.resolve("gaussian_blur").label == "Gaussian Blur"
    # legacy display label (used by saved pipelines + current UI)
    assert registry.resolve("Gaussian Blur").id == "gaussian_blur"
    # case-insensitive
    assert registry.resolve("gaussian blur").id == "gaussian_blur"
    # unknown
    assert registry.resolve("No Such Op") is None


def test_schema_shape_and_grouping():
    schema = registry.to_schema()
    assert schema["version"] == "2"
    names = [c["name"] for c in schema["categories"]]
    assert names == ["Basic", "OpenCV", "Scikit-Image", "Custom"]
    # every operation exposes typed params
    for cat in schema["categories"]:
        for sub in cat["subcategories"]:
            for op in sub["operations"]:
                assert "id" in op and "label" in op and "params" in op
                for param in op["params"]:
                    assert {"name", "label", "type", "default"} <= set(param)


def test_interactive_flag_false_for_scalar_ops():
    assert registry.resolve("gaussian_blur").interactive is False
