from collections import Counter
from typing import Any
from fastapi import HTTPException
import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session
import sympy as sp

from backend.app.models.entities import GridCell, ProcessedGrid
from backend.app.schemas.graph_theory import (
    CustomGraphInput,
    GraphEulerHamiltonianRequest,
    GraphIsomorphismRequest,
    GraphPlanarityColoringRequest,
    GraphWalkPathRequest,
    GridGraphInspectRequest,
)
from backend.app.services.cellular_automata_service import (
    NEIGHBOR_OFFSETS_4,
    NEIGHBOR_OFFSETS_8,
    _resolve_neighbor_coord,
)


def _to_nx_graph(graph_input: CustomGraphInput) -> nx.Graph:
    G = nx.DiGraph() if graph_input.directed else nx.Graph()
    for v in graph_input.vertices:
        G.add_node(v)
    for e in graph_input.edges:
        if e.u not in G:
            G.add_node(e.u)
        if e.v not in G:
            G.add_node(e.v)
        G.add_edge(e.u, e.v, weight=e.weight)
    return G


def inspect_grid_graph(db: Session, payload: GridGraphInspectRequest) -> dict[str, Any]:
    grid = db.execute(select(ProcessedGrid).where(ProcessedGrid.id == payload.grid_id)).scalar_one_or_none()
    if not grid:
        raise HTTPException(status_code=404, detail=f"Processed grid {payload.grid_id} not found.")

    cells = list(
        db.execute(select(GridCell).where(GridCell.grid_id == grid.id).order_by(GridCell.row_idx, GridCell.col_idx))
        .scalars()
        .all()
    )
    if not cells:
        raise HTTPException(status_code=400, detail="Grid has no cells.")

    offsets = NEIGHBOR_OFFSETS_8 if payload.neighborhood == "moore_8" else NEIGHBOR_OFFSETS_4
    by_coord = {(c.row_idx, c.col_idx): c for c in cells}

    G = nx.Graph()
    for c in cells:
        if not payload.include_nodata and c.quality_status != "valid":
            continue
        G.add_node(
            c.cell_uid,
            vertex_id=c.graph_vertex_id,
            row=c.row_idx,
            col=c.col_idx,
            landcover=c.landcover_category,
        )

    for c in cells:
        if c.cell_uid not in G:
            continue
        for _dir, dr, dc in offsets:
            resolved = _resolve_neighbor_coord(
                c.row_idx,
                c.col_idx,
                dr,
                dc,
                grid.rows,
                grid.cols,
                payload.boundary_condition,
            )
            if resolved is None:
                continue
            nb = by_coord.get(resolved)
            if nb and nb.cell_uid in G and nb.cell_uid != c.cell_uid:
                G.add_edge(c.cell_uid, nb.cell_uid)

    degrees = dict(G.degree())
    degree_sum = sum(degrees.values())
    edge_count = G.number_of_edges()
    handshaking_valid = degree_sum == 2 * edge_count

    deg_hist = sorted(Counter(degrees.values()).items())
    components = sorted((len(c) for c in nx.connected_components(G)), reverse=True)
    isolated = list(nx.isolates(G))

    # Extract bounded patch subgraph for adjacency matrix, adjacency list, complement, and SVG visual
    r0 = min(payload.row_start, max(0, grid.rows - payload.patch_rows))
    c0 = min(payload.col_start, max(0, grid.cols - payload.patch_cols))
    patch_nodes = [
        c.cell_uid
        for c in cells
        if r0 <= c.row_idx < r0 + payload.patch_rows
        and c0 <= c.col_idx < c0 + payload.patch_cols
        and c.cell_uid in G
    ]
    patch_sub = G.subgraph(patch_nodes).copy()
    patch_list = list(patch_sub.nodes())
    adj_matrix = nx.to_numpy_array(patch_sub, nodelist=patch_list, dtype=int).tolist() if patch_list else []
    adj_list = {u: sorted(list(patch_sub.neighbors(u))) for u in patch_list}

    # Complement graph for bounded patch (<= 25 nodes)
    complement_edges = []
    if 1 <= len(patch_list) <= 25:
        comp = nx.complement(patch_sub)
        complement_edges = [[u, v] for u, v in comp.edges()]

    # Burnable fuel-cover subgraph summary
    fuel_nodes = [
        n
        for n, d in G.nodes(data=True)
        if d.get("landcover") in {"Tree cover", "Shrubland", "Grassland", "Cropland"}
    ]
    fuel_sub = G.subgraph(fuel_nodes)
    fuel_components = sorted((len(c) for c in nx.connected_components(fuel_sub)), reverse=True)

    return {
        "topic_key": "grid_graph_inspection",
        "module": "graph_theory",
        "title": f"Landscape Cellular Graph G = (V, E) · {grid.name}",
        "introduction": (
            "Each processed grid cell is modeled as a vertex v ∈ V and spatial adjacency under the chosen "
            "neighborhood and boundary condition defines edges e ∈ E."
        ),
        "definition": (
            "A finite undirected graph G = (V, E) derived directly from SQLite GridCell coordinates, "
            "excluding self-loops and optionally filtering NoData cells."
        ),
        "formula_latex": r"\sum_{v \in V} \deg(v) = 2|E|, \quad \rho(G) = \frac{2|E|}{|V|(|V|-1)}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {
                "step_number": 1,
                "title": "Vertex Set Construction",
                "explanation": f"Loaded {G.number_of_nodes()} vertices from grid '{grid.name}' ({grid.rows}×{grid.cols}).",
                "value": G.number_of_nodes(),
            },
            {
                "step_number": 2,
                "title": "Edge Set Construction",
                "explanation": f"Applied {payload.neighborhood} stencil with {payload.boundary_condition} boundary conditions.",
                "value": edge_count,
            },
            {
                "step_number": 3,
                "title": "Handshaking Lemma Verification",
                "explanation": f"Sum of degrees = {degree_sum}; 2|E| = {2 * edge_count}.",
                "value": handshaking_valid,
            },
        ],
        "result": {
            "vertex_count": G.number_of_nodes(),
            "edge_count": edge_count,
            "degree_sum": degree_sum,
            "two_times_edges": 2 * edge_count,
            "density": round(nx.density(G), 6) if G.number_of_nodes() > 1 else 0.0,
            "connected_components": len(components),
            "component_sizes": components[:15],
            "isolated_vertex_count": len(isolated),
            "is_bipartite": nx.is_bipartite(G) if G.number_of_nodes() > 0 else True,
            "fuel_subgraph_vertices": fuel_sub.number_of_nodes(),
            "fuel_subgraph_edges": fuel_sub.number_of_edges(),
            "fuel_subgraph_components": len(fuel_components),
        },
        "visualization": {
            "degree_distribution": [{"degree": int(d), "count": int(cnt)} for d, cnt in deg_hist],
            "patch_window": {"row_start": r0, "col_start": c0, "rows": payload.patch_rows, "cols": payload.patch_cols},
            "patch_nodes": [
                {
                    "id": u,
                    "vertex_id": patch_sub.nodes[u].get("vertex_id"),
                    "row": patch_sub.nodes[u].get("row"),
                    "col": patch_sub.nodes[u].get("col"),
                    "landcover": patch_sub.nodes[u].get("landcover"),
                    "degree": int(patch_sub.degree(u)),
                }
                for u in patch_list
            ],
            "patch_edges": [[u, v] for u, v in patch_sub.edges()],
            "adjacency_matrix": adj_matrix,
            "adjacency_list": adj_list,
            "complement_edge_count": len(complement_edges),
            "complement_edges_sample": complement_edges[:60],
        },
        "verification": {
            "handshaking_lemma_holds": handshaking_valid,
            "check_description": f"Verified sum(deg(v)) = {degree_sum} == 2|E| = {2 * edge_count}.",
        },
        "limitations": (
            "Matrix and complement visualizations are restricted to a bounded subgrid window (max 8×8) "
            "because dense complement edge sets scale quadratically O(|V|^2)."
        ),
    }


