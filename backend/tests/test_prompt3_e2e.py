import io
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

_test_db_dir = tempfile.mkdtemp(prefix="wildfirex_p3_e2e_")
os.environ["WILDFIREX_DATABASE_URL"] = f"sqlite:///{Path(_test_db_dir) / 'test_p3.db'}"

from backend.app.core.constants import SCIENTIFIC_DISCLAIMER  # noqa: E402
from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _make_worldcover_geotiff_bytes(width: int = 12, height: int = 12) -> bytes:
    arr = np.full((1, height, width), 10, dtype=np.uint8)  # ESA Tree cover
    arr[0, 0:3, 0:3] = 30  # Grassland
    arr[0, 10:12, 10:12] = 80  # Permanent water
    arr[0, 0, 11] = 0  # NoData
    buf = io.BytesIO()
    transform = from_origin(76.10, 12.10, 0.002, 0.002)
    with rasterio.open(
        buf,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=transform,
        nodata=0,
    ) as dst:
        dst.write(arr)
    return buf.getvalue()


def test_prompt3_end_to_end_pipeline(client: TestClient):
    # 1. Health & Syllabus verification
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    syllabus = client.get("/api/syllabus")
    assert syllabus.status_code == 200
    syl_body = syllabus.json()
    assert syl_body["total_modules"] == 5
    assert syl_body["implemented_and_verified_count"] == syl_body["total_concepts"]

    # 2. Study area exposes boolean has_boundary_geometry and never leaks local file path
    study_res = client.get("/api/study-areas/active")
    assert study_res.status_code == 200
    study_payload = study_res.json()
    assert "has_boundary_geometry" in study_payload["study_area"]
    assert "geometry_geojson_path" not in study_payload["study_area"]

    # 3. Upload GeoTIFF & verify no raw path leakage
    tiff_bytes = _make_worldcover_geotiff_bytes()
    ds_res = client.post(
        "/api/datasets/upload",
        data={"name": "Nagarhole Sample ESA", "data_source": "esa_worldcover", "acquisition_date": "2021-01-01"},
        files={"file": ("nagarhole_esa.tif", tiff_bytes, "image/tiff")},
    )
    assert ds_res.status_code == 201
    ds_json = ds_res.json()
    ds_text = json.dumps(ds_json)
    assert "stored_path" not in ds_text
    assert "/app/" not in ds_text
    ds_id = ds_json["id"]

    # 4. Generate structured grid
    grid_res = client.post(
        "/api/grids/generate",
        json={
            "name": "Nagarhole P3 Grid",
            "source_dataset_id": ds_id,
            "clip_to_boundary": False,
            "target_resolution_meters": 250.0,
            "max_dimension": 12,
            "connectivity": 8,
        },
    )
    assert grid_res.status_code == 201
    grid = grid_res.json()
    grid_id = grid["id"]
    assert grid["cell_count"] > 0

    # Fetch a valid burnable cell
    cells_res = client.get(f"/api/grids/{grid_id}/cells?limit=200")
    assert cells_res.status_code == 200
    burnable_cells = [
        c
        for c in cells_res.json()["cells"]
        if c["quality_status"] == "valid" and c["landcover_category"] != "Permanent water bodies"
    ]
    assert len(burnable_cells) >= 2
    seed_uid = burnable_cells[0]["cell_uid"]

    # 5. FIRMS CSV upload with valid, duplicate, confirmed_incident, and invalid rows
    firms_csv = (
        "latitude,longitude,acq_date,acq_time,brightness,frp,confidence,satellite,instrument,record_type\n"
        "12.0200,76.1200,2023-03-14,0830,318.5,24.1,high,Aqua,MODIS,satellite_hotspot\n"
        "12.0200,76.1200,2023-03-14,0830,318.5,24.1,high,Aqua,MODIS,satellite_hotspot\n"
        "12.0350,76.1400,2024-02-20,1315,326.0,42.8,nominal,N20,VIIRS,confirmed_incident\n"
        "999.0000,76.1500,2024-02-21,1400,310.0,10.0,low,Terra,MODIS,satellite_hotspot\n"
    ).encode("utf-8")

    csv_up = client.post(
        "/api/datasets/upload",
        data={"name": "Nagarhole FIRMS P3", "data_source": "nasa_firms"},
        files={"file": ("firms_p3.csv", firms_csv, "text/csv")},
    )
    assert csv_up.status_code == 201
    csv_ds_id = csv_up.json()["id"]

    map_res = client.post(
        f"/api/datasets/{csv_ds_id}/csv-mapping",
        json={
            "latitude_column": "latitude",
            "longitude_column": "longitude",
            "date_column": "acq_date",
            "time_column": "acq_time",
            "brightness_column": "brightness",
            "frp_column": "frp",
            "confidence_column": "confidence",
            "satellite_column": "satellite",
            "instrument_column": "instrument",
            "record_type_column": "record_type",
            "crs": "EPSG:4326",
            "interpret_as": "historical_observations",
        },
    )
    assert map_res.status_code == 200
    mapped_meta = map_res.json()["metadata_record"]["extra_json"]
    assert mapped_meta["observations_ingested"] == 3
    assert mapped_meta["duplicate_rows_detected"] == 1
    assert mapped_meta["invalid_rows_skipped"] == 1

    # 6. Observations analytics filtering & CSV/JSON export
    obs_all = client.get(f"/api/observations?dataset_id={csv_ds_id}")
    assert obs_all.status_code == 200
    obs_body = obs_all.json()
    assert obs_body["total"] == 3
    assert obs_body["duplicate_count"] == 1
    assert obs_body["unique_count"] == 2
    assert obs_body["record_type_breakdown"]["satellite_hotspot"] == 2
    assert obs_body["record_type_breakdown"]["confirmed_incident"] == 1
    assert len(obs_body["yearly_summary"]) == 2

    obs_dedup = client.get(f"/api/observations?dataset_id={csv_ds_id}&year=2023&exclude_duplicates=true")
    assert obs_dedup.status_code == 200
    assert obs_dedup.json()["total"] == 1

    obs_csv_export = client.get(f"/api/observations/export?format=csv&dataset_id={csv_ds_id}&exclude_duplicates=true")
    assert obs_csv_export.status_code == 200
    assert "text/csv" in obs_csv_export.headers["content-type"]
    assert "satellite_hotspot" in obs_csv_export.text

    # 7. Data Quality audit
    dq_res = client.get("/api/data-quality")
    assert dq_res.status_code == 200
    dq = dq_res.json()
    assert dq["disclaimer"] == SCIENTIFIC_DISCLAIMER
    assert len(dq["datasets"]) >= 2
    assert len(dq["grids"]) >= 1

    # 8. Create, step, and compare hypothetical simulations + Experiment lifecycle
    sim_res = client.post(
        "/api/cellular-automata/simulations",
        json={
            "name": "P3 Moore Baseline",
            "grid_id": grid_id,
            "neighborhood": "moore_8",
            "boundary_condition": "absorbing",
            "seed_cell_uids": [seed_uid],
            "barrier_cell_uids": [],
            "base_transition_factor": 0.65,
            "moisture_damping": 0.15,
            "wind_direction": "E",
            "wind_bias": 0.1,
            "burn_duration_steps": 2,
            "max_generations": 15,
            "deterministic_mode": True,
        },
    )
    assert sim_res.status_code == 201
    sim_id = sim_res.json()["simulation"]["id"]
    step_res = client.post(f"/api/cellular-automata/simulations/{sim_id}/step", json={"steps": 3})
    assert step_res.status_code == 200
    assert step_res.json()["simulation"]["current_generation"] == 3

    exp_res = client.post(
        "/api/experiments",
        json={
            "name": "P3 Combinatorics Audit",
            "module_type": "combinatorics",
            "grid_id": grid_id,
            "dataset_id": ds_id,
            "parameters": {"topic": "combinations", "n": 8, "r": 3},
        },
    )
    assert exp_res.status_code == 201
    exp_id = exp_res.json()["id"]
    assert exp_res.json()["dataset_version_hash"] == ds_json["sha256_hash"]

    exec_res = client.post(f"/api/experiments/{exp_id}/execute")
    assert exec_res.status_code == 200
    assert exec_res.json()["status"] == "completed"
    assert exec_res.json()["results_json"]["summary"]["C(n,r)"] == 56

    exp_csv = client.get(f"/api/experiments/{exp_id}/export?format=csv")
    assert exp_csv.status_code == 200
    assert "dataset_version_hash" in exp_csv.text

    comp_res = client.get("/api/experiments/compare/summary")
    assert comp_res.status_code == 200
    comp = comp_res.json()
    assert len(comp["simulation_scenarios"]) >= 1
    assert "NOT operational wildfire forecasts" in comp["scenario_notice"]

    # 9. Generate PDF & CSV 15-section Research Reports, verify persistence, download, and delete
    pdf_rep_res = client.post(
        "/api/reports/generate",
        json={
            "title": "Nagarhole P3 Validation PDF",
            "format": "pdf",
            "grid_id": grid_id,
            "simulation_id": sim_id,
            "experiment_id": exp_id,
        },
    )
    assert pdf_rep_res.status_code == 201
    pdf_rep = pdf_rep_res.json()
    assert pdf_rep["has_file"] is True
    assert pdf_rep["summary_json"]["section_count"] == 15
    assert len(pdf_rep["summary_json"]["sections"]) == 15

    pdf_dl = client.get(f"/api/reports/{pdf_rep['id']}/download")
    assert pdf_dl.status_code == 200
    assert pdf_dl.content.startswith(b"%PDF-")
    assert len(pdf_dl.content) > 1000

    csv_rep_res = client.post(
        "/api/reports/generate",
        json={"title": "Nagarhole P3 Validation CSV", "format": "csv", "grid_id": grid_id},
    )
    assert csv_rep_res.status_code == 201
    csv_rep = csv_rep_res.json()
    csv_dl = client.get(f"/api/reports/{csv_rep['id']}/download")
    assert csv_dl.status_code == 200
    assert "2,Study Area," in csv_dl.text
    assert SCIENTIFIC_DISCLAIMER in csv_dl.text

    # 10. Clean deletion of report, experiment, datasets
    assert client.delete(f"/api/reports/{pdf_rep['id']}").status_code == 200
    assert client.delete(f"/api/reports/{csv_rep['id']}").status_code == 200
    assert client.delete(f"/api/experiments/{exp_id}").status_code == 200
    assert client.delete(f"/api/datasets/{csv_ds_id}").status_code == 200
    assert client.delete(f"/api/datasets/{ds_id}").status_code == 200
