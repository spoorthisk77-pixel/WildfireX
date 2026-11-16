from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.study_area import StudyAreaDetailResponse, StudyAreaOut, StudyAreaVerifyRequest
from backend.app.services.study_area_service import (
    get_active_study_area,
    get_study_area_geojson,
    import_study_area_boundary,
    list_study_areas,
    update_study_area_verification,
)

router = APIRouter(prefix="/study-areas", tags=["Study Areas"])


@router.get("", response_model=list[StudyAreaOut])
def get_study_areas(db: Session = Depends(get_db)):
    return list_study_areas(db)


@router.get("/active", response_model=StudyAreaDetailResponse)
def get_active_area(db: Session = Depends(get_db)):
    area = get_active_study_area(db)
    geojson = get_study_area_geojson(area)
    return StudyAreaDetailResponse(study_area=area, geojson=geojson)


@router.post("/boundary-upload", response_model=StudyAreaDetailResponse, status_code=status.HTTP_201_CREATED)
async def upload_study_boundary(
    file: UploadFile = File(...),
    name: str = Form(default="Nagarhole National Park Boundary"),
    region_label: str = Form(default="Nagarhole National Park, Karnataka, India"),
    notes: Optional[str] = Form(default=None),
    mark_verified: bool = Form(default=False),
    db: Session = Depends(get_db),
):
    area = await import_study_area_boundary(
        db=db,
        file=file,
        name=name,
        region_label=region_label,
        notes=notes,
        mark_verified=mark_verified,
    )
    return StudyAreaDetailResponse(study_area=area, geojson=get_study_area_geojson(area))


@router.patch("/{study_area_id}/verification", response_model=StudyAreaOut)
def set_verification_status(
    study_area_id: int,
    payload: StudyAreaVerifyRequest,
    db: Session = Depends(get_db),
):
    return update_study_area_verification(db, study_area_id, payload.verification_status, payload.notes)