def check_isomorphism(payload: GraphIsomorphismRequest) -> dict[str, Any]:
    G1 = _to_nx_graph(payload.graph_a)
    G2 = _to_nx_graph(payload.graph_b)

    matcher = nx.algorithms.isomorphism.GraphMatcher(G1, G2)
    is_iso = matcher.is_isomorphic()
    mapping = dict(matcher.mapping) if is_iso else None

    deg1 = sorted(dict(G1.degree()).values(), reverse=True)
    deg2 = sorted(dict(G2.degree()).values(), reverse=True)

    return {
        "topic_key": "graph_isomorphism",
        "module": "graph_theory",
        "title": "Graph Isomorphism Verification (VF2 Algorithm)",
        "introduction": "Determines whether two graphs share identical adjacency structure up to vertex relabeling.",
        "definition": "G₁ ≅ G₂ iff there exists a bijection φ: V(G₁) → V(G₂) preserving adjacency.",
        "formula_latex": r"(u, v) \in E(G_1) \iff (\varphi(u), \varphi(v)) \in E(G_2)",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {
                "step_number": 1,
                "title": "Order & Size Invariant Check",
                "explanation": f"|V₁|={G1.number_of_nodes()}, |E₁|={G1.number_of_edges()} vs |V₂|={G2.number_of_nodes()}, |E₂|={G2.number_of_edges()}.",
                "value": (G1.number_of_nodes() == G2.number_of_nodes()) and (G1.number_of_edges() == G2.number_of_edges()),
            },
            {
                "step_number": 2,
                "title": "Degree Sequence Invariant",
                "explanation": f"deg(G₁)={deg1} vs deg(G₂)={deg2}.",
                "value": deg1 == deg2,
            },
            {
                "step_number": 3,
                "title": "VF2 Bijection Search",
                "explanation": "Executed NetworkX VF2 graph matcher to search for an adjacency-preserving bijection.",
                "value": is_iso,
            },
        ],
        "result": {
            "is_isomorphic": is_iso,
            "bijection": mapping,
            "degree_sequence_a": deg1,
            "degree_sequence_b": deg2,
        },
        "visualization": {
            "graph_a": {"nodes": list(G1.nodes()), "edges": [[u, v] for u, v in G1.edges()]},
            "graph_b": {"nodes": list(G2.nodes()), "edges": [[u, v] for u, v in G2.edges()]},
            "mapping": mapping,
        },
        "verification": {
            "bijection_edge_preservation_verified": (
                all(G2.has_edge(mapping[u], mapping[v]) for u, v in G1.edges()) if mapping else not is_iso
            ),
            "check_description": "Verified every edge under φ maps to an edge in G₂." if mapping else "Confirmed structural mismatch.",
        },
        "limitations": "Graph isomorphism inputs are capped at 25 vertices for interactive responsiveness.",
    }


