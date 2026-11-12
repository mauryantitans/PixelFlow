"""HTTP-level tests for the /processing endpoints.

Uses the FastAPI TestClient (working again after the Phase 6b FastAPI/Starlette
bump). These exercise the real route layer — the gap that previously let a
route-level regression slip past the unit suite.
"""


def test_operations_returns_full_schema(client):
    body = client.get("/api/processing/operations").json()
    assert body["success"] is True
    assert body["version"] == "2"
    assert [c["name"] for c in body["categories"]] == ["Basic", "OpenCV", "Scikit-Image", "Custom"]

    ops = {
        op["id"]: op
        for cat in body["categories"]
        for sub in cat["subcategories"]
        for op in sub["operations"]
    }
    assert "gaussian_blur" in ops
    radius = next(p for p in ops["gaussian_blur"]["params"] if p["name"] == "radius")
    assert radius["type"] == "int"
    assert {"min", "max", "default"} <= set(radius)


def test_operations_keeps_legacy_list_for_compat(client):
    body = client.get("/api/processing/operations").json()
    assert "Gaussian Blur" in body["operations"]
    assert "Flood Fill" in body["operations"]
    # 77 built-in + Custom Kernel; the hidden Custom Filter step isn't listed
    assert body["total_count"] == 78
    assert len(body["operations"]) == 78
    assert "Custom Filter" not in body["operations"]


def test_process_live_unknown_image_returns_404(client):
    # Exercises the load_image_from_db route path; would have caught the 6a
    # regression (which surfaced as a 500 instead of a clean 404).
    resp = client.post(
        "/api/processing/process-live",
        json={
            "image_id": "does-not-exist",
            "pipeline": [{"name": "Grayscale", "params": {}}],
            "session_id": "s1",
        },
    )
    assert resp.status_code == 404
