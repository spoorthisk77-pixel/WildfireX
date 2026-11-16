from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class GridGenerateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    source_dataset_id: int
    elevation_dataset_id: Optional[int] = None
    study_area_id: Optional[int] = None
    clip_to_boundary: bool = True
    target_resolution_meters: float = Field(default=100.0, gt=1.0, le=50000.0)
    max_dimension: int = Field(default=64, ge=4, le=120)
    connectivity: int = Field(default=4, description="4-neighbor (von Neumann) or 8-neighbor (Moore)")


class GridCellOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grid_id: int
    cell_uid: str
    row_idx: int
    col_idx: int
    center_lon: float
    center_lat: float
    native_x: float
    native_y: float
    geometry_wkt: Optional[str] = None
    landcover_code: Optional[int] = None
    landcover_category: str
    original_source_value: Optional[str] = None
    source_dataset_id: int
    spatial_resolution: float
    crs: str
    quality_status: str
    elevation_m: Optional[float] = None
    vegetation_index: Optional[float] = None
    graph_vertex_id: int
    neighbors_json: list[str] = Field(default_factory=list)
    metadata_json: Optional[dict[str, Any]] = None


class ProcessedGridOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source_dataset_id: int
    elevation_dataset_id: Optional[int] = None
    study_area_id: Optional[int] = None
    processing_job_id: Optional[int] = None
    crs: str
    resolution_meters: float
    source_resolution_native: Optional[str] = None
    rows: int
    cols: int
    cell_count: int
    valid_cell_count: int
    nodata_cell_count: int
    bounds_json: dict[str, Any]
    clipped_to_boundary: bool
    status: str
    metadata_json: Optional[dict[str, Any]] = None
    created_at: datetime


class GridCellsPageResponse(BaseModel):
    grid: ProcessedGridOut
    cells: list[GridCellOut]
    total_cells: int
    landcover_breakdown: dict[str, int]
