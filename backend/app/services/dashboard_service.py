from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.entities import (
    Dataset,
    Experiment,
    GridCell,
    HistoricalObservation,
    ProcessedGrid,
    ProcessingJob,
)
from backend.app.schemas.common import DataSource
from backend.app.schemas.dashboard import DashboardStatsResponse, RecentActivityItem, SourceAvailabilityItem
from backend.app.services.study_area_service import get_active_study_area

SOURCE_CATALOG = [
    {
        "key": DataSource.ESA_WORLDCOVER.value,
        "label": "ESA WorldCover 2021 v200",
        "description": "10-metre global land-cover GeoTIFF (tree cover, shrubland, grassland, cropland, water).",
        "how_to_obtain": "Download 3x3 degree 10m tiles covering 76.0E-76.5E, 11.8N-12.3N from esa-worldcover.org or Copernicus Open Access Hub and upload as GeoTIFF.",
    },
    {
        "key": DataSource.NASA_FIRMS.value,
        "label": "NASA FIRMS (MODIS / VIIRS)",
        "description": "Historical active fire hotspots and Fire Radiative Power (FRP) CSV/Shapefile archives.",
        "how_to_obtain": "Request a free archive download for India / Karnataka via firms.modaps.eosdis.nasa.gov/download/ and upload CSV or Shapefile ZIP.",
    },
    {
        "key": DataSource.SENTINEL2_L2A.value,
        "label": "Copernicus Sentinel-2 Level-2A",
        "description": "Bottom-of-atmosphere multispectral imagery supporting NDVI and fuel moisture indices.",
        "how_to_obtain": "Export clipped multispectral bands (B4 Red, B8 NIR) as GeoTIFF from Copernicus Browser (dataspace.copernicus.eu).",
    },
    {
        "key": DataSource.SRTM.value,
        "label": "SRTM Digital Elevation Model",
        "description": "30-metre Shuttle Radar Topography Mission elevation raster for slope and aspect modeling.",
        "how_to_obtain": "Download 1-arc-second GeoTIFF tiles (N11E076 / N12E076) from USGS EarthExplorer or OpenTopography.",
    },
]


def build_dashboard_stats(db: Session) -> DashboardStatsResponse:
    study_area = get_active_study_area(db)

    dataset_count = db.execute(select(func.count(Dataset.id))).scalar_one() or 0
    error_datasets = db.execute(select(func.count(Dataset.id)).where(Dataset.processing_status == "error")).scalar_one() or 0
    processed_grid_count = db.execute(select(func.count(ProcessedGrid.id))).scalar_one() or 0
    processed_cell_count = db.execute(select(func.count(GridCell.id))).scalar_one() or 0
    valid_cell_count = (
        db.execute(select(func.count(GridCell.id)).where(GridCell.quality_status == "valid")).scalar_one() or 0
    )
    obs_count = db.execute(select(func.count(HistoricalObservation.id))).scalar_one() or 0
    exp_count = db.execute(select(func.count(Experiment.id))).scalar_one() or 0

    recent_jobs = list(
        db.execute(select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(6)).scalars().all()
    )
    recent_activities = [
        RecentActivityItem(
            id=j.id,
            job_type=j.job_type,
            status=j.status,
            dataset_id=j.dataset_id,
            created_at=j.created_at,
            completed_at=j.completed_at,
            error_message=j.error_message,
        )
        for j in recent_jobs
    ]
    last_activity = recent_activities[0] if recent_activities else None

    recent_exp_rows = list(
        db.execute(select(Experiment).order_by(Experiment.created_at.desc()).limit(5)).scalars().all()
    )
    recent_experiments = [
        {
            "id": e.id,
            "name": e.name,
            "module_type": e.module_type,
            "status": e.status,
            "grid_id": e.grid_id,
            "created_at": e.created_at.isoformat(),
        }
        for e in recent_exp_rows
    ]

    if dataset_count == 0:
        quality_status = "No datasets imported"
    elif error_datasets > 0:
        quality_status = f"Attention required ({error_datasets} dataset error)"
    elif processed_cell_count == 0:
        quality_status = "Datasets validated; awaiting grid generation"
    else:
        valid_pct = round((valid_cell_count / processed_cell_count) * 100, 1) if processed_cell_count else 0.0
        quality_status = f"Nominal ({valid_pct}% valid cells)"

    source_availability: list[SourceAvailabilityItem] = []
    for item in SOURCE_CATALOG:
        matching = list(
            db.execute(
                select(Dataset)
                .where(Dataset.data_source == item["key"])
                .order_by(Dataset.created_at.desc())
            )
            .scalars()
            .all()
        )
        source_availability.append(
            SourceAvailabilityItem(
                source_key=item["key"],
                label=item["label"],
                description=item["description"],
                status="imported" if matching else "unavailable",
                dataset_count=len(matching),
                latest_dataset_name=matching[0].name if matching else None,
                how_to_obtain=item["how_to_obtain"],
            )
        )

    return DashboardStatsResponse(
        project_title="WildfireX",
        study_region=study_area.region_label or settings.default_study_region,
        study_area_status=study_area.verification_status,
        study_area_sq_km=study_area.area_sq_km,
        dataset_count=dataset_count,
        processed_grid_count=processed_grid_count,
        processed_cell_count=processed_cell_count,
        valid_cell_count=valid_cell_count,
        historical_observation_count=obs_count,
        experiment_count=exp_count,
        data_quality_status=quality_status,
        last_processing_activity=last_activity,
        recent_activities=recent_activities,
        recent_experiments=recent_experiments,
        source_availability=source_availability,
        system_status={
            "api_online": True,
            "database_engine": "SQLite (WAL)",
            "geospatial_engine": "Rasterio + GeoPandas + PyProj + Shapely",
            "target_metric_crs": settings.target_metric_crs,
        },
    )
