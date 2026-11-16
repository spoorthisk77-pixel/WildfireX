from typing import Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.services.report_service import (
    delete_report,
    download_report_response,
    generate_report,
    list_reports,
    serialize_report,
)

router = APIRouter(prefix="/reports", tags=["Research Reports"])


class ReportGenerateRequest(BaseModel):
    title: str = Field(default="Nagarhole National Park WildfireX Research Report", min_length=2, max_length=255)
    format: str = Field(default="pdf", description="pdf | csv")
    report_type: str = Field(default="comprehensive_research")
    grid_id: Optional[int] = None
    simulation_id: Optional[int] = None
    experiment_id: Optional[int] = None


@router.get("")
def get_reports(db: Session = Depends(get_db)):
    return [serialize_report(r) for r in list_reports(db)]


@router.post("/generate", status_code=status.HTTP_201_CREATED)
def post_generate_report(payload: ReportGenerateRequest, db: Session = Depends(get_db)):
    rep = generate_report(
        db=db,
        title=payload.title,
        report_format=payload.format,
        report_type=payload.report_type,
        grid_id=payload.grid_id,
        simulation_id=payload.simulation_id,
        experiment_id=payload.experiment_id,
    )
    return serialize_report(rep)


@router.get("/{report_id}/download")
def download_report(report_id: int, db: Session = Depends(get_db)):
    return download_report_response(db, report_id)


@router.delete("/{report_id}")
def remove_report(report_id: int, db: Session = Depends(get_db)):
    return delete_report(db, report_id)
