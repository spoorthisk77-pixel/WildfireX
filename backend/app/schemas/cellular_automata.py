from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class SimulationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    grid_id: int
    neighborhood: Literal["moore_8", "von_neumann_4"] = "moore_8"
    boundary_condition: Literal["absorbing", "reflective", "periodic"] = "absorbing"
    seed_cell_uids: list[str] = Field(..., min_length=1, max_length=50)
    barrier_cell_uids: list[str] = Field(default_factory=list, max_length=500)
    base_transition_factor: float = Field(default=0.45, ge=0.05, le=0.95)
    moisture_damping: float = Field(default=0.25, ge=0.0, le=0.9)
    wind_direction: Literal["none", "N", "NE", "E", "SE", "S", "SW", "W", "NW"] = "none"
    wind_bias: float = Field(default=0.15, ge=0.0, le=0.45)
    burn_duration_steps: int = Field(default=2, ge=1, le=6)
    max_generations: int = Field(default=35, ge=1, le=120)
    deterministic_mode: bool = True
    random_seed: int = Field(default=42, ge=0, le=999999)


class SimulationStepRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=50)


class SimulationStatusUpdateRequest(BaseModel):
    status: Literal["initialized", "running", "paused", "completed"]


class SimulationStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    simulation_id: int
    generation: int
    state_counts_json: dict[str, int]
    affected_cell_count: int
    newly_ignited_count: int
    cell_states_json: dict[str, str]
    metrics_json: Optional[dict[str, Any]] = None
    created_at: datetime


class SimulationRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    grid_id: int
    experiment_id: Optional[int] = None
    data_classification: str
    neighborhood: str
    boundary_condition: str
    status: str
    current_generation: int
    max_generations: int
    parameters_json: dict[str, Any]
    seed_cells_json: list[str]
    initial_summary_json: dict[str, Any]
    disclaimer: str
    created_at: datetime
    updated_at: datetime


class SimulationDetailOut(BaseModel):
    simulation: SimulationRunOut
    steps: list[SimulationStepOut]


class CoordinateConvertRequest(BaseModel):
    grid_id: int
    mode: Literal["grid_to_geo", "geo_to_grid"]
    row_idx: Optional[int] = None
    col_idx: Optional[int] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None


class CoordinateConvertResponse(BaseModel):
    grid_id: int
    mode: str
    row_idx: int
    col_idx: int
    cell_uid: Optional[str] = None
    center_lon: float
    center_lat: float
    native_x: float
    native_y: float
    crs: str
    inside_grid_bounds: bool
    note: str


class GridNeighborhoodRequest(BaseModel):
    grid_id: int
    cell_uid: str
    neighborhood: Literal["moore_8", "von_neumann_4"] = "moore_8"
    boundary_condition: Literal["absorbing", "reflective", "periodic"] = "absorbing"


class GridNeighborhoodResponse(BaseModel):
    grid_id: int
    cell_uid: str
    row_idx: int
    col_idx: int
    neighborhood: str
    boundary_condition: str
    neighbor_details: list[dict[str, Any]]
    degree: int
    boundary_clipped_directions: list[str]
