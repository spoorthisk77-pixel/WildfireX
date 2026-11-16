import json
from pathlib import Path
from typing import Optional
from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.geospatial.vector_processor import extract_boundary_geojson
from backend.app.models.entities import Dataset, DatasetMetadata, ProcessingJob, ProcessingLog, StudyArea
from backend.app.schemas.common import DataSource, FileFormat
from backend.app.utils.file_storage import (
    detect_file_format,
    get_boundary_output_path,
    save_upload_file,
    validate_shapefile_zip,
)


def list_study_areas(db: Session) -> list[StudyArea]:
    return list(db.execute(select(StudyArea).order_by(StudyArea.created_at.desc())).scalars().all())


def get_active_study_area(db: Session) -> StudyArea:
    area = db.execute(select(StudyArea).where(StudyArea.is_active.is_(True))).scalars().first()
    if not area:
        area = db.execute(select(StudyArea)).scalars().first()
    if not area:
        raise HTTPException(status_code=404, detail="No study area record initialized.")
    return area


def get_study_area_geojson(area: StudyArea) -> Optional[dict]:
    if not area.geometry_geojson_path:
        return None
    p = Path(area.geometry_geojson_path)
    if not p.exists():
        return None
    return json.loads(p.read_text())


async def import_study_area_boundary(
    db: Session,
    file: UploadFile,
    name: str,
    region_label: str,
    notes: Optional[str] = None,
    mark_verified: bool = False,
) -> StudyArea:
    fmt = detect_file_format(file.filename or "")
    if fmt not in (FileFormat.GEOJSON, FileFormat.SHAPEFILE_ZIP):
        raise HTTPException(
            status_code=400,
            detail="Study-area boundary must be uploaded as GeoJSON (.geojson/.json) or Shapefile ZIP (.zip).",
        )

    dest_path, size_bytes, sha256 = await save_upload_file(file)
    vector_path = validate_shapefile_zip(dest_path) if fmt == FileFormat.SHAPEFILE_ZIP else dest_path
    out_geojson_path = get_boundary_output_path("study_boundary")

    extracted = extract_boundary_geojson(vector_path, out_geojson_path)

    # Register boundary file in Datasets for full provenance
    dataset = Dataset(
        name=f"{name} (Boundary)",
        description=notes or "Imported study-area boundary geometry",
        file_format=fmt.value,
        original_filename=file.filename or dest_path.name,
        stored_path=str(dest_path),
        file_size_bytes=size_bytes,
        sha256_hash=sha256,
        data_source=DataSource.CUSTOM_BOUNDARY.value,
        processing_status="validated",
    )
    db.add(dataset)
    db.flush()

    meta = DatasetMetadata(
        dataset_id=dataset.id,
        crs=extracted["crs"],
        bounds_json=extracted["bounds_json"],
        wgs84_bounds_json=extracted["bounds_json"],
        geometry_types_json=["Polygon"],
        feature_count=extracted["feature_count"],
        invalid_geometry_count=0,
    )
    db.add(meta)

    # Update active study area
    area = get_active_study_area(db)
    area.name = name
    area.region_label = region_label
    area.source_dataset_id = dataset.id
    area.crs = extracted["crs"]
    area.area_sq_km = extracted["area_sq_km"]
    area.bounds_json = extracted["bounds_json"]
    area.geometry_geojson_path = str(out_geojson_path)
    area.vertex_count = extracted["vertex_count"]
    area.verification_status = "verified_boundary" if mark_verified else "boundary_imported_unverified"
    if notes:
        area.notes = notes

    job = ProcessingJob(
        job_type="boundary_import",
        dataset_id=dataset.id,
        study_area_id=area.id,
        status="completed",
        result_summary_json={
            "area_sq_km": extracted["area_sq_km"],
            "vertex_count": extracted["vertex_count"],
            "verification_status": area.verification_status,
        },
    )
    db.add(job)
    db.add(
        ProcessingLog(
            dataset_id=dataset.id,
            level="INFO",
            stage="boundary_import",
            message=f"Imported study-area boundary for '{region_label}' ({extracted['area_sq_km']} sq km).",
        )
    )
    db.commit()
    db.refresh(area)
    return area


def update_study_area_verification(db: Session, study_area_id: int, verification_status: str, notes: Optional[str]) -> StudyArea:
    area = db.execute(select(StudyArea).where(StudyArea.id == study_area_id)).scalar_one_or_none()
    if not area:
        raise HTTPException(status_code=404, detail="Study area not found.")
    allowed = {"awaiting_boundary_verification", "boundary_imported_unverified", "verified_boundary"}
    if verification_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid verification status. Must be one of: {', '.join(sorted(allowed))}")
    if verification_status == "verified_boundary" and not area.geometry_geojson_path:
        raise HTTPException(
            status_code=400,
            detail="Cannot mark study area as verified without an imported boundary geometry.",
        )
    area.verification_status = verification_status
    if notes is not None:
        area.notes = notes
    db.commit()
    db.refresh(area)
    return area
