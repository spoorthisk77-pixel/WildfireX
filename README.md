# WildfireX

**WildfireX** is an academic and environmental research platform dedicated to studying forest landscapes, historical satellite fire observations, structured cellular grids, discrete mathematics, graph theory, and controlled educational cellular automata.

Initial Geographical Study Region: **Nagarhole National Park, Karnataka, India**.

---

## 1. Scientific & Academic Disclaimer

> WildfireX is an academic and environmental research prototype. Its controlled cellular automata demonstrations are educational and hypothetical. Outputs are not validated operational wildfire predictions and must not be used for emergency-response decisions. Historical satellite hotspot observations are not equivalent to confirmed fire perimeters. Real-world environmental conclusions require verified datasets, field validation and expert assessment.

---

## 2. System Architecture Overview

WildfireX is engineered as a decoupled full-stack application behind a unified Express gateway on port `3000`:

- **Frontend (`src/`)**: React 19, Vite, TypeScript, Tailwind CSS v4, React Router, Three.js (`InstancedMesh` voxel terrain), and Recharts.
- **Backend (`backend/app/`)**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x, ReportLab (PDF synthesis), and SQLite (WAL mode) served on `127.0.0.1:8001`.
- **Geospatial Pipeline (`backend/app/geospatial/`)**: `rasterio`, `geopandas`, `shapely`, and `pyproj` for CRS validation, metric reprojection (`EPSG:32643` UTM Zone 43N for Nagarhole), boundary clipping, DEM/NDVI sampling, and cellular grid lattice construction.
- **Discrete Mathematics & CA Engine (`backend/app/services/`)**: `numpy`, `scipy`, `pandas`, `networkx`, and `sympy` supporting all five syllabus modules (Combinatorics, Mathematical Logic, Generating Functions & Recurrence Relations, Graph Theory, Trees & Algorithms) and deterministic/probabilistic Cellular Automata.
- **Managed Storage (`backend/storage/`)**: Raw GeoTIFF, GeoJSON, Shapefile ZIP, CSV datasets, boundary vectors, and generated PDF/CSV research reports reside in managed server directories; API responses expose only sanitized metadata and SHA-256 provenance hashes (no filesystem paths).

```text
├── server.ts                  # Unified Express + Vite + FastAPI process manager (port 3000)
├── index.html                 # Application HTML entry point
├── package.json               # Frontend scripts & dependencies
├── src/
│   ├── components/            # ErrorBoundary, ConfirmDialog, StateViews
│   ├── layouts/               # AppLayout (18-view sidebar, top bar, disclaimer footer)
│   ├── pages/                 # Overview, Forest Explorer, 3D Terrain, Datasets, GeoLab,
│   │                          # Observations, Cellular Automata, Modules I–V, Scenarios,
│   │                          # Data Quality, Reports & Exports, Syllabus Coverage, Settings
│   ├── services/              # Typed FastAPI client (apiClient.ts)
│   ├── types/                 # TypeScript interfaces aligned with FastAPI schemas
│   └── utils/                 # Navigation registry, ESA WorldCover palette, verbatim disclaimers
└── backend/
    ├── requirements.txt       # Python backend & scientific dependencies
    ├── wildfirex.db           # Auto-created SQLite database with idempotent migrations
    ├── app/
    │   ├── api/routes/        # Modular FastAPI routers (/api/*)
    │   ├── core/              # Settings, logging, canonical scientific disclaimers
    │   ├── database/          # SQLAlchemy engine, WAL pragmas, schema migrations
    │   ├── geospatial/        # Raster, vector, CSV mapping, CRS, landcover, grid engine
    │   ├── models/            # SQLAlchemy ORM models
    │   ├── schemas/           # Pydantic request/response contracts
    │   └── services/          # Pipeline, math modules, observations, data quality, reports, syllabus
    ├── storage/               # Managed directories (uploads, processed, boundaries, exports)
    └── tests/                 # Pytest unit, mathematical, and E2E integration suites
```

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Three.js, Recharts, Lucide Icons |
| **Backend API** | Python 3.11, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2.x, SQLite |
| **Geospatial** | Rasterio, GeoPandas, Shapely, PyProj |
| **Scientific / Math** | NumPy, SciPy, Pandas, NetworkX, SymPy |
| **Reporting & Tests** | ReportLab, Pytest, HTTPX, ESLint, TypeScript |

