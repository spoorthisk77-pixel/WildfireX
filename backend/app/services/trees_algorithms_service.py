from collections import deque
import heapq
from typing import Any
from fastapi import HTTPException
import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.entities import GridCell, ProcessedGrid
from backend.app.schemas.trees_algorithms import (
    BinaryTreeTraversalRequest,
    HuffmanRequest,
    SortingDemoRequest,
    TreePropertiesRequest,
    WeightedGraphAlgoRequest,
)
from backend.app.services.cellular_automata_service import ABSTRACT_SUSCEPTIBILITY, NEIGHBOR_OFFSETS_4


def analyze_tree_properties(payload: TreePropertiesRequest) -> dict[str, Any]:
    G = nx.Graph()
    for v in payload.vertices:
        G.add_node(v)
    for e in payload.edges:
        G.add_edge(e.u, e.v, weight=e.weight)

    V = G.number_of_nodes()
    E = G.number_of_edges()
    is_tree = nx.is_tree(G)
    is_forest = nx.is_forest(G)
    total_weight = sum(d.get("weight", 1.0) for _, _, d in G.edges(data=True))

    root = payload.root or payload.vertices[0]
    if root not in G:
        raise HTTPException(status_code=400, detail=f"Root '{root}' not found in vertex list.")

    levels: dict[str, int] = {}
    parents: dict[str, str | None] = {}
    children_map: dict[str, list[str]] = {v: [] for v in G.nodes()}
    leaves: list[str] = []

    if nx.is_connected(G) and is_tree:
        bfs_tree = nx.bfs_tree(G, root)
        for node in bfs_tree.nodes():
            levels[node] = nx.shortest_path_length(bfs_tree, root, node)
            preds = list(bfs_tree.predecessors(node))
            parents[node] = preds[0] if preds else None
            ch = list(bfs_tree.successors(node))
            children_map[node] = ch
            if len(ch) == 0 and node != root:
                leaves.append(node)

    height = max(levels.values()) if levels else 0
    return {
        "topic_key": "tree_properties",
        "module": "trees_algorithms",
        "title": "Tree & Rooted Weighted Tree Properties",
        "introduction": "Verifies whether G = (V, E) satisfies tree axioms (connected, acyclic, |E| = |V| − 1) and computes rooted hierarchy.",
        "definition": "A graph T is a tree iff it is connected and acyclic, equivalently connected with |E| = |V| − 1.",
        "formula_latex": r"|E| = |V| - 1 \quad \text{and} \quad \text{acyclic} \iff T \text{ is a tree}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Check Connectivity & Edge Count", "explanation": f"|V|={V}, |E|={E}, connected={nx.is_connected(G)}.", "value": is_tree},
            {"step_number": 2, "title": "Rooted Hierarchy & Leaves", "explanation": f"Rooted at '{root}'; height={height}; leaves={leaves}.", "value": height},
        ],
        "result": {
            "is_tree": is_tree,
            "is_forest": is_forest,
            "vertices": V,
            "edges": E,
            "total_weight": round(total_weight, 4),
            "root": root,
            "height": height,
            "leaves": leaves,
            "levels": levels,
            "children_map": children_map,
        },
        "visualization": {
            "nodes": [{"id": v, "level": levels.get(v, 0)} for v in G.nodes()],
            "edges": [[u, v, d.get("weight", 1.0)] for u, v, d in G.edges(data=True)],
        },
        "verification": {"edge_count_matches_tree_theorem": is_tree == (nx.is_connected(G) and E == V - 1)},
        "limitations": "Rooted depth and leaf metrics require the input graph to be a single connected tree.",
    }


