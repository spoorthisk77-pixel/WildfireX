from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class ExperimentCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    module_type: str = Field(
        ...,
        description="cellular_automata | graph_theory | combinatorics | logic | generating_functions | recurrence | trees",
    )
    description: Optional[str] = None
    grid_id: Optional[int] = None
    study_area_id: Optional[int] = None
    dataset_id: Optional[int] = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None


class ExperimentConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    parameters_json: dict[str, Any]
    notes: Optional[str] = None
    created_at: datetime


class ExperimentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    module_type: str
    description: Optional[str] = None
    grid_id: Optional[int] = None
    study_area_id: Optional[int] = None
    dataset_id: Optional[int] = None
    dataset_version_hash: Optional[str] = None
    status: str
    results_json: Optional[dict[str, Any]] = None
    executed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    configurations: list[ExperimentConfigOut] = Field(default_factory=list)
