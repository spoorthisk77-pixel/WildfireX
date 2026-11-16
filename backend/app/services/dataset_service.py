from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import pandas as pd
from fastapi import HTTPException, UploadFile
from pyproj import Transformer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.logging import get_logger
from backend.app.geospatial.csv_processor import (
    format_acq_time,
    inspect_csv_metadata,
    parse_observation_date,
    validate_csv_mapping,
)
from backend.app.geospatial.raster_processor import inspect_raster_metadata
from backend.app.geospatial.vector_processor import inspect_vector_dataset
from backend.app.models.entities import (
    Dataset,
    DatasetMetadata,
    HistoricalObservation,
    ProcessingJob,
    ProcessingLog,
)
from backend.app.schemas.common import DataSource, FileFormat
from backend.app.schemas.dataset import CsvColumnMappingRequest
from backend.app.utils.file_storage import (
    delete_stored_file,
    detect_file_format,
    save_upload_file,
    validate_shapefile_zip,
)

logger = get_logger("services.dataset")


def _log_event(
    db: Session,
    stage: str,
    message: str,
    level: str = "INFO",
    dataset_id: Optional[int] = None,
    job_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    log = ProcessingLog(
        dataset_id=dataset_id,
        job_id=job_id,
        level=level,
        stage=stage,
        message=message,
        details_json=details,
    )
    db.add(log)


async def ingest_uploaded_dataset(
    db: Session,
    file: UploadFile,
    name: str,
    data_source: str = DataSource.OTHER.value,
    description: Optional[str] = None,
    provenance_notes: Optional[str] = None,
    license_or_citation: Optional[str] = None,
    acquisition_date: Optional[str] = None,
) -> Dataset:
    file_format = detect_file_format(file.filename or "")
    dest_path, size_bytes, sha256 = await save_upload_file(file)

    job = ProcessingJob(
        job_type="ingest",
        status="running",
        started_at=datetime.now(timezone.utc),
        parameters_json={"filename": file.filename, "format": file_format.value, "data_source": data_source},
    )

    dataset = Dataset(
        name=name.strip() or (file.filename or "Untitled Dataset"),
        description=description,
        file_format=file_format.value,
        original_filename=file.filename or dest_path.name,
        stored_path=str(dest_path),
        file_size_bytes=size_bytes,
        sha256_hash=sha256,
        data_source=data_source,
        provenance_notes=provenance_notes,
        license_or_citation=license_or_citation,
        acquisition_date=acquisition_date,
        processing_status="uploaded",
    )

    db.add(dataset)
    db.flush()
    job.dataset_id = dataset.id
    db.add(job)
    db.flush()

    try:
        meta_dict: dict = {}
        if file_format == FileFormat.GEOTIFF:
            meta_dict = inspect_raster_metadata(dest_path)
            dataset.processing_status = "validated"
        elif file_format == FileFormat.GEOJSON:
            meta_dict = inspect_vector_dataset(dest_path)
            dataset.processing_status = "validated"
        elif file_format == FileFormat.SHAPEFILE_ZIP:
            shp_path = validate_shapefile_zip(dest_path)
            meta_dict = inspect_vector_dataset(shp_path)
            dataset.processing_status = "validated"
        elif file_format == FileFormat.CSV:
            meta_dict = inspect_csv_metadata(dest_path)
            dataset.processing_status = "uploaded"  # Awaiting explicit column mapping

        meta = DatasetMetadata(dataset_id=dataset.id, **meta_dict)
        db.add(meta)

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.result_summary_json = {
            "file_format": file_format.value,
            "processing_status": dataset.processing_status,
            "crs": meta_dict.get("crs"),
            "feature_count": meta_dict.get("feature_count"),
        }
        _log_event(
            db,
            stage="ingest",
            message=f"Dataset '{dataset.name}' ({file_format.value}) validated and registered.",
            dataset_id=dataset.id,
            job_id=job.id,
        )
        db.commit()
    except HTTPException as exc:
        db.rollback()
        delete_stored_file(str(dest_path))
        raise exc
    except Exception as exc:
        db.rollback()
        delete_stored_file(str(dest_path))
        logger.exception("Dataset ingestion failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Dataset validation failed: {exc}") from exc

    return get_dataset_by_id(db, dataset.id)


def list_datasets(db: Session) -> list[Dataset]:
    stmt = (
        select(Dataset)
        .options(selectinload(Dataset.metadata_record))
        .order_by(Dataset.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_dataset_by_id(db: Session, dataset_id: int) -> Dataset:
    stmt = (
        select(Dataset)
        .options(selectinload(Dataset.metadata_record))
        .where(Dataset.id == dataset_id)
    )
    dataset = db.execute(stmt).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found.")
    return dataset


def _classify_record_type(raw_value: Optional[str]) -> str:
    if not raw_value:
        return "satellite_hotspot"
    low = raw_value.strip().lower()
    if "confirmed" in low or "ground" in low or "verified_fire" in low or low == "incident":
        return "confirmed_incident"
    return "satellite_hotspot"


def apply_csv_mapping(db: Session, dataset_id: int, mapping: CsvColumnMappingRequest) -> Dataset:
    dataset = get_dataset_by_id(db, dataset_id)
    if dataset.file_format != FileFormat.CSV.value:
        raise HTTPException(status_code=400, detail="Column mapping is only applicable to CSV datasets.")

    csv_path = Path(dataset.stored_path)
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Stored CSV file missing on disk.")

    validation = validate_csv_mapping(csv_path, mapping)

    if dataset.metadata_record is None:
        dataset.metadata_record = DatasetMetadata(dataset_id=dataset.id)

    dataset.metadata_record.csv_mapping_json = validation["mapping"]
    dataset.metadata_record.crs = mapping.crs
    dataset.metadata_record.bounds_json = validation["bounds"]
    dataset.metadata_record.wgs84_bounds_json = validation["bounds"] if mapping.crs.upper() == "EPSG:4326" else None
    dataset.processing_status = "mapped"
    dataset.error_message = None

    extra = dict(dataset.metadata_record.extra_json or {})
    extra["total_rows"] = validation["total_rows"]
    extra["valid_coordinate_rows"] = validation["valid_coordinate_rows"]
    extra["invalid_coordinate_rows"] = validation["invalid_coordinate_rows"]

    ingested_obs = 0
    invalid_rows = 0
    duplicate_rows = 0
    unparsed_date_rows = 0

    if mapping.interpret_as == "historical_observations":
        db.query(HistoricalObservation).filter(HistoricalObservation.source_dataset_id == dataset.id).delete()
        df = pd.read_csv(csv_path)
        lat_col = mapping.latitude_column
        lon_col = mapping.longitude_column

        transformer = None
        if mapping.crs.upper() not in {"EPSG:4326", "WGS84", "CRS84"}:
            try:
                transformer = Transformer.from_crs(mapping.crs, "EPSG:4326", always_xy=True)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid CRS '{mapping.crs}': {exc}") from exc

        seen_keys: set[tuple] = set()
        sat_col = mapping.satellite_column or ("satellite" if "satellite" in df.columns else None)
        inst_col = mapping.instrument_column or ("instrument" if "instrument" in df.columns else None)
        time_col = mapping.time_column or ("acq_time" if "acq_time" in df.columns else None)

        for _, row in df.iterrows():
            try:
                raw_y = float(row[lat_col])
                raw_x = float(row[lon_col])
            except (TypeError, ValueError):
                invalid_rows += 1
                continue

            if pd.isna(raw_y) or pd.isna(raw_x):
                invalid_rows += 1
                continue

            if transformer is not None:
                lon, lat = transformer.transform(raw_x, raw_y)
            else:
                lat, lon = raw_y, raw_x

            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                invalid_rows += 1
                continue

            obs_date: Optional[str] = None
            obs_year: Optional[int] = None
            obs_month: Optional[int] = None
            if mapping.date_column:
                obs_date, obs_year, obs_month = parse_observation_date(row.get(mapping.date_column))
                if pd.notna(row.get(mapping.date_column)) and obs_date is None:
                    unparsed_date_rows += 1

            obs_time = format_acq_time(row.get(time_col)) if time_col else None

            brightness = None
            if mapping.brightness_column and pd.notna(row.get(mapping.brightness_column)):
                try:
                    brightness = float(row[mapping.brightness_column])
                except (TypeError, ValueError):
                    brightness = None

            frp = None
            if mapping.frp_column and pd.notna(row.get(mapping.frp_column)):
                try:
                    frp = float(row[mapping.frp_column])
                except (TypeError, ValueError):
                    frp = None

            confidence = (
                str(row[mapping.confidence_column]).strip()
                if mapping.confidence_column and pd.notna(row.get(mapping.confidence_column))
                else None
            )
            satellite = (
                str(row[sat_col]).strip()
                if sat_col and pd.notna(row.get(sat_col))
                else None
            )
            instrument = (
                str(row[inst_col]).strip()
                if inst_col and pd.notna(row.get(inst_col))
                else None
            )
            daynight = (
                str(row["daynight"]).strip()
                if "daynight" in df.columns and pd.notna(row.get("daynight"))
                else None
            )
            rec_type = (
                _classify_record_type(str(row[mapping.record_type_column]))
                if mapping.record_type_column and pd.notna(row.get(mapping.record_type_column))
                else "satellite_hotspot"
            )

            dedup_key = (
                round(lat, 5),
                round(lon, 5),
                obs_date or "",
                obs_time or "",
                satellite or "",
                instrument or "",
            )
            is_dup = dedup_key in seen_keys
            if is_dup:
                duplicate_rows += 1
            else:
                seen_keys.add(dedup_key)

            obs = HistoricalObservation(
                source_dataset_id=dataset.id,
                observation_date=obs_date,
                observation_time=obs_time,
                observation_year=obs_year,
                observation_month=obs_month,
                record_type=rec_type,
                is_duplicate=is_dup,
                latitude=lat,
                longitude=lon,
                brightness=brightness,
                frp=frp,
                confidence=confidence,
                satellite=satellite,
                instrument=instrument,
                daynight=daynight,
                geometry_wkt=f"POINT ({lon} {lat})",
            )
            db.add(obs)
            ingested_obs += 1

        dataset.processing_status = "processed"
        extra["observations_ingested"] = ingested_obs
        extra["unique_observations"] = ingested_obs - duplicate_rows
        extra["duplicate_rows_detected"] = duplicate_rows
        extra["invalid_rows_skipped"] = invalid_rows
        extra["unparsed_date_rows"] = unparsed_date_rows
        extra["csv_requires_mapping"] = False

    dataset.metadata_record.extra_json = extra

    _log_event(
        db,
        stage="csv_mapping",
        message=(
            f"Applied CSV mapping ({mapping.interpret_as}) to dataset '{dataset.name}': "
            f"{ingested_obs} ingested, {duplicate_rows} duplicates flagged, {invalid_rows} invalid skipped."
        ),
        dataset_id=dataset.id,
        details={
            "valid_rows": validation["valid_coordinate_rows"],
            "observations_ingested": ingested_obs,
            "duplicate_rows": duplicate_rows,
            "invalid_rows": invalid_rows,
            "unparsed_date_rows": unparsed_date_rows,
        },
    )
    db.commit()
    return get_dataset_by_id(db, dataset.id)


def delete_dataset(db: Session, dataset_id: int) -> dict:
    dataset = get_dataset_by_id(db, dataset_id)
    stored_path = dataset.stored_path
    name = dataset.name
    db.delete(dataset)
    db.commit()
    delete_stored_file(stored_path)
    return {"deleted": True, "id": dataset_id, "name": name}
