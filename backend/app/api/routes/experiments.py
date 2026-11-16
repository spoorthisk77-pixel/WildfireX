from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.experiment import ExperimentCreateRequest, ExperimentOut
from backend.app.services.experiment_service import (
    build_scenario_comparison,
    create_experiment,
    delete_experiment,
    execute_experiment,
    export_experiment_response,
    get_experiment,
    list_experiments,
)

router = APIRouter(prefix="/experiments", tags=["Experiments"])


@router.get("", response_model=list[ExperimentOut])
def get_experiments(db: Session = Depends(get_db)):
    return list_experiments(db)


@router.get("/compare/summary")
def get_scenario_comparison(db: Session = Depends(get_db)):
    return build_scenario_comparison(db)


@router.post("", response_model=ExperimentOut, status_code=status.HTTP_201_CREATED)
def post_experiment(payload: ExperimentCreateRequest, db: Session = Depends(get_db)):
    return create_experiment(db, payload)


@router.get("/{experiment_id}", response_model=ExperimentOut)
def get_one_experiment(experiment_id: int, db: Session = Depends(get_db)):
    return get_experiment(db, experiment_id)


@router.post("/{experiment_id}/execute", response_model=ExperimentOut)
def run_experiment(experiment_id: int, db: Session = Depends(get_db)):
    return execute_experiment(db, experiment_id)


@router.get("/{experiment_id}/export")
def export_one_experiment(
    experiment_id: int,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
):
    return export_experiment_response(db, experiment_id, export_format=format)


@router.delete("/{experiment_id}")
def remove_experiment(experiment_id: int, db: Session = Depends(get_db)):
    return delete_experiment(db, experiment_id)
