from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.models.entities import HistoricalObservation
from backend.app.schemas.dashboard import DashboardStatsResponse
from backend.app.services.dashboard_service import build_dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    return build_dashboard_stats(db)


@router.get("/observations")
def get_historical_observations(limit: int = 500, db: Session = Depends(get_db)):
    rows = list(
        db.execute(
            select(HistoricalObservation)
            .order_by(HistoricalObservation.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return {
        "total": len(rows),
        "items": [
            {
                "id": r.id,
                "source_dataset_id": r.source_dataset_id,
                "observation_date": r.observation_date,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "brightness": r.brightness,
                "frp": r.frp,
                "confidence": r.confidence,
                "satellite": r.satellite,
                "instrument": r.instrument,
                "daynight": r.daynight,
            }
            for r in rows
        ],
    }
