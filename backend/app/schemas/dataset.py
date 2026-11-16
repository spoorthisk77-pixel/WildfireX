from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.app.schemas.common import DataSource, FileFormat


class CsvColumnMappingRequest(BaseModel):
    latitude_column: Optional[str] = Field(default=None, description="Column containing WGS84 latitude")
    longitude_column: Optional[str] = Field(default=None, description="Column containing WGS84 longitude")
    cell_id_column: Optional[str] = Field(default=None, description="Optional unique cell or record ID column")
    landcover_column: Optional[str] = Field(default=None, description="Column containing land-cover category or numeric code")
    elevation_column: Optional[str] = Field(default=None, description="Optional elevation in meters column")
    date_column: Optional[str] = Field(default=None, description="Optional observation date column")
    time_column: Optional[str] = Field(default=None, description="Optional acquisition time column (e.g. acq_time)")
    brightness_column: Optional[str] = Field(default=None, description="Optional FIRMS brightness/temperature column")
    frp_column: Optional[str] = Field(default=None, description="Optional Fire Radiative Power column")
    confidence_column: Optional[str] = Field(default=None, description="Optional confidence column")
    satellite_column: Optional[str] = Field(default=None, description="Optional satellite identifier column")
    instrument_column: Optional[str] = Field(default=None, description="Optional sensor/instrument column (MODIS/VIIRS)")
    record_type_column: Optional[str] = Field(
        default=None,
        description="Optional record classification column (satellite_hotspot vs confirmed_incident)",
    )
    crs: str = Field(default="EPSG:4326", description="Coordinate reference system of coordinates")
    interpret_as: str = Field(
        default="points",
        description="Interpretation mode: points | grid_cells | historical_observations",
    )


class DatasetMetadataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    crs: Optional[str] = None
    epsg_code: Optional[int] = None
    bounds_json: Optional[dict[str, Any]] = None
    wgs84_bounds_json: Optional[dict[str, Any]] = None
    width: Optional[int] = None
    height: Optional[int] = None
    band_count: Optional[int] = None
    resolution_x: Optional[float] = None
    resolution_y: Optional[float] = None
    nodata_value: Optional[str] = None
    driver: Optional[str] = None
    dtype: Optional[str] = None
    geometry_types_json: Optional[list[str]] = None
    feature_count: Optional[int] = None
    invalid_geometry_count: Optional[int] = None
    column_schema_json: Optional[list[dict[str, Any]]] = None
    csv_mapping_json: Optional[dict[str, Any]] = None
    preview_rows_json: Optional[list[dict[str, Any]]] = None
    landcover_summary_json: Optional[dict[str, Any]] = None
    extra_json: Optional[dict[str, Any]] = None
    updated_at: datetime


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    file_format: FileFormat | str
    original_filename: str
    file_size_bytes: int
    sha256_hash: str
    data_source: DataSource | str
    provenance_notes: Optional[str] = None
    license_or_citation: Optional[str] = None
    acquisition_date: Optional[str] = None
    processing_status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    metadata_record: Optional[DatasetMetadataOut] = None


class DatasetListResponse(BaseModel):
    items: list[DatasetOut]
    total: int


class DatasetPreviewResponse(BaseModel):
    dataset_id: int
    file_format: str
    columns: list[dict[str, Any]] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    raster_summary: Optional[dict[str, Any]] = None
    vector_summary: Optional[dict[str, Any]] = None
    csv_mapping: Optional[dict[str, Any]] = None