def analyze_binary_tree_traversals(payload: BinaryTreeTraversalRequest) -> dict[str, Any]:
    nodes_map = {n.label: n for n in payload.nodes}
    if payload.root not in nodes_map:
        raise HTTPException(status_code=400, detail=f"Root '{payload.root}' not found in nodes list.")

    preorder: list[str] = []
    inorder: list[str] = []
    postorder: list[str] = []
    visited: set[str] = set()

    def walk(curr: str | None) -> None:
        if curr is None:
            return
        if curr not in nodes_map:
            raise HTTPException(status_code=400, detail=f"Child reference '{curr}' missing from node definitions.")
        if curr in visited:
            raise HTTPException(status_code=400, detail=f"Cycle detected at node '{curr}'; not a binary tree.")
        visited.add(curr)
        node = nodes_map[curr]
        preorder.append(curr)
        walk(node.left)
        inorder.append(curr)
        walk(node.right)
        postorder.append(curr)

    walk(payload.root)

    # Level-order BFS
    level_order: list[str] = []
    q: deque[str] = deque([payload.root])
    while q:
        u = q.popleft()
        level_order.append(u)
        nd = nodes_map[u]
        if nd.left:
            q.append(nd.left)
        if nd.right:
            q.append(nd.right)

    edges = []
    for n in payload.nodes:
        if n.left:
            edges.append([n.label, n.left, "L"])
        if n.right:
            edges.append([n.label, n.right, "R"])

    return {
        "topic_key": "binary_tree_traversals",
        "module": "trees_algorithms",
        "title": "Binary Tree Traversals (Preorder, Inorder, Postorder, Level-Order)",
        "introduction": "Executes deterministic recursive and breadth-first tree traversals over explicit left/right child pointers.",
        "definition": "Preorder (N-L-R), Inorder (L-N-R), Postorder (L-R-N), and BFS Level-Order.",
        "formula_latex": r"|\text{Preorder}| = |\text{Inorder}| = |\text{Postorder}| = |V|",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Preorder (Root-Left-Right)", "explanation": " → ".join(preorder), "value": preorder},
            {"step_number": 2, "title": "Inorder (Left-Root-Right)", "explanation": " → ".join(inorder), "value": inorder},
            {"step_number": 3, "title": "Postorder (Left-Right-Root)", "explanation": " → ".join(postorder), "value": postorder},
        ],
        "result": {"preorder": preorder, "inorder": inorder, "postorder": postorder, "level_order": level_order},
        "visualization": {"root": payload.root, "nodes": [n.model_dump() for n in payload.nodes], "edges": edges},
        "verification": {"all_traversals_same_cardinality": len(preorder) == len(inorder) == len(postorder) == len(level_order)},
        "limitations": "Binary tree input capped at 31 nodes and must be acyclic.",
    }