---

## 4. Prerequisites

- **Python 3.11+** (with `pip` and `venv`)
- **Node.js 20+** and **npm 10+**
- On **Windows**, Visual C++ Redistributable / wheels are automatically provided by `pip` for `rasterio`, `shapely`, `pyproj`, and `numpy` on Python 3.11 64-bit.

---

## 5. Setup & Execution — Windows (PowerShell / CMD)

### A. Windows PowerShell

```powershell
# 1. Clone or open the WildfireX root directory
cd C:\path\to\wildfirex

# 2. Create and activate the Python virtual environment inside backend\.venv
py -3.11 -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1

# 3. Upgrade pip and install Python backend dependencies
python -m pip install --upgrade pip
pip install -r backend\requirements.txt

# 4. Install Node.js frontend dependencies
npm install

# 5. Launch the unified development server (Frontend + FastAPI backend on http://localhost:3000)
npm run dev
```

*(If PowerShell blocks script activation, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `backend\.venv\Scripts\python.exe` directly.)*

### B. Windows Command Prompt (`cmd.exe`)

```cmd
cd C:\path\to\wildfirex
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
npm install
npm run dev
```

### C. Standalone Windows Terminals (Optional)

Terminal 1 — FastAPI Backend:
```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --reload
```

Terminal 2 — Vite Frontend Dev Server:
```powershell
npm run dev:vite
```

---

## 6. Setup & Execution — Linux / macOS

```bash
# 1. Python virtual environment
python3.11 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

# 2. Node dependencies
npm install

# 3. Unified server (Frontend on :3000, FastAPI proxied from :8001)
npm run dev
```

---

## 7. SQLite Database Initialization

No manual SQL script is required. On application startup, `backend/app/database/init_db.py`:
1. Initializes `backend/wildfirex.db` in SQLite WAL mode with foreign keys enabled.
2. Creates all ORM tables (`study_areas`, `datasets`, `dataset_metadata`, `processed_grids`, `grid_cells`, `historical_observations`, `processing_jobs`, `processing_logs`, `experiments`, `experiment_configurations`, `simulation_runs`, `simulation_steps`, `reports`).
3. Runs idempotent column migrations (`PRAGMA table_info` checks) safely if upgrading an existing database.
4. Seeds the initial `Nagarhole National Park` study area record with status `awaiting_boundary_verification` (never inventing fake geometry).

---

## 8. Obtaining Real Geospatial Datasets for Nagarhole National Park

WildfireX does **not** ship fabricated sample fire records or synthetic boundaries. Obtain authentic open datasets from official portals:

1. **ESA WorldCover 2021 v200 (10m Land Cover GeoTIFF)**:
   - Portal: `https://esa-worldcover.org` or AWS Open Data (`esa-worldcover` S3 bucket, tile `N09E075` / `N12E075`).
   - Region bounding reference: Nagarhole sits around `11.83°N – 12.26°N`, `76.00°E – 76.39°E`.
2. **NASA FIRMS Historical Fire Hotspots (CSV / Shapefile)**:
   - Portal: `https://firms.modaps.eosdis.nasa.gov/download/` or FIRMS Country Archive (India).
   - Download MODIS C6.1 or VIIRS S-NPP / NOAA-20 CSV archives (`latitude`, `longitude`, `acq_date`, `acq_time`, `bright_ti4` / `brightness`, `frp`, `confidence`, `satellite`, `instrument`).
3. **Copernicus Sentinel-2 Level-2A (Vegetation / Bands)**:
   - Portal: Copernicus Browser (`https://browser.dataspace.copernicus.eu/`) for GeoTIFF exports containing Red + NIR bands.
4. **SRTM 30m Digital Elevation Model (DEM GeoTIFF)**:
   - Portal: USGS EarthExplorer (`https://earthexplorer.usgs.gov/`) or OpenTopography (`SRTM GL1`).
5. **Nagarhole National Park Boundary Vector (GeoJSON / Shapefile ZIP)**:
   - Official protected-area boundaries via Protected Planet (WDPA) or Karnataka Forest Department open GIS portals.

