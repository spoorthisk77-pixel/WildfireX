from typing import Any
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.core.constants import SCIENTIFIC_DISCLAIMER
from backend.app.models.entities import (
    Dataset,
    GridCell,
    ProcessedGrid,
    ProcessingJob,
    ProcessingLog,
)


def build_data_quality_report(db: Session) -> dict[str, Any]:
    datasets = list(
        db.execute(
            select(Dataset)
            .options(selectinload(Dataset.metadata_record))
            .order_by(Dataset.created_at.desc())
        )
        .scalars()
        .all()
    )
    grids = list(
        db.execute(select(ProcessedGrid).order_by(ProcessedGrid.created_at.desc())).scalars().all()
    )
    jobs = list(
        db.execute(select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(40)).scalars().all()
    )
    logs = list(
        db.execute(select(ProcessingLog).order_by(ProcessingLog.created_at.desc()).limit(60)).scalars().all()
    )

    dataset_audits = []
    for ds in datasets:
        meta = ds.metadata_record
        extra = (meta.extra_json if meta else None) or {}
        warnings: list[str] = []
        missing_attrs: list[str] = []

        if not meta or not meta.crs:
            warnings.append("CRS is undefined or pending explicit spatial mapping.")
        if ds.file_format == "csv" and ds.processing_status == "uploaded":
            warnings.append("CSV column mapping has not yet been applied.")
        if meta and (meta.invalid_geometry_count or 0) > 0:
            warnings.append(f"{meta.invalid_geometry_count} invalid vector geometries detected during validation.")

        invalid_count = int(extra.get("invalid_rows_skipped", 0) or 0) + int(
            extra.get("invalid_coordinate_rows", 0) or 0
        )
        dup_count = int(extra.get("duplicate_rows_detected", 0) or 0)
        if invalid_count > 0:
            warnings.append(f"{invalid_count} invalid or out-of-range coordinate row(s) flagged/skipped (never fabricated).")
        if dup_count > 0:
            warnings.append(f"{dup_count} duplicate observation row(s) detected and flagged.")
        if not ds.acquisition_date:
            missing_attrs.append("acquisition_date")
        if not ds.license_or_citation:
            missing_attrs.append("license_or_citation")

        nodata_pct = None
        if meta and ds.file_format == "geotiff":
            band_stats = extra.get("band_stats") or []
            if band_stats and isinstance(band_stats, list) and "valid_sample_ratio" in band_stats[0]:
                nodata_pct = round((1.0 - float(band_stats[0]["valid_sample_ratio"])) * 100.0, 2)

        dataset_audits.append({
            "dataset_id": ds.id,
            "name": ds.name,
            "original_filename": ds.original_filename,
            "file_format": ds.file_format,
            "data_source": ds.data_source,
            "sha256_hash": ds.sha256_hash,
            "acquisition_date": ds.acquisition_date or "Not specified",
            "processing_status": ds.processing_status,
            "processing_date": ds.updated_at.isoformat(),
            "crs": meta.crs if meta else None,
            "spatial_resolution": (
                f"{meta.resolution_x:.6g} x {meta.resolution_y:.6g}"
                if meta and meta.resolution_x is not None and meta.resolution_y is not None
                else None
            ),
            "nodata_percentage": nodata_pct,
            "invalid_record_count": invalid_count + int((meta.invalid_geometry_count or 0) if meta else 0),
            "duplicate_record_count": dup_count,
            "missing_attributes": missing_attrs,
            "validation_warnings": warnings,
        })

    ds_name_map = {d.id: d.name for d in datasets}
    grid_audits = []
    for g in grids:
        nodata_pct = round((g.nodata_cell_count / g.cell_count) * 100.0, 2) if g.cell_count else 0.0
        elev_present = (
            db.execute(
                select(func.count(GridCell.id)).where(
                    GridCell.grid_id == g.id,
                    GridCell.elevation_m.is_not(None),
                )
            ).scalar_one()
            or 0
        )
        ndvi_present = (
            db.execute(
                select(func.count(GridCell.id)).where(
                    GridCell.grid_id == g.id,
                    GridCell.vegetation_index.is_not(None),
                )
            ).scalar_one()
            or 0
        )
        missing_grid_attrs = []
        if elev_present == 0:
            missing_grid_attrs.append("elevation_m (No DEM attached; left null without imputation)")
        if ndvi_present == 0:
            missing_grid_attrs.append("vegetation_index (No Sentinel-2 Red/NIR NDVI attached; left null)")

        grid_warnings = []
        if not g.clipped_to_boundary:
            grid_warnings.append("Grid covers full raster/vector extent without verified study-area polygon clipping.")
        if nodata_pct > 25.0:
            grid_warnings.append(f"High NoData ratio ({nodata_pct}%) inside cellular bounding domain.")

        grid_audits.append({
            "grid_id": g.id,
            "name": g.name,
            "source_dataset_name": ds_name_map.get(g.source_dataset_id, f"Dataset #{g.source_dataset_id}"),
            "crs": g.crs,
            "resolution_meters": g.resolution_meters,
            "processing_date": g.created_at.isoformat(),
            "cell_count": g.cell_count,
            "valid_cell_count": g.valid_cell_count,
            "nodata_cell_count": g.nodata_cell_count,
            "nodata_percentage": nodata_pct,
            "missing_attributes": missing_grid_attrs,
            "warnings": grid_warnings,
        })

    return {
        "datasets": dataset_audits,
        "grids": grid_audits,
        "processing_history": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "status": j.status,
                "dataset_id": j.dataset_id,
                "created_at": j.created_at.isoformat(),
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "error_message": j.error_message,
            }
            for j in jobs
        ],
        "processing_logs": [
            {
                "id": l.id,
                "level": l.level,
                "stage": l.stage,
                "message": l.message,
                "dataset_id": l.dataset_id,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
        "imputation_policy": "Strict No-Fabrication Policy: missing elevation, NDVI, coordinates, or NoData pixels remain null/flagged and are never silently imputed.",
        "disclaimer": SCIENTIFIC_DISCLAIMER,
    }