def compute_huffman_codes(payload: HuffmanRequest) -> dict[str, Any]:
    symbols = payload.symbols
    # Heap items: (freq, tie_id, node_dict)
    heap: list[tuple[float, int, dict[str, Any]]] = []
    uid = 0
    for s in symbols:
        heapq.heappush(heap, (s.frequency, uid, {"symbol": s.symbol, "freq": s.frequency, "left": None, "right": None}))
        uid += 1

    merge_steps = []
    step_no = 1
    while len(heap) > 1:
        f1, _, left = heapq.heappop(heap)
        f2, _, right = heapq.heappop(heap)
        merged = {"symbol": f"{left['symbol']}+{right['symbol']}", "freq": f1 + f2, "left": left, "right": right}
        merge_steps.append({
            "step_number": step_no,
            "title": f"Merge Lowest Weights ({left['symbol']}, {right['symbol']})",
            "explanation": f"{f1:.2f} + {f2:.2f} = {f1 + f2:.2f}",
            "value": round(f1 + f2, 4),
        })
        step_no += 1
        heapq.heappush(heap, (f1 + f2, uid, merged))
        uid += 1

    root = heap[0][2]
    codes: dict[str, str] = {}

    def assign(node: dict[str, Any], prefix: str) -> None:
        if node["left"] is None and node["right"] is None:
            codes[node["symbol"]] = prefix or "0"
            return
        if node["left"] is not None:
            assign(node["left"], prefix + "0")
        if node["right"] is not None:
            assign(node["right"], prefix + "1")

    assign(root, "")

    total_freq = sum(s.frequency for s in symbols)
    avg_len = sum((s.frequency / total_freq) * len(codes[s.symbol]) for s in symbols)
    kraft_sum = sum(2.0 ** (-len(c)) for c in codes.values())

    # Prefix-free check
    code_list = list(codes.values())
    prefix_free = all(
        not (c2.startswith(c1))
        for i, c1 in enumerate(code_list)
        for j, c2 in enumerate(code_list)
        if i != j
    )

    encoded_sample = None
    if payload.sample_text:
        encoded_sample = " ".join(codes.get(ch, "?") for ch in payload.sample_text)

    table = [
        {
            "symbol": s.symbol,
            "frequency": s.frequency,
            "probability": round(s.frequency / total_freq, 4),
            "codeword": codes[s.symbol],
            "length": len(codes[s.symbol]),
        }
        for s in sorted(symbols, key=lambda item: (-item.frequency, item.symbol))
    ]

    return {
        "topic_key": "huffman_coding",
        "module": "trees_algorithms",
        "title": "Optimal Prefix Codes & Huffman Coding Tree",
        "introduction": "Constructs a minimum-redundancy prefix-free binary code tree from symbol frequencies.",
        "definition": "Greedily merges the two lowest-frequency nodes until a single optimal binary tree remains.",
        "formula_latex": r"L_{\text{avg}} = \sum_{i} p_i \ell_i, \qquad \sum_{i} 2^{-\ell_i} \le 1 \text{ (Kraft's Inequality)}",
        "inputs_echo": payload.model_dump(),
        "steps": merge_steps,
        "result": {
            "code_table": table,
            "average_code_length_bits": round(avg_len, 4),
            "kraft_sum": round(kraft_sum, 6),
            "is_prefix_free": prefix_free,
            "encoded_sample": encoded_sample,
        },
        "visualization": {"code_table": table, "tree_root": root},
        "verification": {"prefix_free_and_kraft_satisfied": prefix_free and (kraft_sum <= 1.0 + 1e-9)},
        "limitations": "Huffman coding guarantees optimality over integer-length symbol-by-symbol prefix codes only.",
    }


