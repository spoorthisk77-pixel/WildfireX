import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

TEST_DIR = Path(tempfile.mkdtemp(prefix="wildfirex_p2_test_"))
os.environ["WILDFIREX_DATABASE_URL"] = f"sqlite:///{TEST_DIR / 'test.db'}"
os.environ["WILDFIREX_UPLOAD_DIR"] = str(TEST_DIR / "uploads")
os.environ["WILDFIREX_PROCESSED_DIR"] = str(TEST_DIR / "processed")
os.environ["WILDFIREX_EXPORT_DIR"] = str(TEST_DIR / "exports")

from backend.app.database.init_db import init_database  # noqa: E402
from backend.app.main import app  # noqa: E402

init_database()
client = TestClient(app)


def _create_sample_raster_grid() -> int:
    tif_path = TEST_DIR / "sample_landcover.tif"
    # 6x6 raster with WorldCover codes: 10=Tree, 30=Grass, 80=Water, 60=Bare
    arr = np.array(
        [
            [10, 10, 10, 30, 30, 80],
            [10, 10, 30, 30, 80, 80],
            [10, 30, 30, 10, 10, 30],
            [30, 30, 10, 10, 10, 30],
            [60, 30, 10, 10, 30, 30],
            [80, 60, 30, 10, 10, 10],
        ],
        dtype=np.uint8,
    )
    transform = from_origin(76.10, 12.05, 0.001, 0.001)
    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=6,
        width=6,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=transform,
        nodata=255,
    ) as dst:
        dst.write(arr, 1)

    with open(tif_path, "rb") as f:
        res = client.post(
            "/api/datasets/upload",
            files={"file": ("sample_landcover.tif", f, "image/tiff")},
            data={"name": "Sample Raster", "data_source": "esa_worldcover"},
        )
    assert res.status_code == 201, res.text
    ds_id = res.json()["id"]

    g_res = client.post(
        "/api/grids/generate",
        json={
            "name": "Test CA Grid 6x6",
            "source_dataset_id": ds_id,
            "clip_to_boundary": False,
            "target_resolution_meters": 100.0,
            "max_dimension": 12,
            "connectivity": 4,
        },
    )
    assert g_res.status_code == 201, g_res.text
    return g_res.json()["id"]


