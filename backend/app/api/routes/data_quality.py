from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.services.data_quality_service import build_data_quality_report

router = APIRouter(prefix="/data-quality", tags=["Data Quality & Transparency"])


@router.get("")
def get_data_quality_overview(db: Session = Depends(get_db)):
    return build_data_quality_report(db)