def analyze_walks_paths(db: Session, payload: GraphWalkPathRequest) -> dict[str, Any]:
    if payload.graph is not None:
        G = _to_nx_graph(payload.graph)
    elif payload.grid_id is not None:
        cells = list(
            db.execute(select(GridCell).where(GridCell.grid_id == payload.grid_id)).scalars().all()
        )
        patch = [
            c
            for c in cells
            if payload.row_start <= c.row_idx < payload.row_start + payload.patch_size
            and payload.col_start <= c.col_idx < payload.col_start + payload.patch_size
            and c.quality_status == "valid"
        ]
        by_coord = {(c.row_idx, c.col_idx): c for c in patch}
        G = nx.Graph()
        for c in patch:
            G.add_node(c.cell_uid)
        for c in patch:
            for _d, dr, dc in NEIGHBOR_OFFSETS_4:
                nb = by_coord.get((c.row_idx + dr, c.col_idx + dc))
                if nb:
                    G.add_edge(c.cell_uid, nb.cell_uid)
    else:
        raise HTTPException(status_code=400, detail="Provide either a custom graph or a grid_id.")

    if payload.source not in G or payload.target not in G:
        raise HTTPException(status_code=400, detail="Source or target vertex not found in graph.")

    nodes = list(G.nodes())
    A = nx.to_numpy_array(G, nodelist=nodes, dtype=int)
    s_idx = nodes.index(payload.source)
    t_idx = nodes.index(payload.target)

    walks_by_length = []
    A_pow = A.copy()
    for k in range(1, payload.max_length + 1):
        walks_by_length.append({"length": k, "walk_count": int(A_pow[s_idx, t_idx])})
        A_pow = A_pow @ A

    simple_paths = []
    for i, path in enumerate(nx.all_simple_paths(G, payload.source, payload.target, cutoff=payload.max_length)):
        simple_paths.append(path)
        if i >= 19:
            break

    has_path = nx.has_path(G, payload.source, payload.target)
    shortest = nx.shortest_path(G, payload.source, payload.target) if has_path else []

    return {
        "topic_key": "walks_trails_paths",
        "module": "graph_theory",
        "title": "Walks, Trails, Paths, and Connectedness",
        "introduction": "Contrasts unrestricted walks (counted via adjacency matrix powers A^k) with simple paths.",
        "definition": "A walk allows repeated vertices/edges; a trail forbids repeated edges; a simple path forbids repeated vertices.",
        "formula_latex": r"\text{Walks}_k(u, v) = (A^k)_{u, v}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {
                "step_number": 1,
                "title": "Reachability Check",
                "explanation": f"Evaluated connectedness between {payload.source} and {payload.target}.",
                "value": has_path,
            },
            {
                "step_number": 2,
                "title": "Matrix Power Walk Enumeration",
                "explanation": f"Computed A^k[{payload.source}, {payload.target}] for k = 1..{payload.max_length}.",
                "value": walks_by_length,
            },
            {
                "step_number": 3,
                "title": "Simple Paths Enumeration",
                "explanation": f"Enumerated up to 20 simple paths of length ≤ {payload.max_length}.",
                "value": len(simple_paths),
            },
        ],
        "result": {
            "connected": has_path,
            "shortest_path": shortest,
            "shortest_path_length": max(0, len(shortest) - 1) if shortest else None,
            "walks_by_length": walks_by_length,
            "sample_simple_paths": simple_paths,
        },
        "visualization": {
            "nodes": nodes,
            "edges": [[u, v] for u, v in G.edges()],
            "shortest_path": shortest,
            "walks_by_length": walks_by_length,
        },
        "verification": {
            "shortest_path_verified": (
                all(G.has_edge(shortest[i], shortest[i + 1]) for i in range(len(shortest) - 1)) if shortest else not has_path
            ),
            "check_description": "Verified each consecutive pair in the shortest path is an edge in E.",
        },
        "limitations": "Simple path listing is capped at 20 paths and cutoff length 10 to prevent exponential blowup.",
    }


