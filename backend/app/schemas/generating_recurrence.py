from typing import Literal, Optional
from pydantic import BaseModel, Field


class OGFRequest(BaseModel):
    # Rational OGF numerator / denominator coefficients OR closed form expression in x
    expression: Optional[str] = Field(default="1 / (1 - x - x^2)", max_length=120)
    sequence_terms: Optional[list[float]] = Field(default=None, max_length=15)
    order: int = Field(default=10, ge=2, le=20)
    extract_index: int = Field(default=6, ge=0, le=20)


class EGFRequest(BaseModel):
    expression: str = Field(default="exp(x) * (1 + x)", max_length=120)
    order: int = Field(default=8, ge=2, le=15)
    extract_index: int = Field(default=4, ge=0, le=15)


class PartitionsRequest(BaseModel):
    n: int = Field(..., ge=0, le=30)
    max_part: Optional[int] = Field(default=None, ge=1, le=30)
    distinct_only: bool = False


class CountingSequenceRequest(BaseModel):
    sequence_type: Literal["fibonacci", "catalan", "bell", "stirling_second", "derangement", "lucas"] = "catalan"
    terms_count: int = Field(default=10, ge=2, le=18)
    stirling_k: int = Field(default=3, ge=1, le=12)


class RecurrenceSolveRequest(BaseModel):
    # Linear recurrence a_n = c1*a_{n-1} + c2*a_{n-2} + f(n)
    order: Literal[1, 2] = 2
    c1: float = Field(default=1.0, ge=-20.0, le=20.0)
    c2: float = Field(default=1.0, ge=-20.0, le=20.0)
    initial_a0: float = Field(default=0.0, ge=-1000.0, le=1000.0)
    initial_a1: float = Field(default=1.0, ge=-1000.0, le=1000.0)
    non_homogeneous_type: Literal["none", "constant", "linear", "exponential"] = "none"
    non_homogeneous_coeff: float = Field(default=0.0, ge=-50.0, le=50.0)
    non_homogeneous_base: float = Field(default=2.0, ge=-10.0, le=10.0)
    terms_count: int = Field(default=12, ge=3, le=25)
