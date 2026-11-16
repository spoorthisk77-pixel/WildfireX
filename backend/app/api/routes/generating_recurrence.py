from fastapi import APIRouter

from backend.app.schemas.generating_recurrence import (
    CountingSequenceRequest,
    EGFRequest,
    OGFRequest,
    PartitionsRequest,
    RecurrenceSolveRequest,
)
from backend.app.schemas.math_common import MathTopicResponse
from backend.app.services.generating_recurrence_service import (
    analyze_counting_sequence,
    analyze_egf,
    analyze_ogf,
    analyze_partitions,
    solve_recurrence,
)

router = APIRouter(prefix="/math/generating-recurrence", tags=["Module III: Generating Functions & Recurrences"])


@router.post("/ogf", response_model=MathTopicResponse)
def route_ogf(payload: OGFRequest):
    return analyze_ogf(payload)


@router.post("/egf", response_model=MathTopicResponse)
def route_egf(payload: EGFRequest):
    return analyze_egf(payload)


@router.post("/partitions", response_model=MathTopicResponse)
def route_partitions(payload: PartitionsRequest):
    return analyze_partitions(payload)


@router.post("/sequences", response_model=MathTopicResponse)
def route_sequences(payload: CountingSequenceRequest):
    return analyze_counting_sequence(payload)


@router.post("/recurrence", response_model=MathTopicResponse)
def route_recurrence(payload: RecurrenceSolveRequest):
    return solve_recurrence(payload)
