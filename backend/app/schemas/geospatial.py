from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class ReprojectRequest(BaseModel):
    dataset_id: int
    target_crs: str = Field(default="EPSG:32643", description="Target CRS, e.g. EPSG:32643 or EPSG:4326")


class ClipToStudyAreaRequest(BaseModel):
    dataset_id: int
    study_area_id: Optional[int] = None


class ProcessingJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_type: str
    dataset_id: Optional[int] = None
    study_area_id: Optional[int] = None
    status: str
    parameters_json: Optional[dict[str, Any]] = None
    result_summary_json: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class ProcessingLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: Optional[int] = None
    dataset_id: Optional[int] = None
    level: str
    stage: str
    message: str
    details_json: Optional[dict[str, Any]] = None
    created_at: datetime


class GeometryAuditResponse(BaseModel):
    dataset_id: int
    crs: Optional[str] = None
    feature_count: int
    valid_geometry_count: int
    invalid_geometry_count: int
    invalid_feature_indices: list[int] = Field(default_factory=list)
    geometry_types: list[str] = Field(default_factory=list)
    bounds_wgs84: Optional[dict[str, float]] = None
