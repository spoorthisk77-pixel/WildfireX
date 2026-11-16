from typing import Literal, Optional
from pydantic import BaseModel, Field


CombinatoricsTopic = Literal[
    "sum_rule",
    "product_rule",
    "permutations",
    "combinations",
    "combinations_repetition",
    "pigeonhole",
    "inclusion_exclusion",
    "generalized_inclusion_exclusion",
    "derangements",
    "rook_polynomials",
]


class CombinatoricsRequest(BaseModel):
    topic: CombinatoricsTopic
    # Counting / P(n,r) / C(n,r) / Derangements
    n: Optional[int] = Field(default=None, ge=0, le=100)
    r: Optional[int] = Field(default=None, ge=0, le=100)
    # Sum / Product rule category sizes
    group_sizes: Optional[list[int]] = Field(default=None, max_length=10)
    # Multiset permutations counts (optional)
    repetition_multiplicities: Optional[list[int]] = Field(default=None, max_length=12)
    # Pigeonhole: items (pigeons) and containers (holes)
    items: Optional[int] = Field(default=None, ge=0, le=100000)
    containers: Optional[int] = Field(default=None, ge=1, le=10000)
    # Inclusion-Exclusion (2 or 3 sets)
    universe_size: Optional[int] = Field(default=None, ge=0, le=1000000)
    set_a: Optional[int] = Field(default=None, ge=0, le=1000000)
    set_b: Optional[int] = Field(default=None, ge=0, le=1000000)
    set_c: Optional[int] = Field(default=None, ge=0, le=1000000)
    ab: Optional[int] = Field(default=None, ge=0, le=1000000)
    ac: Optional[int] = Field(default=None, ge=0, le=1000000)
    bc: Optional[int] = Field(default=None, ge=0, le=1000000)
    abc: Optional[int] = Field(default=None, ge=0, le=1000000)
    # Generalized Inclusion-Exclusion: S_1, S_2, ... (sum of k-wise intersections)
    intersection_sums: Optional[list[int]] = Field(default=None, max_length=10)
    # Rook polynomials: binary matrix (1 = allowed square, 0 = forbidden)
    board_matrix: Optional[list[list[int]]] = Field(default=None, max_length=6)
