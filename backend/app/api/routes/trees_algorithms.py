from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.schemas.math_common import MathTopicResponse
from backend.app.schemas.trees_algorithms import (
    BinaryTreeTraversalRequest,
    HuffmanRequest,
    SortingDemoRequest,
    TreePropertiesRequest,
    WeightedGraphAlgoRequest,
)
from backend.app.services.trees_algorithms_service import (
    analyze_binary_tree_traversals,
    analyze_tree_properties,
    compute_huffman_codes,
    run_sorting_demo,
    run_weighted_graph_algorithm,
)

router = APIRouter(prefix="/math/trees-algorithms", tags=["Module V: Trees & Algorithms"])


@router.post("/tree-properties", response_model=MathTopicResponse)
def route_tree_properties(payload: TreePropertiesRequest):
    return analyze_tree_properties(payload)


@router.post("/binary-traversal", response_model=MathTopicResponse)
def route_binary_traversal(payload: BinaryTreeTraversalRequest):
    return analyze_binary_tree_traversals(payload)


@router.post("/huffman", response_model=MathTopicResponse)
def route_huffman(payload: HuffmanRequest):
    return compute_huffman_codes(payload)


@router.post("/weighted-graph", response_model=MathTopicResponse)
def route_weighted_graph(payload: WeightedGraphAlgoRequest, db: Session = Depends(get_db)):
    return run_weighted_graph_algorithm(db, payload)


@router.post("/sorting", response_model=MathTopicResponse)
def route_sorting(payload: SortingDemoRequest):
    return run_sorting_demo(payload)
