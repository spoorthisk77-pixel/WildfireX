from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.services.observation_service import (
    export_observations_response,
    query_observations_analytics,
)

router = APIRouter(prefix="/observations", tags=["Historical Observations"])


@router.get("")
def get_observations_analytics(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    dataset_id: Optional[int] = Query(default=None),
    year: Optional[int] = Query(default=None),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    satellite: Optional[str] = Query(default=None),
    confidence: Optional[str] = Query(default=None),
    record_type: Optional[str] = Query(default=None),
    exclude_duplicates: bool = Query(default=False),
    min_lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    clip_to_study_area: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return query_observations_analytics(
        db=db,
        limit=limit,
        offset=offset,
        dataset_id=dataset_id,
        year=year,
        month=month,
        satellite=satellite,
        confidence=confidence,
        record_type=record_type,
        exclude_duplicates=exclude_duplicates,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        clip_to_study_area=clip_to_study_area,
    )


@router.get("/export")
def export_observations(
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    dataset_id: Optional[int] = Query(default=None),
    year: Optional[int] = Query(default=None),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    satellite: Optional[str] = Query(default=None),
    confidence: Optional[str] = Query(default=None),
    record_type: Optional[str] = Query(default=None),
    exclude_duplicates: bool = Query(default=False),
    min_lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    max_lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    min_lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    max_lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    clip_to_study_area: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    return export_observations_response(
        db=db,
        export_format=format,
        dataset_id=dataset_id,
        year=year,
        month=month,
        satellite=satellite,
        confidence=confidence,
        record_type=record_type,
        exclude_duplicates=exclude_duplicates,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        clip_to_study_area=clip_to_study_area,
    )
