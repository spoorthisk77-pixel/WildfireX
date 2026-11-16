from typing import Any, Optional
from pydantic import BaseModel, Field


class DerivationStep(BaseModel):
    step_number: int
    title: str
    expression_latex: Optional[str] = None
    explanation: str
    value: Optional[Any] = None


class MathTopicResponse(BaseModel):
    topic_key: str
    module: str
    title: str
    introduction: str
    definition: str
    formula_latex: str
    inputs_echo: dict[str, Any] = Field(default_factory=dict)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    result: dict[str, Any] = Field(default_factory=dict)
    visualization: dict[str, Any] = Field(default_factory=dict)
    verification: dict[str, Any] = Field(default_factory=dict)
    limitations: str
