from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class SourceAvailabilityItem(BaseModel):
    source_key: str
    label: str
    description: str
    status: str  # imported | unavailable
    dataset_count: int
    latest_dataset_name: Optional[str] = None
    how_to_obtain: str


class RecentActivityItem(BaseModel):
    id: int
    job_type: str
    status: str
    dataset_id: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class DashboardStatsResponse(BaseModel):
    project_title: str
    study_region: str
    study_area_status: str
    study_area_sq_km: Optional[float] = None
    dataset_count: int
    processed_grid_count: int
    processed_cell_count: int
    valid_cell_count: int
    historical_observation_count: int
    experiment_count: int
    data_quality_status: str
    last_processing_activity: Optional[RecentActivityItem] = None
    recent_activities: list[RecentActivityItem]
    recent_experiments: list[dict[str, Any]]
    source_availability: list[SourceAvailabilityItem]
    system_status: dict[str, Any]