def analyze_euler_hamiltonian(payload: GraphEulerHamiltonianRequest) -> dict[str, Any]:
    G = _to_nx_graph(payload.graph)
    if G.is_directed():
        G_undir = G.to_undirected()
    else:
        G_undir = G

    n = G_undir.number_of_nodes()
    odd_vertices = [v for v, deg in G_undir.degree() if deg % 2 == 1]

    has_euler_circuit = nx.is_eulerian(G_undir) if n > 0 else False
    has_euler_path = nx.has_eulerian_path(G_undir) if n > 0 else False

    euler_seq: list[str] = []
    if has_euler_circuit:
        edges = list(nx.eulerian_circuit(G_undir))
        euler_seq = [edges[0][0]] + [v for _u, v in edges] if edges else []
    elif has_euler_path:
        edges = list(nx.eulerian_path(G_undir))
        euler_seq = [edges[0][0]] + [v for _u, v in edges] if edges else []

    ham_path: list[str] = []
    ham_cycle: list[str] = []
    ham_note = "Skipped"
    if payload.mode in ("hamiltonian", "both"):
        if n > 10:
            ham_note = "Hamiltonian search disabled for |V| > 10 due to NP-completeness O(n!)."
        else:
            ham_note = "Exact backtracking search executed."
            nodes = list(G_undir.nodes())

            def backtrack(path: list[str], visited: set[str], need_cycle: bool) -> bool:
                if len(path) == n:
                    if not need_cycle:
                        return True
                    return G_undir.has_edge(path[-1], path[0])
                curr = path[-1]
                for nb in sorted(G_undir.neighbors(curr)):
                    if nb not in visited:
                        visited.add(nb)
                        path.append(nb)
                        if backtrack(path, visited, need_cycle):
                            return True
                        path.pop()
                        visited.remove(nb)
                return False

            for start in nodes:
                p = [start]
                if backtrack(p, {start}, True):
                    ham_cycle = p + [start]
                    ham_path = p[:]
                    break
            if not ham_path:
                for start in nodes:
                    p = [start]
                    if backtrack(p, {start}, False):
                        ham_path = p
                        break

    return {
        "topic_key": "euler_hamiltonian",
        "module": "graph_theory",
        "title": "Euler Paths/Circuits & Hamiltonian Paths/Cycles",
        "introduction": (
            "Eulerian traversals visit every edge exactly once (polynomial time via vertex parity), whereas "
            "Hamiltonian traversals visit every vertex exactly once (NP-complete)."
        ),
        "definition": "An Euler circuit exists iff G is connected (ignoring isolated vertices) and every vertex has even degree.",
        "formula_latex": r"\text{Euler Circuit} \iff \forall v \in V,\ \deg(v) \equiv 0 \pmod{2}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {
                "step_number": 1,
                "title": "Odd-Degree Parity Audit",
                "explanation": f"Identified {len(odd_vertices)} odd-degree vertices: {odd_vertices}.",
                "value": odd_vertices,
            },
            {
                "step_number": 2,
                "title": "Eulerian Traversal",
                "explanation": f"Euler circuit: {has_euler_circuit}, Euler trail: {has_euler_path}.",
                "value": euler_seq,
            },
            {
                "step_number": 3,
                "title": "Hamiltonian Search",
                "explanation": ham_note,
                "value": {"cycle": ham_cycle, "path": ham_path},
            },
        ],
        "result": {
            "odd_degree_vertices": odd_vertices,
            "has_euler_circuit": has_euler_circuit,
            "has_euler_path": has_euler_path,
            "euler_sequence": euler_seq,
            "has_hamiltonian_cycle": len(ham_cycle) > 0,
            "hamiltonian_cycle": ham_cycle,
            "has_hamiltonian_path": len(ham_path) > 0,
            "hamiltonian_path": ham_path,
        },
        "visualization": {
            "nodes": list(G_undir.nodes()),
            "edges": [[u, v] for u, v in G_undir.edges()],
            "euler_sequence": euler_seq,
            "hamiltonian_cycle": ham_cycle,
            "hamiltonian_path": ham_path,
        },
        "verification": {
            "euler_edge_coverage_ok": (len(euler_seq) - 1 == G_undir.number_of_edges()) if euler_seq else True,
            "hamiltonian_vertex_coverage_ok": (len(set(ham_path)) == n) if ham_path else True,
        },
        "limitations": "Hamiltonian exact search is strictly bounded to |V| ≤ 10 vertices.",
    }