def run_weighted_graph_algorithm(db: Session, payload: WeightedGraphAlgoRequest) -> dict[str, Any]:
    G = nx.Graph()
    node_meta: dict[str, dict[str, Any]] = {}

    if payload.grid_id is not None:
        grid = db.execute(select(ProcessedGrid).where(ProcessedGrid.id == payload.grid_id)).scalar_one_or_none()
        if not grid:
            raise HTTPException(status_code=404, detail=f"Processed grid {payload.grid_id} not found.")
        cells = list(db.execute(select(GridCell).where(GridCell.grid_id == grid.id)).scalars().all())
        r0 = min(payload.row_start, max(0, grid.rows - payload.patch_size))
        c0 = min(payload.col_start, max(0, grid.cols - payload.patch_size))
        patch = [
            c for c in cells
            if r0 <= c.row_idx < r0 + payload.patch_size and c0 <= c.col_idx < c0 + payload.patch_size and c.quality_status == "valid"
        ]
        if len(patch) < 2:
            raise HTTPException(status_code=400, detail="Selected grid patch contains fewer than 2 valid cells.")
        by_coord = {(c.row_idx, c.col_idx): c for c in patch}
        for c in patch:
            G.add_node(c.cell_uid)
            node_meta[c.cell_uid] = {"row": c.row_idx, "col": c.col_idx, "landcover": c.landcover_category}
        for c in patch:
            for _d, dr, dc in NEIGHBOR_OFFSETS_4:
                nb = by_coord.get((c.row_idx + dr, c.col_idx + dc))
                if nb and nb.cell_uid != c.cell_uid and not G.has_edge(c.cell_uid, nb.cell_uid):
                    # Abstract traversal resistance weight (higher when water/non-burnable, lower on dense landcover)
                    s1 = ABSTRACT_SUSCEPTIBILITY.get(c.landcover_category, 0.3)
                    s2 = ABSTRACT_SUSCEPTIBILITY.get(nb.landcover_category, 0.3)
                    avg_s = max(0.05, (s1 + s2) / 2.0)
                    w = round(1.0 / avg_s, 2)
                    G.add_edge(c.cell_uid, nb.cell_uid, weight=w)
    else:
        if not payload.vertices or not payload.edges:
            raise HTTPException(status_code=400, detail="Provide either grid_id or custom vertices & weighted edges.")
        for v in payload.vertices:
            G.add_node(v)
        for e in payload.edges:
            G.add_edge(e.u, e.v, weight=e.weight)

    if G.number_of_nodes() < 2:
        raise HTTPException(status_code=400, detail="Graph must have at least 2 vertices.")

    nodes = list(G.nodes())
    src = payload.source_vertex if (payload.source_vertex in G) else nodes[0]
    dst = payload.target_vertex if (payload.target_vertex in G) else nodes[-1]

    steps = []
    selected_edges: list[dict[str, Any]] = []
    total_weight = 0.0
    shortest_path: list[str] = []

    if payload.algorithm in ("kruskal", "prim"):
        mst_edges = list(nx.minimum_spanning_edges(G, algorithm=payload.algorithm, data=True))
        for idx, (u, v, data) in enumerate(mst_edges, start=1):
            w = float(data.get("weight", 1.0))
            total_weight += w
            selected_edges.append({"u": u, "v": v, "weight": w})
            steps.append({
                "step_number": idx,
                "title": f"Accept Edge ({u}, {v})",
                "explanation": f"Added edge weight {w:.2f}; cumulative MST weight = {total_weight:.2f}.",
                "value": w,
            })
        title = f"{payload.algorithm.title()}'s Minimum Spanning Tree"
        latex = r"w(T^*) = \min_{T \in \mathcal{T}(G)} \sum_{e \in T} w(e)"
    elif payload.algorithm == "dijkstra":
        if not nx.has_path(G, src, dst):
            raise HTTPException(status_code=400, detail=f"No path between {src} and {dst}.")
        shortest_path = nx.dijkstra_path(G, src, dst, weight="weight")
        total_weight = float(nx.dijkstra_path_length(G, src, dst, weight="weight"))
        dists, paths = nx.single_source_dijkstra(G, src, weight="weight")
        for i in range(len(shortest_path) - 1):
            u, v = shortest_path[i], shortest_path[i + 1]
            w = float(G[u][v]["weight"])
            selected_edges.append({"u": u, "v": v, "weight": w})
            steps.append({
                "step_number": i + 1,
                "title": f"Step {u} → {v}",
                "explanation": f"Edge weight {w:.2f}; cumulative distance from {src} = {dists[v]:.2f}.",
                "value": dists[v],
            })
        title = f"Dijkstra's Shortest Path ({src} → {dst})"
        latex = r"d(v) = \min_{(u,v) \in E} \big(d(u) + w(u, v)\big)"
    else:  # bfs_spanning_tree
        T = nx.bfs_tree(G, src)
        for idx, (u, v) in enumerate(T.edges(), start=1):
            w = float(G[u][v].get("weight", 1.0))
            total_weight += w
            selected_edges.append({"u": u, "v": v, "weight": w})
            steps.append({"step_number": idx, "title": f"BFS Edge ({u} → {v})", "explanation": f"Visited {v} from {u} (weight {w:.2f}).", "value": w})
        title = f"BFS Spanning Tree from {src}"
        latex = r"T_{\text{BFS}} \subseteq G, \quad |E(T_{\text{BFS}})| = |V_c| - 1"

    return {
        "topic_key": f"graph_algo_{payload.algorithm}",
        "module": "trees_algorithms",
        "title": title,
        "introduction": "Executes classic graph & tree optimization algorithms using NetworkX over custom weighted graphs or real landscape subgrid patches.",
        "definition": "All weights are strictly positive; edge weights on grid patches represent abstract mathematical resistance (not operational fire spread rates).",
        "formula_latex": latex,
        "inputs_echo": payload.model_dump(),
        "steps": steps,
        "result": {
            "algorithm": payload.algorithm,
            "source_vertex": src,
            "target_vertex": dst,
            "total_weight": round(total_weight, 4),
            "selected_edges": selected_edges,
            "shortest_path": shortest_path,
        },
        "visualization": {
            "nodes": [{"id": n, **(node_meta.get(n, {}))} for n in G.nodes()],
            "all_edges": [[u, v, float(d.get("weight", 1.0))] for u, v, d in G.edges(data=True)],
            "selected_edges": [[e["u"], e["v"]] for e in selected_edges],
            "shortest_path": shortest_path,
        },
        "verification": {
            "acyclic_tree_check": nx.is_forest(nx.Graph([(e["u"], e["v"]) for e in selected_edges])) if selected_edges else True,
        },
        "limitations": "Grid patch extraction is capped at 6×6 (36 vertices) so graph edge selections remain visually inspectable.",
    }


