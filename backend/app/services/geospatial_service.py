from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.geospatial.raster_processor import clip_raster_to_boundary, reproject_raster
from backend.app.geospatial.vector_processor import (
    clip_vector_to_boundary,
    inspect_vector_dataset,
    reproject_vector,
)
from backend.app.models.entities import Dataset, DatasetMetadata, ProcessingJob, ProcessingLog
from backend.app.schemas.common import FileFormat
from backend.app.services.dataset_service import get_dataset_by_id
from backend.app.services.study_area_service import get_active_study_area
from backend.app.utils.file_storage import get_processed_output_path, validate_shapefile_zip


def reproject_dataset(db: Session, dataset_id: int, target_crs: str) -> Dataset:
    src_ds = get_dataset_by_id(db, dataset_id)
    src_path = Path(src_ds.stored_path)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found on disk.")

    job = ProcessingJob(
        job_type="reproject",
        dataset_id=src_ds.id,
        status="running",
        started_at=datetime.now(timezone.utc),
        parameters_json={"target_crs": target_crs},
    )
    db.add(job)
    db.flush()

    try:
        if src_ds.file_format == FileFormat.GEOTIFF.value:
            dst_path = get_processed_output_path(f"reproj_{src_ds.id}", ".tif")
            meta_dict = reproject_raster(src_path, dst_path, target_crs)
            out_format = FileFormat.GEOTIFF.value
        elif src_ds.file_format in (FileFormat.GEOJSON.value, FileFormat.SHAPEFILE_ZIP.value):
            vec_path = validate_shapefile_zip(src_path) if src_ds.file_format == FileFormat.SHAPEFILE_ZIP.value else src_path
            dst_path = get_processed_output_path(f"reproj_{src_ds.id}", ".geojson")
            meta_dict = reproject_vector(vec_path, dst_path, target_crs)
            out_format = FileFormat.GEOJSON.value
        else:
            raise HTTPException(status_code=400, detail="CRS reprojection requires a GeoTIFF, GeoJSON, or Shapefile dataset.")

        new_ds = Dataset(
            name=f"{src_ds.name} ({target_crs})",
            description=f"Reprojected from dataset #{src_ds.id} to {target_crs}",
            file_format=out_format,
            original_filename=dst_path.name,
            stored_path=str(dst_path),
            file_size_bytes=dst_path.stat().st_size,
            sha256_hash=src_ds.sha256_hash,
            data_source=src_ds.data_source,
            provenance_notes=f"Derived via CRS reprojection from dataset #{src_ds.id} ({src_ds.original_filename})",
            processing_status="validated",
        )
        db.add(new_ds)
        db.flush()
        db.add(DatasetMetadata(dataset_id=new_ds.id, **meta_dict))

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.result_summary_json = {"derived_dataset_id": new_ds.id, "target_crs": target_crs}
        db.add(
            ProcessingLog(
                job_id=job.id,
                dataset_id=new_ds.id,
                level="INFO",
                stage="reproject",
                message=f"Reprojected dataset #{src_ds.id} to {target_crs} -> dataset #{new_ds.id}.",
            )
        )
        db.commit()
        return get_dataset_by_id(db, new_ds.id)
    except HTTPException as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        db.commit()
        raise exc


