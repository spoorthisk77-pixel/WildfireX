from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.graph_theory import (
    GraphEulerHamiltonianRequest,
    GraphIsomorphismRequest,
    GraphPlanarityColoringRequest,
    GraphWalkPathRequest,
    GridGraphInspectRequest,
)
from backend.app.schemas.math_common import MathTopicResponse
from backend.app.services.grid_graph_service import (
    analyze_euler_hamiltonian,
    analyze_planarity_coloring,
    analyze_walks_paths,
    check_isomorphism,
    inspect_grid_graph,
)

router = APIRouter(prefix="/math/graph-theory", tags=["Module IV: Graph Theory"])


@router.post("/grid-inspect", response_model=MathTopicResponse)
def route_grid_graph(payload: GridGraphInspectRequest, db: Session = Depends(get_db)):
    return inspect_grid_graph(db, payload)


@router.post("/isomorphism", response_model=MathTopicResponse)
def route_isomorphism(payload: GraphIsomorphismRequest):
    return check_isomorphism(payload)


@router.post("/walks-paths", response_model=MathTopicResponse)
def route_walks_paths(payload: GraphWalkPathRequest, db: Session = Depends(get_db)):
    return analyze_walks_paths(db, payload)


@router.post("/euler-hamiltonian", response_model=MathTopicResponse)
def route_euler_hamiltonian(payload: GraphEulerHamiltonianRequest):
    return analyze_euler_hamiltonian(payload)


@router.post("/planarity-coloring", response_model=MathTopicResponse)
def route_planarity_coloring(payload: GraphPlanarityColoringRequest):
    return analyze_planarity_coloring(payload)
