import io
import json
import os
import tempfile
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

_test_db_dir = tempfile.mkdtemp(prefix="wildfirex_test_")
os.environ["WILDFIREX_DATABASE_URL"] = f"sqlite:///{Path(_test_db_dir) / 'test_wildfirex.db'}"

from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_endpoint(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["database"] == "connected"
    assert "rasterio" in body["libraries"]
    assert "geopandas" in body["libraries"]


def test_dashboard_empty_state_and_study_area(client: TestClient):
    res = client.get("/api/dashboard/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["study_region"] == "Nagarhole National Park, Karnataka, India"
    assert body["study_area_status"] in {
        "awaiting_boundary_verification",
        "boundary_imported_unverified",
        "verified_boundary",
    }


def test_unsupported_file_rejection(client: TestClient):
    res = client.post(
        "/api/datasets/upload",
        data={"name": "Bad File", "data_source": "other"},
        files={"file": ("malware.exe", b"binary-content", "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "Unsupported file format" in res.json()["detail"]


def test_csv_upload_mapping_and_cleanup(client: TestClient):
    csv_bytes = (
        b"latitude,longitude,frp,acq_date,confidence\n"
        b"12.012,76.125,18.4,2024-03-14,high\n"
        b"12.045,76.182,31.2,2024-03-15,nominal\n"
    )
    upload = client.post(
        "/api/datasets/upload",
        data={"name": "Test FIRMS CSV", "data_source": "nasa_firms"},
        files={"file": ("firms_test.csv", csv_bytes, "text/csv")},
    )
    assert upload.status_code == 201
    ds = upload.json()
    assert ds["processing_status"] == "uploaded"
    ds_id = ds["id"]

    mapping = client.post(
        f"/api/datasets/{ds_id}/csv-mapping",
        json={
            "latitude_column": "latitude",
            "longitude_column": "longitude",
            "date_column": "acq_date",
            "frp_column": "frp",
            "confidence_column": "confidence",
            "crs": "EPSG:4326",
            "interpret_as": "historical_observations",
        },
    )
    assert mapping.status_code == 200
    assert mapping.json()["processing_status"] == "processed"

    obs_res = client.get("/api/dashboard/observations")
    assert obs_res.status_code == 200
    assert obs_res.json()["total"] >= 2

    del_res = client.delete(f"/api/datasets/{ds_id}")
    assert del_res.status_code == 200


def test_geotiff_upload_and_grid_generation(client: TestClient, tmp_path: Path):
    tif_path = tmp_path / "test_worldcover.tif"
    arr = np.array(
        [
            [10, 10, 20, 30],
            [10, 80, 20, 30],
            [40, 80, 10, 10],
            [40, 60, 10, 255],
        ],
        dtype=np.uint8,
    )
    transform = from_origin(76.10, 12.10, 0.001, 0.001)
    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=4,
        width=4,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=transform,
        nodata=255,
    ) as dst:
        dst.write(arr, 1)

    with open(tif_path, "rb") as f:
        up = client.post(
            "/api/datasets/upload",
            data={"name": "Test WorldCover Raster", "data_source": "esa_worldcover"},
            files={"file": ("test_worldcover.tif", f, "image/tiff")},
        )
    assert up.status_code == 201
    ds = up.json()
    assert ds["metadata_record"]["width"] == 4
    assert ds["metadata_record"]["epsg_code"] == 4326

    grid_res = client.post(
        "/api/grids/generate",
        json={
            "name": "Test Nagarhole Grid",
            "source_dataset_id": ds["id"],
            "clip_to_boundary": False,
            "target_resolution_meters": 110.0,
            "max_dimension": 8,
            "connectivity": 4,
        },
    )
    assert grid_res.status_code == 201
    grid = grid_res.json()
    assert grid["cell_count"] >= 4
    assert grid["valid_cell_count"] >= 3

    cells_res = client.get(f"/api/grids/{grid['id']}/cells")
    assert cells_res.status_code == 200
    assert len(cells_res.json()["cells"]) == grid["cell_count"]

    client.delete(f"/api/grids/{grid['id']}")
    client.delete(f"/api/datasets/{ds['id']}")
