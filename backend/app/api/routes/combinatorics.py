from fastapi import APIRouter

from backend.app.schemas.combinatorics import CombinatoricsRequest
from backend.app.schemas.math_common import MathTopicResponse
from backend.app.services.combinatorics_service import solve_combinatorics

router = APIRouter(prefix="/math/combinatorics", tags=["Module I: Combinatorics"])


@router.post("/solve", response_model=MathTopicResponse)
def route_solve_combinatorics(payload: CombinatoricsRequest):
    return solve_combinatorics(payload)