def test_grid_coord_conversion_and_neighborhoods():
    grid_id = _create_sample_raster_grid()

    # Grid -> Geo -> Grid roundtrip
    r1 = client.post(
        "/api/cellular-automata/coords/convert",
        json={"grid_id": grid_id, "mode": "grid_to_geo", "row_idx": 1, "col_idx": 2},
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["inside_grid_bounds"] is True
    assert d1["cell_uid"] is not None

    r2 = client.post(
        "/api/cellular-automata/coords/convert",
        json={
            "grid_id": grid_id,
            "mode": "geo_to_grid",
            "longitude": d1["center_lon"],
            "latitude": d1["center_lat"],
        },
    )
    assert r2.status_code == 200
    assert r2.json()["row_idx"] == 1
    assert r2.json()["col_idx"] == 2

    cells_page = client.get(f"/api/grids/{grid_id}/cells?limit=20").json()["cells"]
    corner_uid = next(c["cell_uid"] for c in cells_page if c["row_idx"] == 0 and c["col_idx"] == 0)

    # Corner cell neighborhood: absorbing vs periodic
    nb_abs = client.post(
        "/api/cellular-automata/neighborhood/inspect",
        json={"grid_id": grid_id, "cell_uid": corner_uid, "neighborhood": "moore_8", "boundary_condition": "absorbing"},
    )
    assert nb_abs.status_code == 200
    assert nb_abs.json()["degree"] == 3
    assert len(nb_abs.json()["boundary_clipped_directions"]) == 5

    nb_per = client.post(
        "/api/cellular-automata/neighborhood/inspect",
        json={"grid_id": grid_id, "cell_uid": corner_uid, "neighborhood": "moore_8", "boundary_condition": "periodic"},
    )
    assert nb_per.status_code == 200
    assert nb_per.json()["degree"] == 8


def test_cellular_automata_lifecycle_and_persistence():
    grid_id = _create_sample_raster_grid()
    cells_res = client.get(f"/api/grids/{grid_id}/cells?limit=100")
    assert cells_res.status_code == 200
    cells = cells_res.json()["cells"]
    seed_cell = next(c for c in cells if c["landcover_category"] == "Tree cover")

    sim_res = client.post(
        "/api/cellular-automata/simulations",
        json={
            "name": "Controlled Educational CA Test",
            "grid_id": grid_id,
            "neighborhood": "moore_8",
            "boundary_condition": "absorbing",
            "seed_cell_uids": [seed_cell["cell_uid"]],
            "base_transition_factor": 0.75,
            "moisture_damping": 0.1,
            "wind_direction": "E",
            "wind_bias": 0.15,
            "burn_duration_steps": 2,
            "max_generations": 10,
            "deterministic_mode": True,
        },
    )
    assert sim_res.status_code == 201, sim_res.text
    detail = sim_res.json()
    sim_id = detail["simulation"]["id"]
    assert detail["simulation"]["data_classification"] == "hypothetical_simulation"
    assert detail["simulation"]["current_generation"] == 0

    step_res = client.post(f"/api/cellular-automata/simulations/{sim_id}/step", json={"steps": 3})
    assert step_res.status_code == 200
    stepped = step_res.json()
    assert stepped["simulation"]["current_generation"] == 3
    assert len(stepped["steps"]) == 4

    # Pause & reset
    pause_res = client.patch(f"/api/cellular-automata/simulations/{sim_id}/status", json={"status": "paused"})
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"

    reset_res = client.post(f"/api/cellular-automata/simulations/{sim_id}/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["simulation"]["current_generation"] == 0
    assert len(reset_res.json()["steps"]) == 1


def test_graph_theory_engine_and_handshaking():
    grid_id = _create_sample_raster_grid()
    g_res = client.post(
        "/api/math/graph-theory/grid-inspect",
        json={"grid_id": grid_id, "neighborhood": "von_neumann_4", "boundary_condition": "absorbing", "patch_rows": 4, "patch_cols": 4},
    )
    assert g_res.status_code == 200
    data = g_res.json()
    assert data["verification"]["handshaking_lemma_holds"] is True
    assert data["result"]["degree_sum"] == 2 * data["result"]["edge_count"]

    iso = client.post(
        "/api/math/graph-theory/isomorphism",
        json={
            "graph_a": {"vertices": ["A", "B", "C", "D"], "edges": [{"u": "A", "v": "B"}, {"u": "B", "v": "C"}, {"u": "C", "v": "D"}, {"u": "D", "v": "A"}]},
            "graph_b": {"vertices": ["1", "2", "3", "4"], "edges": [{"u": "1", "v": "2"}, {"u": "2", "v": "3"}, {"u": "3", "v": "4"}, {"u": "4", "v": "1"}]},
        },
    )
    assert iso.status_code == 200
    assert iso.json()["result"]["is_isomorphic"] is True

    planar = client.post(
        "/api/math/graph-theory/planarity-coloring",
        json={
            "graph": {
                "vertices": ["A", "B", "C", "D"],
                "edges": [{"u": "A", "v": "B"}, {"u": "B", "v": "C"}, {"u": "C", "v": "D"}, {"u": "D", "v": "A"}, {"u": "A", "v": "C"}],
            },
            "compute_chromatic_polynomial": True,
            "compute_dual": True,
        },
    )
    assert planar.status_code == 200
    p_res = planar.json()["result"]
    assert p_res["is_planar"] is True
    assert p_res["euler_formula_holds"] is True
    assert p_res["exact_chromatic_number"] == 3


def test_combinatorics_topics_and_edge_cases():
    # Valid combination
    c = client.post("/api/math/combinatorics/solve", json={"topic": "combinations", "n": 10, "r": 3})
    assert c.status_code == 200
    assert c.json()["result"]["C(n,r)"] == 120

    # Invalid r > n edge case
    bad = client.post("/api/math/combinatorics/solve", json={"topic": "permutations", "n": 3, "r": 5})
    assert bad.status_code == 400

    # Derangements !4 = 9
    der = client.post("/api/math/combinatorics/solve", json={"topic": "derangements", "n": 4})
    assert der.status_code == 200
    assert der.json()["result"]["derangements"] == 9
    assert der.json()["verification"]["ie_matches_recurrence"] is True

    # Rook polynomial of 2x2 full board = 1 + 4x + 2x^2
    rook = client.post("/api/math/combinatorics/solve", json={"topic": "rook_polynomials", "board_matrix": [[1, 1], [1, 1]]})
    assert rook.status_code == 200
    assert rook.json()["result"]["coefficients"] == [1, 4, 2]


def test_safe_logic_parser_and_quantifiers():
    # Tautology (Excluded middle)
    taut = client.post("/api/math/logic/propositional", json={"expression": "P OR NOT P"})
    assert taut.status_code == 200
    assert taut.json()["result"]["classification"] == "tautology"

    # Reject unsafe injection
    bad = client.post("/api/math/logic/propositional", json={"expression": "__import__('os').system('ls')"})
    assert bad.status_code == 400

    # De Morgan verification
    dm = client.post("/api/math/logic/demorgan", json={"variables": ["P", "Q"], "law_form": "negated_conjunction"})
    assert dm.status_code == 200
    assert dm.json()["result"]["holds"] is True

    # Quantifier evaluation
    pred = client.post(
        "/api/math/logic/predicate-quantifier",
        json={
            "quantifier": "forall",
            "predicate_expression": "TreeCover(x) -> Burnable(x)",
            "domain": [
                {"label": "r000_c000", "predicates": {"TreeCover": True, "Burnable": True}},
                {"label": "r000_c005", "predicates": {"TreeCover": False, "Burnable": False}},
            ],
        },
    )
    assert pred.status_code == 200
    assert pred.json()["result"]["holds"] is True


def test_generating_functions_and_recurrences():
    ogf = client.post(
        "/api/math/generating-recurrence/ogf",
        json={"expression": "1 / (1 - x - x^2)", "order": 8, "extract_index": 6},
    )
    assert ogf.status_code == 200
    assert ogf.json()["result"]["extracted_coefficient"] == 13.0

    rec = client.post(
        "/api/math/generating-recurrence/recurrence",
        json={
            "order": 2,
            "c1": 1,
            "c2": 1,
            "initial_a0": 0,
            "initial_a1": 1,
            "non_homogeneous_type": "none",
            "terms_count": 10,
        },
    )
    assert rec.status_code == 200
    assert rec.json()["verification"]["closed_form_matches_iteration"] is True
    assert rec.json()["result"]["terms"][7]["iterative"] == 13.0


def test_trees_and_algorithms():
    huff = client.post(
        "/api/math/trees-algorithms/huffman",
        json={
            "symbols": [
                {"symbol": "A", "frequency": 45},
                {"symbol": "B", "frequency": 13},
                {"symbol": "C", "frequency": 12},
                {"symbol": "D", "frequency": 16},
                {"symbol": "E", "frequency": 9},
                {"symbol": "F", "frequency": 5},
            ]
        },
    )
    assert huff.status_code == 200
    assert huff.json()["verification"]["prefix_free_and_kraft_satisfied"] is True

    mst = client.post(
        "/api/math/trees-algorithms/weighted-graph",
        json={
            "algorithm": "kruskal",
            "vertices": ["A", "B", "C", "D"],
            "edges": [
                {"u": "A", "v": "B", "weight": 1},
                {"u": "B", "v": "C", "weight": 2},
                {"u": "C", "v": "D", "weight": 3},
                {"u": "A", "v": "D", "weight": 10},
                {"u": "A", "v": "C", "weight": 5},
            ],
        },
    )
    assert mst.status_code == 200
    assert mst.json()["result"]["total_weight"] == 6.0

    sort_res = client.post(
        "/api/math/trees-algorithms/sorting",
        json={"algorithm": "merge_sort", "values": [8, 3, 5, 1, 9, 2]},
    )
    assert sort_res.status_code == 200
    assert sort_res.json()["result"]["sorted_values"] == [1, 2, 3, 5, 8, 9]