---

## 9. Core Research Workflows

1. **Dataset Import & Column Mapping (`/datasets`)**:
   - Upload GeoTIFF, GeoJSON, Shapefile `.zip` (validated for `.shp`, `.shx`, `.dbf`, `.prj`), or CSV files.
   - For NASA FIRMS CSV files, map `latitude`, `longitude`, `acq_date`, `acq_time`, `frp`, `confidence`, `satellite`, `instrument`, and optional `record_type` (`satellite_hotspot` vs `confirmed_incident`), then click **Apply Column Mapping**. Invalid coordinates and duplicate records are flagged transparently without silent deletion.
2. **Geospatial Laboratory & Grid Generation (`/geospatial`)**:
   - Optionally import a verified study-area boundary, inspect CRS & geometry validity, reproject datasets to `EPSG:32643` (UTM Zone 43N), clip to boundary, and generate structured cellular grids (`G = (V, E)`) with optional SRTM elevation attachment.
3. **2D Forest Explorer & 3D Voxel Terrain (`/forest-explorer`, `/landscape-3d`)**:
   - Inspect individual cells, search by `cell_uid` or `(row, col)`, toggle DEM elevation shading and overlaid hotspot markers, inspect Moore/Von Neumann boundary stencils, and navigate the Three.js instanced 3D terrain.
4. **Historical Observations (`/observations`)**:
   - Filter thermal hotspots vs confirmed incidents by dataset, year, month, satellite, confidence, or spatial bounding box / study boundary; inspect yearly & monthly temporal charts; export filtered CSV/JSON.
5. **Controlled Cellular Automata & Discrete Math Modules I–V (`/cellular-automata`, `/combinatorics`, `/mathematical-logic`, `/generating-functions`, `/recurrence-relations`, `/graph-theory`, `/trees-algorithms`)**:
   - Execute deterministic or stochastic hypothetical CA demonstrations step-by-step and run symbolic/computational discrete mathematics solvers with full step-by-step derivations.
6. **Data Quality, Scenario Comparison & Research Reports (`/data-quality`, `/scenario-comparison`, `/reports`, `/syllabus-coverage`)**:
   - Audit NoData %, invalid/duplicate counts, and missing attributes (strictly zero imputation); compare hypothetical simulation runs side-by-side and manage reproducible experiments; generate persistent **15-section PDF and CSV Research Reports**; verify full coverage of Discrete Mathematics Modules I–V.

---

## 10. Running Tests & Validation

```bash
# Backend Pytest Suite (unit, math, CA, and full Prompt 3 E2E suite)
backend/.venv/bin/pytest -v

# On Windows PowerShell:
.\backend\.venv\Scripts\pytest.exe -v

# Frontend TypeScript & ESLint check
npm run lint

# Frontend production Vite build check
npm run build
```

---

## 11. Troubleshooting

- **Backend fails to start on Windows / `rasterio` DLL error**: Confirm you installed 64-bit Python 3.11 from `python.org` and created `backend/.venv` with `py -3.11 -m venv backend\.venv`.
- **Port `3000` or `8001` already in use**: Stop conflicting dev servers or check `Get-NetTCPConnection -LocalPort 3000,8001` (Windows) / `lsof -i :3000,8001` (Linux/macOS).
- **Large GeoTIFF upload rejected**: Default upload cap is `250 MB` (`WILDFIREX_MAX_UPLOAD_MB` environment variable). Clip oversized country tiles in QGIS to the Nagarhole bounding box prior to import.
- **CSV observations not appearing in `/observations`**: Ensure you clicked **Apply Column Mapping** with Interpretation Mode set to `Historical Wildfire Observations (FIRMS)` in `/datasets`.

---

## 12. Known Limitations

- Controlled cellular automata rules are simplified academic transition models rather than physical Rothermel/CFD wildfire behavior simulators.
- High-resolution rasters are sampled onto bounded structured grids (up to `max_dimension` per axis) to keep SQLite queries, NetworkX graphs, and WebGL `InstancedMesh` rendering responsive.
- Missing attributes such as elevation (without an attached SRTM DEM) or vegetation index (without Red+NIR bands) remain `null` (`Unavailable`) and are never fabricated.