def run_sorting_demo(payload: SortingDemoRequest) -> dict[str, Any]:
    arr = list(payload.values)
    steps: list[dict[str, Any]] = []
    step_no = 1

    def record(title: str, explanation: str, snapshot: list[float]) -> None:
        nonlocal step_no
        steps.append({"step_number": step_no, "title": title, "explanation": explanation, "value": snapshot[:]})
        step_no += 1

    if payload.algorithm == "insertion_sort":
        for i in range(1, len(arr)):
            key = arr[i]
            j = i - 1
            while j >= 0 and arr[j] > key:
                arr[j + 1] = arr[j]
                j -= 1
            arr[j + 1] = key
            record(f"Insert element index {i} ({key})", f"Array state: {arr}", arr)
        latex = r"T(n) = \mathcal{O}(n^2) \text{ worst-case}, \quad \Omega(n) \text{ best-case}"
    elif payload.algorithm == "merge_sort":
        def merge_sort(sub: list[float], offset: int) -> list[float]:
            if len(sub) <= 1:
                return sub
            mid = len(sub) // 2
            left = merge_sort(sub[:mid], offset)
            right = merge_sort(sub[mid:], offset + mid)
            merged: list[float] = []
            i = j = 0
            while i < len(left) and j < len(right):
                if left[i] <= right[j]:
                    merged.append(left[i])
                    i += 1
                else:
                    merged.append(right[j])
                    j += 1
            merged.extend(left[i:])
            merged.extend(right[j:])
            arr[offset : offset + len(merged)] = merged
            record(f"Merge slice [{offset}:{offset + len(merged)}]", f"Merged {left} + {right} → {merged}", arr)
            return merged

        arr = merge_sort(arr, 0)
        latex = r"T(n) = 2T(n/2) + \Theta(n) = \Theta(n \log n)"
    else:  # quick_sort
        def quicksort(lo: int, hi: int) -> None:
            if lo >= hi:
                return
            pivot = arr[hi]
            i = lo
            for j in range(lo, hi):
                if arr[j] <= pivot:
                    arr[i], arr[j] = arr[j], arr[i]
                    i += 1
            arr[i], arr[hi] = arr[hi], arr[i]
            record(f"Partition pivot {pivot} at index {i}", f"Array state: {arr}", arr)
            quicksort(lo, i - 1)
            quicksort(i + 1, hi)

        quicksort(0, len(arr) - 1)
        latex = r"T(n) = \Theta(n \log n) \text{ expected}, \quad \mathcal{O}(n^2) \text{ worst-case}"

    return {
        "topic_key": f"sorting_{payload.algorithm}",
        "module": "trees_algorithms",
        "title": f"Sorting Algorithm Trace · {payload.algorithm.replace('_', ' ').title()}",
        "introduction": "Demonstrates divide-and-conquer / incremental comparison sorting with step-by-step array snapshots.",
        "definition": "Produces a monotonically non-decreasing permutation of the input array.",
        "formula_latex": latex,
        "inputs_echo": payload.model_dump(),
        "steps": steps,
        "result": {"sorted_values": arr, "step_count": len(steps)},
        "visualization": {"series": [{"index": i, "value": v} for i, v in enumerate(arr)]},
        "verification": {"is_sorted_and_permutation": arr == sorted(payload.values)},
        "limitations": "Interactive trace capped at 16 numeric values.",
    }
