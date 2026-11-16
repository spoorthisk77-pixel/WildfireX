from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.dataset import DatasetOut
from backend.app.schemas.geospatial import (
    ClipToStudyAreaRequest,
    GeometryAuditResponse,
    ProcessingJobOut,
    ProcessingLogOut,
    ReprojectRequest,
)
from backend.app.services.geospatial_service import (
    audit_dataset_geometries,
    clip_dataset_to_study_area,
    list_processing_jobs,
    list_processing_logs,
    reproject_dataset,
)

router = APIRouter(prefix="/geospatial", tags=["Geospatial Processing"])


@router.post("/reproject", response_model=DatasetOut)
def reproject(payload: ReprojectRequest, db: Session = Depends(get_db)):
    return reproject_dataset(db, payload.dataset_id, payload.target_crs)


@router.post("/clip", response_model=DatasetOut)
def clip_to_study_area(payload: ClipToStudyAreaRequest, db: Session = Depends(get_db)):
    return clip_dataset_to_study_area(db, payload.dataset_id, payload.study_area_id)


@router.get("/audit/{dataset_id}", response_model=GeometryAuditResponse)
def audit_geometry(dataset_id: int, db: Session = Depends(get_db)):
    return audit_dataset_geometries(db, dataset_id)


@router.get("/jobs", response_model=list[ProcessingJobOut])
def get_jobs(limit: int = 30, db: Session = Depends(get_db)):
    return list_processing_jobs(db, limit=limit)


@router.get("/logs", response_model=list[ProcessingLogOut])
def get_logs(limit: int = 50, db: Session = Depends(get_db)):
    return list_processing_logs(db, limit=limit)
