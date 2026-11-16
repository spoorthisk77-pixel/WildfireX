from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.logging import get_logger
from backend.app.database.base import Base
from backend.app.database.session import engine, SessionLocal
from backend.app.models.entities import StudyArea

logger = get_logger("database.init")


def _ensure_sqlite_columns() -> None:
    """Idempotently add Prompt 3 columns when upgrading an existing SQLite database."""
    migrations = {
        "historical_observations": [
            ("observation_time", "VARCHAR(32)"),
            ("observation_year", "INTEGER"),
            ("observation_month", "INTEGER"),
            ("record_type", "VARCHAR(64) NOT NULL DEFAULT 'satellite_hotspot'"),
            ("is_duplicate", "BOOLEAN NOT NULL DEFAULT 0"),
        ],
        "experiments": [
            ("dataset_id", "INTEGER"),
            ("dataset_version_hash", "VARCHAR(64)"),
            ("results_json", "JSON"),
            ("executed_at", "DATETIME"),
        ],
    }

    with engine.begin() as conn:
        for table_name, columns in migrations.items():
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            }
            for col_name, col_def in columns:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
                    logger.info("Migrated SQLite table %s: added column %s", table_name, col_name)


def init_database() -> None:
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        _ensure_sqlite_columns()

    db: Session = SessionLocal()
    try:
        existing_area = db.execute(select(StudyArea)).scalars().first()
        if not existing_area:
            default_area = StudyArea(
                name="Nagarhole Study Region",
                region_label=settings.default_study_region,
                verification_status="awaiting_boundary_verification",
                source_dataset_id=None,
                crs=None,
                area_sq_km=None,
                bounds_json=None,
                geometry_geojson_path=None,
                vertex_count=None,
                is_active=True,
                notes=(
                    "Initial study region configuration for Nagarhole National Park, Karnataka, India. "
                    "No fabricated polygon is stored; import a verified GeoJSON or Shapefile boundary to clip geospatial layers."
                ),
            )
            db.add(default_area)
            db.commit()
            logger.info("Initialized default study region: %s (awaiting boundary verification)", settings.default_study_region)
    finally:
        db.close()
