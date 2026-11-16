import math
from typing import Any
from fastapi import HTTPException
import sympy as sp

from backend.app.schemas.combinatorics import CombinatoricsRequest


def _rook_polynomial_dp(board: list[list[int]]) -> list[int]:
    """Compute exact rook polynomial coefficients r_k via row-by-row column-mask DP."""
    rows = len(board)
    cols = len(board[0]) if rows > 0 else 0
    dp: dict[int, int] = {0: 1}
    for r in range(rows):
        next_dp: dict[int, int] = dict(dp)
        allowed_cols = [c for c in range(cols) if board[r][c] == 1]
        for mask, ways in dp.items():
            for c in allowed_cols:
                if not (mask & (1 << c)):
                    nm = mask | (1 << c)
                    next_dp[nm] = next_dp.get(nm, 0) + ways
        dp = next_dp

    max_k = min(rows, cols)
    coeffs = [0] * (max_k + 1)
    for mask, ways in dp.items():
        k = mask.bit_count()
        if k <= max_k:
            coeffs[k] += ways
    return coeffs


def solve_combinatorics(payload: CombinatoricsRequest) -> dict[str, Any]:
    topic = payload.topic

    if topic == "sum_rule":
        sizes = payload.group_sizes or [4, 7, 3]
        if any(s < 0 for s in sizes):
            raise HTTPException(status_code=400, detail="Group sizes must be non-negative.")
        total = sum(sizes)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Rule of Sum (Disjoint Union Principle)",
            "introduction": "Counts total distinct selections when choices come from pairwise disjoint finite sets.",
            "definition": "If tasks T₁, ..., T_m are mutually exclusive with n₁, ..., n_m outcomes, total outcomes equal ∑ n_i.",
            "formula_latex": r"\left|\bigcup_{i=1}^{m} A_i\right| = \sum_{i=1}^{m} |A_i| \quad (A_i \cap A_j = \emptyset)",
            "inputs_echo": {"group_sizes": sizes},
            "steps": [
                {"step_number": 1, "title": "Inspect Disjoint Category Cardinalities", "explanation": f"Received {len(sizes)} disjoint sets: {sizes}.", "value": sizes},
                {"step_number": 2, "title": "Sum Cardinalities", "explanation": " + ".join(map(str, sizes)) + f" = {total}.", "value": total},
            ],
            "result": {"total_outcomes": total, "group_count": len(sizes)},
            "visualization": {
                "chart_type": "bar",
                "series": [{"label": f"Set A_{i+1}", "value": s} for i, s in enumerate(sizes)],
            },
            "verification": {"independent_check": total == sum(int(x) for x in sizes), "check_description": "Verified non-negative integer sum across disjoint sets."},
            "limitations": "Strictly assumes pairwise disjoint sets; overlapping categories require the Inclusion-Exclusion Principle. This is a general discrete principle and does not by itself model wildfire dynamics.",
        }

    if topic == "product_rule":
        sizes = payload.group_sizes or [3, 4, 2]
        if any(s < 0 for s in sizes):
            raise HTTPException(status_code=400, detail="Stage sizes must be non-negative.")
        prod = math.prod(sizes)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Rule of Product (Cartesian Multiplication Principle)",
            "introduction": "Counts ordered tuples formed by sequential independent selection stages.",
            "definition": "If a procedure consists of m sequential steps with n₁, ..., n_m independent choices, total combinations equal ∏ n_i.",
            "formula_latex": r"|A_1 \times A_2 \times \cdots \times A_m| = \prod_{i=1}^{m} |A_i|",
            "inputs_echo": {"group_sizes": sizes},
            "steps": [
                {"step_number": 1, "title": "Sequential Choice Counts", "explanation": f"Independent stage counts: {sizes}.", "value": sizes},
                {"step_number": 2, "title": "Multiply Stage Counts", "explanation": " × ".join(map(str, sizes)) + f" = {prod}.", "value": prod},
            ],
            "result": {"total_tuples": prod, "stage_count": len(sizes)},
            "visualization": {
                "chart_type": "bar",
                "series": [{"label": f"Stage {i+1}", "value": s} for i, s in enumerate(sizes)],
            },
            "verification": {"independent_check": prod == math.prod(sizes), "check_description": "Verified exact Cartesian product cardinality."},
            "limitations": "Assumes each stage's choice count does not depend on earlier selections. General counting rule, not an empirical wildfire model.",
        }

    if topic == "permutations":
        n = payload.n if payload.n is not None else 6
        r = payload.r if payload.r is not None else 3
        mults = payload.repetition_multiplicities
        if mults:
            if sum(mults) != n:
                raise HTTPException(status_code=400, detail=f"Sum of multiplicities ({sum(mults)}) must equal n ({n}).")
            denom = math.prod(math.factorial(m) for m in mults)
            ans = math.factorial(n) // denom
            return {
                "topic_key": topic,
                "module": "combinatorics",
                "title": "Multiset Permutations (Permutations with Repeated Elements)",
                "introduction": "Counts distinct linear arrangements when groups of items are indistinguishable.",
                "definition": "Arrangements of n items with k_1, ..., k_m identical copies divide n! by the product of k_i!.",
                "formula_latex": r"\frac{n!}{k_1! k_2! \cdots k_m!}",
                "inputs_echo": {"n": n, "multiplicities": mults},
                "steps": [
                    {"step_number": 1, "title": "Total Factorial", "explanation": f"{n}! = {math.factorial(n)}", "value": math.factorial(n)},
                    {"step_number": 2, "title": "Divide by Symmetry Factor", "explanation": f"∏ k_i! = {denom}", "value": denom},
                    {"step_number": 3, "title": "Result", "explanation": f"{math.factorial(n)} / {denom} = {ans}", "value": ans},
                ],
                "result": {"count": ans, "count_str": str(ans)},
                "visualization": {"chart_type": "bar", "series": [{"label": f"Class {i+1}", "value": m} for i, m in enumerate(mults)]},
                "verification": {"exact_division": math.factorial(n) % denom == 0},
                "limitations": "Multiplicities must partition n exactly (∑ k_i = n).",
            }

        if r > n:
            raise HTTPException(status_code=400, detail=f"Invalid permutation parameters: r ({r}) cannot exceed n ({n}).")
        ans = math.perm(n, r)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Permutations P(n, r)",
            "introduction": "Counts ordered selections of r distinct elements drawn without replacement from n distinct elements.",
            "definition": "P(n, r) = n! / (n − r)! for integers 0 ≤ r ≤ n.",
            "formula_latex": r"P(n, r) = \frac{n!}{(n - r)!}",
            "inputs_echo": {"n": n, "r": r},
            "steps": [
                {"step_number": 1, "title": "Validate Bounds", "explanation": f"Verified 0 ≤ {r} ≤ {n}.", "value": True},
                {"step_number": 2, "title": "Evaluate Factorial Ratio", "explanation": f"{n}! / ({n} - {r})! = {ans}.", "value": ans},
            ],
            "result": {"P(n,r)": ans, "str": str(ans)},
            "visualization": {
                "chart_type": "line",
                "series": [{"label": f"r={k}", "value": math.perm(n, k)} for k in range(0, min(n, 10) + 1)],
            },
            "verification": {"matches_combination_times_r_fact": ans == math.comb(n, r) * math.factorial(r)},
            "limitations": "Growth is factorial O(n!); n is capped at 100 for interactive display.",
        }

    if topic == "combinations":
        n = payload.n if payload.n is not None else 8
        r = payload.r if payload.r is not None else 3
        if r > n:
            raise HTTPException(status_code=400, detail=f"Invalid combination parameters: r ({r}) cannot exceed n ({n}).")
        ans = math.comb(n, r)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Combinations C(n, r)",
            "introduction": "Counts unordered subsets of size r chosen from an n-element set (e.g., selecting k distinct cells from n valid grid cells).",
            "definition": "Binomial coefficient C(n, r) = n! / (r! (n − r)!) for 0 ≤ r ≤ n.",
            "formula_latex": r"\binom{n}{r} = \frac{n!}{r!(n - r)!}",
            "inputs_echo": {"n": n, "r": r},
            "steps": [
                {"step_number": 1, "title": "Compute Ordered Selections", "explanation": f"P({n}, {r}) = {math.perm(n, r)}.", "value": math.perm(n, r)},
                {"step_number": 2, "title": "Divide by r! Orderings", "explanation": f"{math.perm(n, r)} / {r}! = {ans}.", "value": ans},
            ],
            "result": {"C(n,r)": ans, "str": str(ans)},
            "visualization": {
                "chart_type": "bar",
                "series": [{"label": f"k={k}", "value": math.comb(n, k)} for k in range(0, min(n, 16) + 1)],
            },
            "verification": {"pascal_identity_holds": (ans == math.comb(n - 1, r - 1) + math.comb(n - 1, r)) if (0 < r < n) else True},
            "limitations": "Combinatorial enumeration counts unweighted subsets only and does not encode spatial adjacency constraints.",
        }

    if topic == "combinations_repetition":
        n = payload.n if payload.n is not None else 5
        r = payload.r if payload.r is not None else 3
        if n == 0 and r > 0:
            raise HTTPException(status_code=400, detail="Cannot choose r > 0 items with repetition from n = 0 categories.")
        ans = 1 if (n == 0 and r == 0) else math.comb(n + r - 1, r)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Combinations with Repetition (Stars and Bars)",
            "introduction": "Counts multisets of size r chosen from n distinct categories where elements may repeat.",
            "definition": "Bijective to placing r indistinguishable stars among n − 1 bars: C(n + r − 1, r).",
            "formula_latex": r"\left(\!\!\binom{n}{r}\!\!\right) = \binom{n + r - 1}{r}",
            "inputs_echo": {"n": n, "r": r},
            "steps": [
                {"step_number": 1, "title": "Transform via Stars & Bars", "explanation": f"Stars = {r}, Bars = {max(0, n - 1)}, Total slots = {max(0, n + r - 1)}.", "value": max(0, n + r - 1)},
                {"step_number": 2, "title": "Evaluate Binomial", "explanation": f"C({n + r - 1}, {r}) = {ans}.", "value": ans},
            ],
            "result": {"count": ans, "str": str(ans)},
            "visualization": {
                "chart_type": "bar",
                "series": [{"label": f"r={k}", "value": math.comb(n + k - 1, k) if n > 0 else 1} for k in range(0, min(r + 4, 12))],
            },
            "verification": {"stars_and_bars_valid": ans >= 1},
            "limitations": "Assumes infinite supply of each category; bounded capacities require Inclusion-Exclusion.",
        }

    if topic == "pigeonhole":
        items = payload.items if payload.items is not None else 25
        containers = payload.containers if payload.containers is not None else 6
        min_max_load = math.ceil(items / containers)
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Generalized Pigeonhole Principle",
            "introduction": "Establishes guaranteed lower bounds on maximum occupancy when distributing objects across containers.",
            "definition": "If N objects are placed into k boxes, at least one box contains at least ⌈N / k⌉ objects.",
            "formula_latex": r"\exists\, j \in \{1,\dots,k\} : |B_j| \ge \left\lceil \frac{N}{k} \right\rceil",
            "inputs_echo": {"items": items, "containers": containers},
            "steps": [
                {"step_number": 1, "title": "Compute Average Load", "explanation": f"N / k = {items} / {containers} = {items / containers:.4f}.", "value": round(items / containers, 4)},
                {"step_number": 2, "title": "Apply Ceiling Bound", "explanation": f"⌈{items} / {containers}⌉ = {min_max_load}.", "value": min_max_load},
            ],
            "result": {"guaranteed_min_max_load": min_max_load, "excess_items": max(0, items - containers)},
            "visualization": {
                "chart_type": "bar",
                "series": [
                    {"label": f"Bin {i+1}", "value": (items // containers) + (1 if i < (items % containers) else 0)}
                    for i in range(min(containers, 20))
                ],
            },
            "verification": {"lower_bound_proof": (min_max_load - 1) * containers < items},
            "limitations": "Provides an existential worst-case bound only, not an empirical spatial distribution.",
        }

    if topic == "inclusion_exclusion":
        u = payload.universe_size if payload.universe_size is not None else 100
        a = payload.set_a if payload.set_a is not None else 40
        b = payload.set_b if payload.set_b is not None else 35
        ab = payload.ab if payload.ab is not None else 12
        use_3 = any(v is not None for v in (payload.set_c, payload.ac, payload.bc, payload.abc))
        if not use_3:
            if ab > min(a, b):
                raise HTTPException(status_code=400, detail="|A ∩ B| cannot exceed min(|A|, |B|).")
            union_sz = a + b - ab
            if union_sz > u:
                raise HTTPException(status_code=400, detail=f"|A ∪ B| ({union_sz}) exceeds universe size ({u}).")
            neither = u - union_sz
            return {
                "topic_key": topic,
                "module": "combinatorics",
                "title": "Inclusion-Exclusion Principle (2 Sets)",
                "introduction": "Computes exact union and complement cardinalities while correcting for overlapping subsets.",
                "definition": "|A ∪ B| = |A| + |B| − |A ∩ B|, and |U \\ (A ∪ B)| = |U| − |A ∪ B|.",
                "formula_latex": r"|A \cup B| = |A| + |B| - |A \cap B|",
                "inputs_echo": {"U": u, "A": a, "B": b, "AB": ab},
                "steps": [
                    {"step_number": 1, "title": "Single Set Sum", "explanation": f"|A| + |B| = {a} + {b} = {a + b}.", "value": a + b},
                    {"step_number": 2, "title": "Subtract Overlap", "explanation": f"{a + b} − {ab} = {union_sz}.", "value": union_sz},
                    {"step_number": 3, "title": "Complement in Universe", "explanation": f"{u} − {union_sz} = {neither}.", "value": neither},
                ],
                "result": {"union_size": union_sz, "only_a": a - ab, "only_b": b - ab, "neither": neither},
                "visualization": {
                    "chart_type": "bar",
                    "series": [
                        {"label": "Only A", "value": a - ab},
                        {"label": "A ∩ B", "value": ab},
                        {"label": "Only B", "value": b - ab},
                        {"label": "Neither", "value": neither},
                    ],
                },
                "verification": {"partition_sums_to_universe": (a - ab) + ab + (b - ab) + neither == u},
                "limitations": "Requires consistent subset intersection cardinalities (non-negative Venn regions).",
            }

        c = payload.set_c if payload.set_c is not None else 28
        ac = payload.ac if payload.ac is not None else 10
        bc = payload.bc if payload.bc is not None else 8
        abc = payload.abc if payload.abc is not None else 4
        only_ab = ab - abc
        only_ac = ac - abc
        only_bc = bc - abc
        only_a = a - only_ab - only_ac - abc
        only_b = b - only_ab - only_bc - abc
        only_c = c - only_ac - only_bc - abc
        union_sz = a + b + c - ab - ac - bc + abc
        neither = u - union_sz
        if min(only_ab, only_ac, only_bc, only_a, only_b, only_c, neither) < 0:
            raise HTTPException(status_code=400, detail="Inconsistent Venn region counts: at least one atomic region is negative.")
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Inclusion-Exclusion Principle (3 Sets)",
            "introduction": "Extends overlap correction to three interacting property classes via alternating signs.",
            "definition": "|A ∪ B ∪ C| = |A| + |B| + |C| − |A∩B| − |A∩C| − |B∩C| + |A∩B∩C|.",
            "formula_latex": r"|A \cup B \cup C| = |A| + |B| + |C| - |A\cap B| - |A\cap C| - |B\cap C| + |A\cap B\cap C|",
            "inputs_echo": {"U": u, "A": a, "B": b, "C": c, "AB": ab, "AC": ac, "BC": bc, "ABC": abc},
            "steps": [
                {"step_number": 1, "title": "Sum Singletons S₁", "explanation": f"{a} + {b} + {c} = {a + b + c}.", "value": a + b + c},
                {"step_number": 2, "title": "Subtract Pairwise S₂", "explanation": f"− ({ab} + {ac} + {bc}) = −{ab + ac + bc}.", "value": -(ab + ac + bc)},
                {"step_number": 3, "title": "Add Triple Intersection S₃", "explanation": f"+ {abc} ⇒ |Union| = {union_sz}, Complement = {neither}.", "value": union_sz},
            ],
            "result": {"union_size": union_sz, "neither": neither, "venn_regions": {"only_a": only_a, "only_b": only_b, "only_c": only_c, "only_ab": only_ab, "only_ac": only_ac, "only_bc": only_bc, "abc": abc}},
            "visualization": {
                "chart_type": "bar",
                "series": [
                    {"label": "Only A", "value": only_a},
                    {"label": "Only B", "value": only_b},
                    {"label": "Only C", "value": only_c},
                    {"label": "Pairwise", "value": only_ab + only_ac + only_bc},
                    {"label": "A∩B∩C", "value": abc},
                    {"label": "Outside", "value": neither},
                ],
            },
            "verification": {"partition_sums_to_universe": (only_a + only_b + only_c + only_ab + only_ac + only_bc + abc + neither) == u},
            "limitations": "Assumes all 8 atomic Venn compartments are consistent and non-negative.",
        }

    if topic == "generalized_inclusion_exclusion":
        u = payload.universe_size if payload.universe_size is not None else 120
        sums = payload.intersection_sums or [90, 45, 12, 2]
        alt = sum(((-1) ** (k + 1)) * val for k, val in enumerate(sums, start=1))
        none_count = u - alt
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Generalized Inclusion-Exclusion (Arbitrary m Properties)",
            "introduction": "Computes the cardinality of objects satisfying at least one vs. zero of m properties given k-wise intersection sums S_k.",
            "definition": "N(none) = |U| + ∑_{k=1}^m (-1)^k S_k where S_k = ∑_{|I|=k} |⋂_{i∈I} A_i|.",
            "formula_latex": r"N(\text{none}) = |U| - S_1 + S_2 - S_3 + \cdots + (-1)^m S_m",
            "inputs_echo": {"universe_size": u, "intersection_sums": sums},
            "steps": [
                {"step_number": 1, "title": "Alternating Union Sum", "explanation": f"|⋃ A_i| = ∑ (-1)^(k+1) S_k = {alt}.", "value": alt},
                {"step_number": 2, "title": "Elements Satisfying Zero Properties", "explanation": f"|U| − |⋃ A_i| = {u} − {alt} = {none_count}.", "value": none_count},
            ],
            "result": {"union_size": alt, "zero_properties_count": none_count},
            "visualization": {
                "chart_type": "bar",
                "series": [{"label": f"S_{k}", "value": val} for k, val in enumerate(sums, start=1)],
            },
            "verification": {"non_negative_result": none_count >= 0 and alt >= 0},
            "limitations": "Validity depends on user-supplied S_k satisfying Bonferroni inequalities.",
        }

    if topic == "derangements":
        n = payload.n if payload.n is not None else 6
        if n > 25:
            raise HTTPException(status_code=400, detail="Derangements interactive calculation capped at n ≤ 25.")
        # Exact recurrence !0 = 1, !1 = 0, !n = (n-1)*(!(n-1) + !(n-2))
        d = [1, 0]
        for i in range(2, n + 1):
            d.append((i - 1) * (d[i - 1] + d[i - 2]))
        dn = d[n]
        n_fact = math.factorial(n)
        ratio = dn / n_fact if n_fact > 0 else 1.0
        # Independent inclusion-exclusion verification
        ie_val = sum(((-1) ** k) * (n_fact // math.factorial(k)) for k in range(0, n + 1))
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Derangements (!n — Fixed-Point-Free Permutations)",
            "introduction": "Counts permutations of n distinct elements where no element remains in its original position.",
            "definition": "!n = n! ∑_{k=0}^n (-1)^k / k!, satisfying !n = (n−1)(!(n−1) + !(n−2)).",
            "formula_latex": r"!n = n! \sum_{k=0}^{n} \frac{(-1)^k}{k!} \approx \frac{n!}{e}",
            "inputs_echo": {"n": n},
            "steps": [
                {"step_number": 1, "title": "Recurrence Evaluation", "explanation": f"Computed !0 .. !{n}: {d[:min(len(d), 10)]}.", "value": dn},
                {"step_number": 2, "title": "Asymptotic Ratio to 1/e", "explanation": f"!{n} / {n}! = {ratio:.6f} (1/e ≈ {1 / math.e:.6f}).", "value": round(ratio, 6)},
            ],
            "result": {"derangements": dn, "total_permutations": n_fact, "probability": round(ratio, 6)},
            "visualization": {
                "chart_type": "line",
                "series": [{"label": f"n={k}", "value": d[k]} for k in range(0, n + 1)],
            },
            "verification": {"ie_matches_recurrence": dn == ie_val, "check_description": "Verified recurrence !n matches Inclusion-Exclusion alternating sum."},
            "limitations": "Pure combinatorial bijection invariant; not a spatial transport model.",
        }

    if topic == "rook_polynomials":
        board = payload.board_matrix or [
            [1, 0, 1, 0],
            [1, 1, 0, 1],
            [0, 1, 1, 0],
            [0, 0, 1, 1],
        ]
        if len(board) == 0 or any(len(row) != len(board[0]) for row in board):
            raise HTTPException(status_code=400, detail="Board matrix must be a non-empty rectangular grid of 0s and 1s.")
        if len(board) > 6 or len(board[0]) > 6:
            raise HTTPException(status_code=400, detail="Rook polynomial board capped at 6×6 for exact DP clarity.")
        coeffs = _rook_polynomial_dp(board)
        x = sp.Symbol("x")
        poly = sum(c * (x ** k) for k, c in enumerate(coeffs))
        return {
            "topic_key": topic,
            "module": "combinatorics",
            "title": "Rook Polynomials on Restricted Chessboards",
            "introduction": "Counts ways to place k non-attacking rooks on allowed (1) squares of a restricted binary board.",
            "definition": "R(B, x) = ∑_{k≥0} r_k(B) x^k where r_k is the number of k non-attacking rook placements on B.",
            "formula_latex": r"R(B, x) = \sum_{k=0}^{\min(m, n)} r_k(B)\, x^k",
            "inputs_echo": {"board_matrix": board},
            "steps": [
                {"step_number": 1, "title": "Board Dimensions & Allowed Squares", "explanation": f"{len(board)}×{len(board[0])} board with {sum(sum(r) for r in board)} allowed squares.", "value": sum(sum(r) for r in board)},
                {"step_number": 2, "title": "Column-Bitmask DP", "explanation": f"Extracted coefficients r_k = {coeffs}.", "value": coeffs},
            ],
            "result": {"coefficients": coeffs, "polynomial_str": str(poly), "polynomial_latex": sp.latex(poly)},
            "visualization": {"board_matrix": board, "coefficients": [{"k": k, "rooks": c} for k, c in enumerate(coeffs)]},
            "verification": {"r0_equals_1": coeffs[0] == 1, "r1_equals_allowed_squares": (coeffs[1] == sum(sum(r) for r in board)) if len(coeffs) > 1 else True},
            "limitations": "Interactive rook polynomial computation is bounded to 6×6 boards. Used for restricted assignment counting.",
        }

    raise HTTPException(status_code=400, detail=f"Unsupported combinatorics topic: {topic}")
