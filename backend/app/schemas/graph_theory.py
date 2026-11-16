from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class CustomEdgeInput(BaseModel):
    u: str = Field(..., min_length=1, max_length=32)
    v: str = Field(..., min_length=1, max_length=32)
    weight: float = Field(default=1.0, gt=0.0, le=10000.0)


class CustomGraphInput(BaseModel):
    vertices: list[str] = Field(..., min_length=1, max_length=25)
    edges: list[CustomEdgeInput] = Field(default_factory=list, max_length=300)
    directed: bool = False


class GridGraphInspectRequest(BaseModel):
    grid_id: int
    neighborhood: Literal["moore_8", "von_neumann_4"] = "von_neumann_4"
    boundary_condition: Literal["absorbing", "reflective", "periodic"] = "absorbing"
    # Optional subgrid patch window for readable adjacency matrix, complement, and planar layout
    row_start: int = Field(default=0, ge=0)
    col_start: int = Field(default=0, ge=0)
    patch_rows: int = Field(default=4, ge=2, le=8)
    patch_cols: int = Field(default=4, ge=2, le=8)
    include_nodata: bool = False


class GraphIsomorphismRequest(BaseModel):
    graph_a: CustomGraphInput
    graph_b: CustomGraphInput


class GraphWalkPathRequest(BaseModel):
    graph: Optional[CustomGraphInput] = None
    grid_id: Optional[int] = None
    row_start: int = Field(default=0, ge=0)
    col_start: int = Field(default=0, ge=0)
    patch_size: int = Field(default=5, ge=2, le=7)
    source: str = Field(..., min_length=1, max_length=32)
    target: str = Field(..., min_length=1, max_length=32)
    max_length: int = Field(default=6, ge=1, le=10)


class GraphEulerHamiltonianRequest(BaseModel):
    graph: CustomGraphInput
    mode: Literal["euler", "hamiltonian", "both"] = "both"


class GraphPlanarityColoringRequest(BaseModel):
    graph: CustomGraphInput
    compute_chromatic_polynomial: bool = True
    compute_dual: bool = True