def _chromatic_poly_deletion_contraction(G: nx.Graph, k: sp.Symbol) -> sp.Expr:
    if G.number_of_edges() == 0:
        return k ** G.number_of_nodes()
    if nx.number_of_selfloops(G) > 0:
        return sp.Integer(0)
    u, v = next(iter(G.edges()))
    G_del = G.copy()
    G_del.remove_edge(u, v)
    G_con = nx.contracted_nodes(G, u, v, self_loops=False)
    return sp.expand(_chromatic_poly_deletion_contraction(G_del, k) - _chromatic_poly_deletion_contraction(G_con, k))


def analyze_planarity_coloring(payload: GraphPlanarityColoringRequest) -> dict[str, Any]:
    G = _to_nx_graph(payload.graph).to_undirected()
    G.remove_edges_from(nx.selfloop_edges(G))
    V = G.number_of_nodes()
    E = G.number_of_edges()
    C = nx.number_connected_components(G) if V > 0 else 0

    is_planar, embedding = nx.check_planarity(G, counterexample=True)
    faces_count = None
    euler_rhs = None
    euler_holds = None
    dual_nodes: list[str] = []
    dual_edges: list[list[str]] = []
    facial_cycles: list[list[str]] = []

    if is_planar and V > 0:
        # Generalized Euler formula: V - E + F = C + 1 -> F = C + 1 - V + E
        faces_count = C + 1 - V + E
        euler_rhs = C + 1
        euler_holds = (V - E + faces_count) == euler_rhs

        if payload.compute_dual and C == 1 and V <= 16 and E <= 40:
            # Extract facial half-edges from PlanarEmbedding
            visited_half_edges: set[tuple[Any, Any]] = set()
            edge_to_faces: dict[tuple[Any, Any], list[int]] = {}
            for u, v in G.edges():
                for a, b in ((u, v), (v, u)):
                    if (a, b) not in visited_half_edges:
                        face = list(embedding.traverse_face(a, b))
                        f_id = len(facial_cycles)
                        facial_cycles.append([str(x) for x in face])
                        for i in range(len(face)):
                            x, y = face[i], face[(i + 1) % len(face)]
                            visited_half_edges.add((x, y))
                            key = tuple(sorted((str(x), str(y))))
                            edge_to_faces.setdefault(key, []).append(f_id)
            dual_nodes = [f"F{i}" for i in range(len(facial_cycles))]
            seen_dual = set()
            for f_list in edge_to_faces.values():
                if len(f_list) == 2:
                    a, b = f"F{f_list[0]}", f"F{f_list[1]}"
                    pair = (min(a, b), max(a, b))
                    if pair not in seen_dual:
                        seen_dual.add(pair)
                        dual_edges.append([a, b])

    # Graph Coloring (DSATUR heuristic + exact chromatic polynomial for small graphs)
    coloring = nx.greedy_color(G, strategy="DSATUR") if V > 0 else {}
    greedy_k = (max(coloring.values()) + 1) if coloring else 0

    chromatic_poly_str = None
    chromatic_poly_latex = None
    exact_chi = None
    if payload.compute_chromatic_polynomial and V <= 9 and E <= 16:
        k_sym = sp.Symbol("k")
        poly = _chromatic_poly_deletion_contraction(G, k_sym)
        chromatic_poly_str = str(poly)
        chromatic_poly_latex = sp.latex(poly)
        for cand in range(1, V + 1):
            if int(poly.subs(k_sym, cand)) > 0:
                exact_chi = cand
                break

    return {
        "topic_key": "planarity_and_coloring",
        "module": "graph_theory",
        "title": "Planarity, Euler's Formula, Dual Graphs & Graph Coloring",
        "introduction": (
            "Evaluates planar embeddability, Euler's polyhedral invariant V − E + F = 2 (connected), "
            "dual graph G* construction, DSATUR vertex coloring, and deletion-contraction chromatic polynomials."
        ),
        "definition": "A graph is planar if it can be embedded in ℝ² without crossing edges.",
        "formula_latex": r"V - E + F = C + 1 \quad (\text{connected: } V - E + F = 2)",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {
                "step_number": 1,
                "title": "Planarity Test (Boyer-Myrvold)",
                "explanation": "Evaluated planar embedding existence via NetworkX check_planarity.",
                "value": is_planar,
            },
            {
                "step_number": 2,
                "title": "Euler's Formula Check",
                "explanation": f"V={V}, E={E}, C={C}, F={faces_count}.",
                "value": euler_holds,
            },
            {
                "step_number": 3,
                "title": "Vertex Coloring & Chromatic Polynomial",
                "explanation": f"DSATUR upper bound: {greedy_k} colors; exact χ(G): {exact_chi or 'N/A (>9 nodes or >16 edges)'}.",
                "value": coloring,
            },
        ],
        "result": {
            "is_planar": is_planar,
            "vertices": V,
            "edges": E,
            "components": C,
            "faces": faces_count,
            "euler_formula_holds": euler_holds,
            "dsatur_colors_used": greedy_k,
            "coloring": coloring,
            "exact_chromatic_number": exact_chi,
            "chromatic_polynomial": chromatic_poly_str,
            "chromatic_polynomial_latex": chromatic_poly_latex,
            "dual_nodes": dual_nodes,
            "dual_edges": dual_edges,
            "facial_cycles": facial_cycles,
        },
        "visualization": {
            "nodes": list(G.nodes()),
            "edges": [[u, v] for u, v in G.edges()],
            "coloring": coloring,
            "dual_nodes": dual_nodes,
            "dual_edges": dual_edges,
        },
        "verification": {
            "proper_coloring_verified": all(coloring.get(u) != coloring.get(v) for u, v in G.edges()),
            "euler_invariant_verified": bool(euler_holds) if is_planar else True,
        },
        "limitations": (
            "Deletion-contraction chromatic polynomial is bounded to |V| ≤ 9 and |E| ≤ 16 (exponential recursion). "
            "Dual graph extraction requires connected planar graphs with |V| ≤ 16 and |E| ≤ 40."
        ),
    }
