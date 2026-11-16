from pathlib import Path
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parents[2]
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
PROCESSED_DIR = STORAGE_DIR / "processed"
BOUNDARIES_DIR = STORAGE_DIR / "boundaries"
EXPORTS_DIR = STORAGE_DIR / "exports"
DATABASE_PATH = BASE_DIR / "wildfirex.db"


class Settings(BaseSettings):
    app_name: str = "WildfireX Geospatial & Simulation API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    database_url: str = f"sqlite:///{DATABASE_PATH}"
    default_study_region: str = "Nagarhole National Park, Karnataka, India"
    max_upload_size_mb: int = 250
    max_grid_cells: int = 16000
    target_metric_crs: str = "EPSG:32643"  # UTM Zone 43N covering Karnataka / Nagarhole

    model_config = {
        "env_prefix": "WILDFIREX_",
        "extra": "ignore",
    }


settings = Settings()

for directory in (STORAGE_DIR, UPLOADS_DIR, PROCESSED_DIR, BOUNDARIES_DIR, EXPORTS_DIR):
    directory.mkdir(parents=True, exist_ok=True)
