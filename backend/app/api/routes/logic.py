from fastapi import APIRouter

from backend.app.schemas.logic import (
    DeMorganRequest,
    EquivalenceRequest,
    InferenceRuleRequest,
    PredicateQuantifierRequest,
    PropositionalEvalRequest,
)
from backend.app.schemas.math_common import MathTopicResponse
from backend.app.services.logic_service import (
    evaluate_equivalence,
    evaluate_predicate_quantifier,
    evaluate_propositional,
    verify_demorgan,
    verify_inference_rule,
)

router = APIRouter(prefix="/math/logic", tags=["Module II: Mathematical Logic"])


@router.post("/propositional", response_model=MathTopicResponse)
def route_propositional(payload: PropositionalEvalRequest):
    return evaluate_propositional(payload)


@router.post("/equivalence", response_model=MathTopicResponse)
def route_equivalence(payload: EquivalenceRequest):
    return evaluate_equivalence(payload)


@router.post("/demorgan", response_model=MathTopicResponse)
def route_demorgan(payload: DeMorganRequest):
    return verify_demorgan(payload)


@router.post("/inference", response_model=MathTopicResponse)
def route_inference(payload: InferenceRuleRequest):
    return verify_inference_rule(payload)


@router.post("/predicate-quantifier", response_model=MathTopicResponse)
def route_predicate(payload: PredicateQuantifierRequest):
    return evaluate_predicate_quantifier(payload)
