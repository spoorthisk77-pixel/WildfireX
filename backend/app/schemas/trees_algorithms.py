from typing import Literal, Optional
from pydantic import BaseModel, Field


class WeightedEdge(BaseModel):
    u: str = Field(..., min_length=1, max_length=24)
    v: str = Field(..., min_length=1, max_length=24)
    weight: float = Field(..., gt=0.0, le=10000.0)


class TreePropertiesRequest(BaseModel):
    vertices: list[str] = Field(..., min_length=2, max_length=24)
    edges: list[WeightedEdge] = Field(..., min_length=1, max_length=100)
    root: Optional[str] = None


class BinaryTreeNodeInput(BaseModel):
    label: str = Field(..., min_length=1, max_length=24)
    left: Optional[str] = None
    right: Optional[str] = None


class BinaryTreeTraversalRequest(BaseModel):
    root: str
    nodes: list[BinaryTreeNodeInput] = Field(..., min_length=1, max_length=31)


class HuffmanSymbolInput(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=16)
    frequency: float = Field(..., gt=0.0, le=1000000.0)


class HuffmanRequest(BaseModel):
    symbols: list[HuffmanSymbolInput] = Field(..., min_length=2, max_length=20)
    sample_text: Optional[str] = Field(default=None, max_length=200)


class WeightedGraphAlgoRequest(BaseModel):
    algorithm: Literal["kruskal", "prim", "dijkstra", "bfs_spanning_tree"] = "kruskal"
    # Either supply custom vertices/edges OR extract a bounded patch from a ProcessedGrid
    grid_id: Optional[int] = None
    row_start: int = Field(default=0, ge=0)
    col_start: int = Field(default=0, ge=0)
    patch_size: int = Field(default=4, ge=2, le=6)
    vertices: Optional[list[str]] = Field(default=None, max_length=36)
    edges: Optional[list[WeightedEdge]] = Field(default=None, max_length=200)
    source_vertex: Optional[str] = None
    target_vertex: Optional[str] = None


class SortingDemoRequest(BaseModel):
    algorithm: Literal["merge_sort", "quick_sort", "insertion_sort"] = "merge_sort"
    values: list[float] = Field(..., min_length=2, max_length=16)
