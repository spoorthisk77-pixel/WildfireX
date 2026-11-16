from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class StudyAreaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region_label: str
    verification_status: str
    source_dataset_id: Optional[int] = None
    crs: Optional[str] = None
    area_sq_km: Optional[float] = None
    bounds_json: Optional[dict[str, Any]] = None
    # Keep internal file path hidden from API responses for security
    geometry_geojson_path: Optional[str] = Field(default=None, exclude=True)
    vertex_count: Optional[int] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def has_boundary_geometry(self) -> bool:
        return bool(self.geometry_geojson_path)


class StudyAreaVerifyRequest(BaseModel):
    verification_status: str = Field(
        ...,
        description="verified_boundary | boundary_imported_unverified | awaiting_boundary_verification",
    )
    notes: Optional[str] = None


class StudyAreaDetailResponse(BaseModel):
    study_area: StudyAreaOut
    geojson: Optional[dict[str, Any]] = None
