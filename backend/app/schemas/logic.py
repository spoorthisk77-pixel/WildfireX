from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class PropositionalEvalRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=250)


class EquivalenceRequest(BaseModel):
    expression_left: str = Field(..., min_length=1, max_length=250)
    expression_right: str = Field(..., min_length=1, max_length=250)
    check_type: Literal["equivalence", "implication", "biconditional"] = "equivalence"


class DeMorganRequest(BaseModel):
    variables: list[str] = Field(default_factory=lambda: ["P", "Q"], min_length=2, max_length=4)
    law_form: Literal["negated_conjunction", "negated_disjunction"] = "negated_conjunction"


class InferenceRuleRequest(BaseModel):
    rule_name: Literal[
        "modus_ponens",
        "modus_tollens",
        "hypothetical_syllogism",
        "disjunctive_syllogism",
        "custom",
    ] = "modus_ponens"
    premises: Optional[list[str]] = Field(default=None, max_length=5)
    conclusion: Optional[str] = Field(default=None, max_length=200)


class DomainElement(BaseModel):
    label: str = Field(..., min_length=1, max_length=48)
    predicates: dict[str, bool] = Field(default_factory=dict)


class PredicateQuantifierRequest(BaseModel):
    domain: list[DomainElement] = Field(..., min_length=1, max_length=24)
    quantifier: Literal["forall", "exists"] = "forall"
    predicate_expression: str = Field(
        default="TreeCover(x) -> Burnable(x)",
        min_length=1,
        max_length=200,
    )