def clip_dataset_to_study_area(db: Session, dataset_id: int, study_area_id: Optional[int] = None) -> Dataset:
    src_ds = get_dataset_by_id(db, dataset_id)
    area = get_active_study_area(db)
    if not area.geometry_geojson_path or not Path(area.geometry_geojson_path).exists():
        raise HTTPException(
            status_code=400,
            detail="Active study area has no imported boundary geometry. Upload a GeoJSON or Shapefile boundary first.",
        )

    src_path = Path(src_ds.stored_path)
    boundary_path = Path(area.geometry_geojson_path)

    job = ProcessingJob(
        job_type="clip",
        dataset_id=src_ds.id,
        study_area_id=area.id,
        status="running",
        started_at=datetime.now(timezone.utc),
        parameters_json={"study_area_id": area.id},
    )
    db.add(job)
    db.flush()

    try:
        if src_ds.file_format == FileFormat.GEOTIFF.value:
            dst_path = get_processed_output_path(f"clip_{src_ds.id}", ".tif")
            meta_dict = clip_raster_to_boundary(src_path, boundary_path, dst_path)
            out_format = FileFormat.GEOTIFF.value
        elif src_ds.file_format in (FileFormat.GEOJSON.value, FileFormat.SHAPEFILE_ZIP.value):
            vec_path = validate_shapefile_zip(src_path) if src_ds.file_format == FileFormat.SHAPEFILE_ZIP.value else src_path
            dst_path = get_processed_output_path(f"clip_{src_ds.id}", ".geojson")
            meta_dict = clip_vector_to_boundary(vec_path, boundary_path, dst_path)
            out_format = FileFormat.GEOJSON.value
        else:
            raise HTTPException(status_code=400, detail="Boundary clipping requires a GeoTIFF, GeoJSON, or Shapefile dataset.")

        new_ds = Dataset(
            name=f"{src_ds.name} (Clipped)",
            description=f"Clipped to {area.region_label} boundary from dataset #{src_ds.id}",
            file_format=out_format,
            original_filename=dst_path.name,
            stored_path=str(dst_path),
            file_size_bytes=dst_path.stat().st_size,
            sha256_hash=src_ds.sha256_hash,
            data_source=src_ds.data_source,
            provenance_notes=f"Clipped to study area #{area.id} from dataset #{src_ds.id}",
            processing_status="processed",
        )
        db.add(new_ds)
        db.flush()
        db.add(DatasetMetadata(dataset_id=new_ds.id, **meta_dict))

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.result_summary_json = {"derived_dataset_id": new_ds.id, "study_area_id": area.id}
        db.add(
            ProcessingLog(
                job_id=job.id,
                dataset_id=new_ds.id,
                level="INFO",
                stage="clip",
                message=f"Clipped dataset #{src_ds.id} to study-area boundary -> dataset #{new_ds.id}.",
            )
        )
        db.commit()
        return get_dataset_by_id(db, new_ds.id)
    except HTTPException as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        db.commit()
        raise exc


def audit_dataset_geometries(db: Session, dataset_id: int) -> dict:
    ds = get_dataset_by_id(db, dataset_id)
    if ds.file_format not in (FileFormat.GEOJSON.value, FileFormat.SHAPEFILE_ZIP.value):
        raise HTTPException(status_code=400, detail="Geometry audit applies to GeoJSON and Shapefile ZIP datasets.")
    src_path = Path(ds.stored_path)
    vec_path = validate_shapefile_zip(src_path) if ds.file_format == FileFormat.SHAPEFILE_ZIP.value else src_path
    meta = inspect_vector_dataset(vec_path)
    total = meta["feature_count"] or 0
    invalid = meta["invalid_geometry_count"] or 0
    return {
        "dataset_id": ds.id,
        "crs": meta["crs"],
        "feature_count": total,
        "valid_geometry_count": max(0, total - invalid),
        "invalid_geometry_count": invalid,
        "invalid_feature_indices": (meta.get("extra_json") or {}).get("invalid_feature_indices", []),
        "geometry_types": meta.get("geometry_types_json") or [],
        "bounds_wgs84": meta.get("wgs84_bounds_json"),
    }


def list_processing_jobs(db: Session, limit: int = 30) -> list[ProcessingJob]:
    return list(db.execute(select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(limit)).scalars().all())


def list_processing_logs(db: Session, limit: int = 50) -> list[ProcessingLog]:
    return list(db.execute(select(ProcessingLog).order_by(ProcessingLog.created_at.desc()).limit(limit)).scalars().all())
