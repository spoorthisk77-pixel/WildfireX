from fastapi import APIRouter

from backend.app.services.syllabus_service import get_syllabus_coverage

router = APIRouter(prefix="/syllabus", tags=["Syllabus Coverage"])


@router.get("")
def read_syllabus_coverage():
    return get_syllabus_coverage()
