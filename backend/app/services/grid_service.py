from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.geospatial.grid_builder import build_grid_from_raster, build_grid_from_tabular_or_vector
from backend.app.models.entities import GridCell, ProcessedGrid, ProcessingJob, ProcessingLog
from backend.app.schemas.common import FileFormat
from backend.app.schemas.grid import GridGenerateRequest
from backend.app.services.dataset_service import get_dataset_by_id
from backend.app.services.study_area_service import get_active_study_area


def generate_structured_grid(db: Session, payload: GridGenerateRequest) -> ProcessedGrid:
    src_ds = get_dataset_by_id(db, payload.source_dataset_id)
    src_path = Path(src_ds.stored_path)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source dataset file not found on disk.")

    elev_path: Optional[Path] = None
    if payload.elevation_dataset_id is not None:
        elev_ds = get_dataset_by_id(db, payload.elevation_dataset_id)
        if elev_ds.file_format != FileFormat.GEOTIFF.value:
            raise HTTPException(status_code=400, detail="Elevation dataset must be a GeoTIFF raster.")
        elev_path = Path(elev_ds.stored_path)

    area = get_active_study_area(db)
    boundary_path: Optional[Path] = None
    if payload.clip_to_boundary and area.geometry_geojson_path:
        cand = Path(area.geometry_geojson_path)
        if cand.exists():
            boundary_path = cand

    job = ProcessingJob(
        job_type="grid_generation",
        dataset_id=src_ds.id,
        study_area_id=area.id,
        status="running",
        started_at=datetime.now(timezone.utc),
        parameters_json=payload.model_dump(),
    )
    db.add(job)
    db.flush()

    try:
        if src_ds.file_format == FileFormat.GEOTIFF.value:
            built = build_grid_from_raster(
                source_dataset_id=src_ds.id,
                raster_path=src_path,
                target_resolution_meters=payload.target_resolution_meters,
                max_dimension=payload.max_dimension,
                connectivity=payload.connectivity,
                boundary_geojson_path=boundary_path,
                clip_to_boundary=payload.clip_to_boundary,
                elevation_raster_path=elev_path,
            )
        else:
            csv_mapping = src_ds.metadata_record.csv_mapping_json if src_ds.metadata_record else None
            built = build_grid_from_tabular_or_vector(
                source_dataset_id=src_ds.id,
                file_path=src_path,
                file_format=src_ds.file_format,
                csv_mapping=csv_mapping,
                target_resolution_meters=payload.target_resolution_meters,
                max_dimension=payload.max_dimension,
                connectivity=payload.connectivity,
                boundary_geojson_path=boundary_path,
                clip_to_boundary=payload.clip_to_boundary,
                elevation_raster_path=elev_path,
            )

        grid = ProcessedGrid(
            name=payload.name.strip(),
            source_dataset_id=src_ds.id,
            elevation_dataset_id=payload.elevation_dataset_id,
            study_area_id=area.id,
            processing_job_id=job.id,
            crs=built["crs"],
            resolution_meters=built["resolution_meters"],
            source_resolution_native=built["source_resolution_native"],
            rows=built["rows"],
            cols=built["cols"],
            cell_count=built["cell_count"],
            valid_cell_count=built["valid_cell_count"],
            nodata_cell_count=built["nodata_cell_count"],
            bounds_json=built["bounds_json"],
            clipped_to_boundary=built["clipped_to_boundary"],
            grid_geojson_path=built["grid_geojson_path"],
            status="ready",
            metadata_json=built["metadata_json"],
        )
        db.add(grid)
        db.flush()

        cell_objs = [GridCell(grid_id=grid.id, **cell) for cell in built["cells"]]
        db.bulk_save_objects(cell_objs)

        src_ds.processing_status = "processed"
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.result_summary_json = {
            "grid_id": grid.id,
            "rows": grid.rows,
            "cols": grid.cols,
            "valid_cell_count": grid.valid_cell_count,
            "graph_edges": built["metadata_json"].get("graph_edges"),
        }
        db.add(
            ProcessingLog(
                job_id=job.id,
                dataset_id=src_ds.id,
                level="INFO",
                stage="grid_generation",
                message=f"Generated {grid.rows}x{grid.cols} structured grid '{grid.name}' ({grid.valid_cell_count} valid cells).",
            )
        )
        db.commit()
        db.refresh(grid)
        return grid
    except HTTPException as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        db.commit()
        raise exc
    except Exception as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Grid generation failed: {exc}") from exc


def list_grids(db: Session) -> list[ProcessedGrid]:
    return list(db.execute(select(ProcessedGrid).order_by(ProcessedGrid.created_at.desc())).scalars().all())


def get_grid_by_id(db: Session, grid_id: int) -> ProcessedGrid:
    grid = db.execute(select(ProcessedGrid).where(ProcessedGrid.id == grid_id)).scalar_one_or_none()
    if not grid:
        raise HTTPException(status_code=404, detail=f"Processed grid {grid_id} not found.")
    return grid


def get_grid_cells(
    db: Session,
    grid_id: int,
    limit: int = 2500,
    offset: int = 0,
    landcover_filter: Optional[str] = None,
    include_nodata: bool = True,
) -> dict:
    grid = get_grid_by_id(db, grid_id)
    stmt = select(GridCell).where(GridCell.grid_id == grid_id)
    if not include_nodata:
        stmt = stmt.where(GridCell.quality_status == "valid")
    if landcover_filter:
        stmt = stmt.where(GridCell.landcover_category == landcover_filter)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    cells = list(
        db.execute(stmt.order_by(GridCell.row_idx, GridCell.col_idx).offset(offset).limit(limit))
        .scalars()
        .all()
    )

    breakdown_rows = db.execute(
        select(GridCell.landcover_category, func.count(GridCell.id))
        .where(GridCell.grid_id == grid_id)
        .group_by(GridCell.landcover_category)
    ).all()
    breakdown = {str(cat): int(cnt) for cat, cnt in breakdown_rows}

    return {
        "grid": grid,
        "cells": cells,
        "total_cells": int(total),
        "landcover_breakdown": breakdown,
    }


def delete_grid(db: Session, grid_id: int) -> dict:
    grid = get_grid_by_id(db, grid_id)
    name = grid.name
    db.delete(grid)
    db.commit()
    return {"deleted": True, "id": grid_id, "name": name}
