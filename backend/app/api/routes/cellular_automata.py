from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.cellular_automata import (
    CoordinateConvertRequest,
    CoordinateConvertResponse,
    GridNeighborhoodRequest,
    GridNeighborhoodResponse,
    SimulationCreateRequest,
    SimulationDetailOut,
    SimulationRunOut,
    SimulationStatusUpdateRequest,
    SimulationStepRequest,
)
from backend.app.services.cellular_automata_service import (
    convert_grid_coordinates,
    create_simulation,
    delete_simulation,
    get_simulation_detail,
    inspect_grid_neighborhood,
    list_simulations,
    reset_simulation,
    step_simulation,
    update_simulation_status,
)

router = APIRouter(prefix="/cellular-automata", tags=["Cellular Automata & Grid Engine"])


@router.post("/coords/convert", response_model=CoordinateConvertResponse)
def convert_coords(payload: CoordinateConvertRequest, db: Session = Depends(get_db)):
    return convert_grid_coordinates(db, payload)


@router.post("/neighborhood/inspect", response_model=GridNeighborhoodResponse)
def inspect_neighborhood(payload: GridNeighborhoodRequest, db: Session = Depends(get_db)):
    return inspect_grid_neighborhood(db, payload)


@router.get("/simulations", response_model=list[SimulationRunOut])
def get_simulations(grid_id: Optional[int] = Query(default=None), db: Session = Depends(get_db)):
    return list_simulations(db, grid_id=grid_id)


@router.post("/simulations", response_model=SimulationDetailOut, status_code=status.HTTP_201_CREATED)
def start_simulation(payload: SimulationCreateRequest, db: Session = Depends(get_db)):
    return create_simulation(db, payload)


@router.get("/simulations/{simulation_id}", response_model=SimulationDetailOut)
def get_simulation(simulation_id: int, db: Session = Depends(get_db)):
    return get_simulation_detail(db, simulation_id)


@router.post("/simulations/{simulation_id}/step", response_model=SimulationDetailOut)
def advance_simulation(
    simulation_id: int,
    payload: SimulationStepRequest,
    db: Session = Depends(get_db),
):
    return step_simulation(db, simulation_id, steps_to_advance=payload.steps)


@router.patch("/simulations/{simulation_id}/status", response_model=SimulationRunOut)
def patch_simulation_status(
    simulation_id: int,
    payload: SimulationStatusUpdateRequest,
    db: Session = Depends(get_db),
):
    return update_simulation_status(db, simulation_id, payload.status)


@router.post("/simulations/{simulation_id}/reset", response_model=SimulationDetailOut)
def reset_sim(simulation_id: int, db: Session = Depends(get_db)):
    return reset_simulation(db, simulation_id)


@router.delete("/simulations/{simulation_id}")
def remove_simulation(simulation_id: int, db: Session = Depends(get_db)):
    return delete_simulation(db, simulation_id)
