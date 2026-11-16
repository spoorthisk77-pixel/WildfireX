import math
from typing import Any
from fastapi import HTTPException
import sympy as sp
from sympy.parsing.sympy_parser import (
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

from backend.app.schemas.generating_recurrence import (
    CountingSequenceRequest,
    EGFRequest,
    OGFRequest,
    PartitionsRequest,
    RecurrenceSolveRequest,
)

_SYMPY_TRANSFORMS = standard_transformations + (implicit_multiplication_application,)
_ALLOWED_SYMPY_LOCALS = {
    "x": sp.Symbol("x"),
    "exp": sp.exp,
    "sin": sp.sin,
    "cos": sp.cos,
    "log": sp.log,
    "sqrt": sp.sqrt,
    "E": sp.E,
}


_SAFE_SYMPY_GLOBALS = {
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
    "Symbol": sp.Symbol,
}


def _safe_parse_sympy(expr_str: str) -> sp.Expr:
    cleaned = expr_str.replace("^", "**").strip()
    if "__" in cleaned or "import" in cleaned or "lambda" in cleaned:
        raise HTTPException(status_code=400, detail="Disallowed token in symbolic expression.")
    try:
        expr = parse_expr(
            cleaned,
            local_dict=_ALLOWED_SYMPY_LOCALS,
            global_dict=_SAFE_SYMPY_GLOBALS,
            transformations=_SYMPY_TRANSFORMS,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid mathematical expression '{expr_str}': {exc}") from exc
    if expr.free_symbols - {_ALLOWED_SYMPY_LOCALS["x"]}:
        raise HTTPException(status_code=400, detail="Only variable 'x' is permitted in generating function expressions.")
    return expr


def analyze_ogf(payload: OGFRequest) -> dict[str, Any]:
    x = _ALLOWED_SYMPY_LOCALS["x"]
    if payload.sequence_terms:
        terms = [sp.nsimplify(v) for v in payload.sequence_terms]
        poly = sum(t * (x ** k) for k, t in enumerate(terms))
        coeffs = [float(t) for t in terms]
        extracted = coeffs[payload.extract_index] if payload.extract_index < len(coeffs) else 0.0
        return {
            "topic_key": "ordinary_generating_function",
            "module": "generating_functions",
            "title": "Ordinary Generating Function (Finite Sequence Polynomial)",
            "introduction": "Encodes a finite sequence {a_n} as coefficients of formal power series A(x) = ∑ a_n x^n.",
            "definition": "The coefficient [x^n]A(x) recovers the n-th sequence term a_n.",
            "formula_latex": r"A(x) = \sum_{n=0}^{N} a_n x^n = " + sp.latex(poly),
            "inputs_echo": payload.model_dump(),
            "steps": [
                {"step_number": 1, "title": "Construct Generating Polynomial", "explanation": f"Mapped {len(terms)} terms to powers of x.", "value": str(poly)},
                {"step_number": 2, "title": f"Extract [x^{payload.extract_index}]", "explanation": f"Coefficient of x^{payload.extract_index} is {extracted}.", "value": extracted},
            ],
            "result": {"extracted_coefficient": extracted, "extract_index": payload.extract_index, "series_coefficients": coeffs, "latex": sp.latex(poly)},
            "visualization": {"series": [{"n": k, "an": v} for k, v in enumerate(coeffs)]},
            "verification": {"derivative_at_zero_matches_a1": (float(sp.diff(poly, x).subs(x, 0)) == coeffs[1]) if len(coeffs) > 1 else True},
            "limitations": "Finite sequence input produces a truncated polynomial without closed-form rational inference.",
        }

    expr = _safe_parse_sympy(payload.expression or "1 / (1 - x - x^2)")
    try:
        series = sp.series(expr, x, 0, payload.order + 1).removeO()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot expand series around x = 0: {exc}") from exc

    poly = sp.Poly(series, x) if series.has(x) else None
    coeffs = []
    for k in range(payload.order + 1):
        c = poly.coeff_monomial(x ** k) if poly else (series if k == 0 else 0)
        coeffs.append(float(sp.N(c)))

    extracted = coeffs[payload.extract_index] if payload.extract_index <= payload.order else None
    return {
        "topic_key": "ordinary_generating_function",
        "module": "generating_functions",
        "title": "Ordinary Generating Function & Coefficient Extraction",
        "introduction": "Expands a closed-form OGF A(x) around x = 0 via SymPy Taylor/Maclaurin expansion and extracts [x^n]A(x).",
        "definition": "A(x) = ∑_{n≥0} a_n x^n with a_n = [x^n]A(x) = A^(n)(0)/n!.",
        "formula_latex": rf"A(x) = {sp.latex(expr)} = {sp.latex(series)} + \mathcal{{O}}(x^{{{payload.order + 1}}})",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Parse Closed-Form OGF", "explanation": f"Parsed A(x) = {expr}.", "value": str(expr)},
            {"step_number": 2, "title": "Maclaurin Series Expansion", "explanation": f"Computed terms up to x^{payload.order}.", "value": str(series)},
            {"step_number": 3, "title": f"Extract [x^{payload.extract_index}]A(x)", "explanation": f"Extracted coefficient a_{payload.extract_index} = {extracted}.", "value": extracted},
        ],
        "result": {
            "extracted_index": payload.extract_index,
            "extracted_coefficient": extracted,
            "series_coefficients": coeffs,
            "expanded_series": str(series),
        },
        "visualization": {"series": [{"n": k, "an": v} for k, v in enumerate(coeffs)]},
        "verification": {
            "taylor_derivative_match": abs(float(sp.N(sp.diff(expr, x, payload.extract_index).subs(x, 0) / math.factorial(payload.extract_index))) - (extracted or 0.0)) < 1e-6 if extracted is not None else True,
        },
        "limitations": "Requires A(x) to be analytic at x = 0; series truncation order is capped at 20.",
    }


def analyze_egf(payload: EGFRequest) -> dict[str, Any]:
    x = _ALLOWED_SYMPY_LOCALS["x"]
    expr = _safe_parse_sympy(payload.expression)
    try:
        series = sp.series(expr, x, 0, payload.order + 1).removeO()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot expand EGF around x = 0: {exc}") from exc

    poly = sp.Poly(series, x) if series.has(x) else None
    terms_out = []
    for k in range(payload.order + 1):
        c = poly.coeff_monomial(x ** k) if poly else (series if k == 0 else 0)
        an = float(sp.N(c * math.factorial(k)))
        terms_out.append({"n": k, "taylor_coeff": float(sp.N(c)), "an": round(an, 6)})

    extracted_row = next((t for t in terms_out if t["n"] == payload.extract_index), None)
    return {
        "topic_key": "exponential_generating_function",
        "module": "generating_functions",
        "title": "Exponential Generating Function (Labeled Structures)",
        "introduction": "Extracts labeled counting sequences a_n = n! [x^n] E(x) from exponential generating functions.",
        "definition": "E(x) = ∑_{n≥0} a_n x^n / n! encodes labeled combinatorial structures.",
        "formula_latex": rf"E(x) = {sp.latex(expr)} = \sum_{{n=0}}^{{\infty}} a_n \frac{{x^n}}{{n!}}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Expand Power Series", "explanation": f"E(x) ≈ {series}.", "value": str(series)},
            {"step_number": 2, "title": "Scale by n!", "explanation": f"a_{payload.extract_index} = {payload.extract_index}! × [x^{payload.extract_index}]E(x) = {extracted_row['an'] if extracted_row else 'N/A'}.", "value": extracted_row},
        ],
        "result": {
            "extracted_index": payload.extract_index,
            "extracted_an": extracted_row["an"] if extracted_row else None,
            "terms": terms_out,
        },
        "visualization": {"series": [{"n": t["n"], "an": t["an"]} for t in terms_out]},
        "verification": {
            "matches_nth_derivative_at_zero": abs(float(sp.N(sp.diff(expr, x, payload.extract_index).subs(x, 0))) - (extracted_row["an"] if extracted_row else 0.0)) < 1e-6 if extracted_row else True,
        },
        "limitations": "EGF expansion order is capped at n = 15 because n! grows super-exponentially.",
    }


def analyze_partitions(payload: PartitionsRequest) -> dict[str, Any]:
    n = payload.n
    max_part = payload.max_part or n
    # Exact DP for p(k) with optional max_part and distinct_only
    dp = [0] * (n + 1)
    dp[0] = 1
    parts_range = range(1, max_part + 1)
    for part in parts_range:
        if payload.distinct_only:
            for s in range(n, part - 1, -1):
                dp[s] += dp[s - part]
        else:
            for s in range(part, n + 1):
                dp[s] += dp[s - part]

    # Sample explicit partitions if n <= 12
    explicit_partitions: list[list[int]] = []
    if n <= 12:
        def gen(rem: int, limit: int, acc: list[int]):
            if rem == 0:
                explicit_partitions.append(acc[:])
                return
            for p in range(min(rem, limit), 0, -1):
                if len(explicit_partitions) >= 40:
                    return
                acc.append(p)
                gen(rem - p, p - 1 if payload.distinct_only else p, acc)
                acc.pop()
        gen(n, max_part, [])

    # Euler pentagonal / SymPy npartitions check when unrestricted
    sympy_check = int(sp.functions.combinatorial.numbers.partition(n)) if (max_part >= n and not payload.distinct_only) else None

    return {
        "topic_key": "integer_partitions",
        "module": "generating_functions",
        "title": "Integer Partitions & Partition Generating Functions",
        "introduction": "Counts ways to write a non-negative integer n as an unordered sum of positive integers.",
        "definition": "p(n) = [x^n] ∏_{k≥1} (1 − x^k)^{-1}; distinct-part partitions q(n) = [x^n] ∏_{k≥1} (1 + x^k).",
        "formula_latex": r"\sum_{n=0}^{\infty} p(n) x^n = \prod_{k=1}^{\infty} \frac{1}{1 - x^k}",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Configure Partition Constraints", "explanation": f"n={n}, max_part={max_part}, distinct_only={payload.distinct_only}.", "value": n},
            {"step_number": 2, "title": "Dynamic Programming Coefficient Count", "explanation": f"Evaluated p(0..{n}); p({n}) = {dp[n]}.", "value": dp[n]},
        ],
        "result": {"partition_count": dp[n], "explicit_sample": explicit_partitions, "sequence_up_to_n": dp},
        "visualization": {"series": [{"n": k, "an": val} for k, val in enumerate(dp)]},
        "verification": {"sympy_partition_match": (dp[n] == sympy_check) if sympy_check is not None else True},
        "limitations": "Explicit partition enumeration is shown up to 40 partitions for n ≤ 12; DP count capped at n ≤ 30.",
    }


def analyze_counting_sequence(payload: CountingSequenceRequest) -> dict[str, Any]:
    seq_type = payload.sequence_type
    N = payload.terms_count
    values: list[int] = []
    if seq_type == "fibonacci":
        values = [int(sp.fibonacci(i)) for i in range(N)]
        latex = r"F(x) = \frac{x}{1 - x - x^2}, \quad F_n = F_{n-1} + F_{n-2}"
    elif seq_type == "lucas":
        values = [int(sp.lucas(i)) for i in range(N)]
        latex = r"L(x) = \frac{2 - x}{1 - x - x^2}, \quad L_n = L_{n-1} + L_{n-2}"
    elif seq_type == "catalan":
        values = [int(sp.catalan(i)) for i in range(N)]
        latex = r"C(x) = \frac{1 - \sqrt{1 - 4x}}{2x}, \quad C_n = \frac{1}{n+1}\binom{2n}{n}"
    elif seq_type == "bell":
        values = [int(sp.bell(i)) for i in range(N)]
        latex = r"B(x) = e^{e^x - 1} = \sum_{n=0}^{\infty} B_n \frac{x^n}{n!}"
    elif seq_type == "stirling_second":
        k = payload.stirling_k
        values = [int(sp.functions.combinatorial.numbers.stirling(i, k, kind=2)) for i in range(N)]
        latex = rf"S(n, {k}) = \frac{{1}}{{{k}!}} \sum_{{j=0}}^{{{k}}} (-1)^{{{k}-j}} \binom{{{k}}}{{j}} j^n"
    else:  # derangement
        d = [1, 0]
        for i in range(2, N):
            d.append((i - 1) * (d[i - 1] + d[i - 2]))
        values = d[:N]
        latex = r"D(x) = \frac{e^{-x}}{1 - x} = \sum_{n=0}^{\infty} !n \frac{x^n}{n!}"

    return {
        "topic_key": "counting_sequences",
        "module": "generating_functions",
        "title": f"Classic Counting Sequence · {seq_type.replace('_', ' ').title()}",
        "introduction": "Generates canonical discrete combinatorial sequences with closed-form or generating function definitions.",
        "definition": "Exact arbitrary-precision integer evaluation via SymPy combinatorial numbers.",
        "formula_latex": latex,
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Select Sequence Family", "explanation": f"Computed first {N} terms for {seq_type}.", "value": values},
        ],
        "result": {"sequence": values},
        "visualization": {"series": [{"n": i, "an": v} for i, v in enumerate(values)]},
        "verification": {"exact_integer_sequence": all(isinstance(v, int) for v in values)},
        "limitations": "Interactive sequence plots are capped at 18 terms to preserve numeric scale legibility.",
    }


def solve_recurrence(payload: RecurrenceSolveRequest) -> dict[str, Any]:
    n = sp.Symbol("n", integer=True, nonnegative=True)
    a = sp.Function("a")

    c1 = sp.nsimplify(payload.c1, rational=True)
    c2 = sp.nsimplify(payload.c2, rational=True) if payload.order == 2 else sp.Integer(0)
    a0 = sp.nsimplify(payload.initial_a0, rational=True)
    a1 = sp.nsimplify(payload.initial_a1, rational=True)

    coeff_nh = sp.nsimplify(payload.non_homogeneous_coeff, rational=True)
    base_nh = sp.nsimplify(payload.non_homogeneous_base, rational=True)

    if payload.non_homogeneous_type == "none" or coeff_nh == 0:
        fn = sp.Integer(0)
    elif payload.non_homogeneous_type == "constant":
        fn = coeff_nh
    elif payload.non_homogeneous_type == "linear":
        fn = coeff_nh * n
    else:
        fn = coeff_nh * (base_nh ** n)

    if payload.order == 1:
        eq = a(n) - c1 * a(n - 1) - fn
        ics = {a(0): a0}
        rec_latex = rf"a_n = {sp.latex(c1)} a_{{n-1}} + {sp.latex(fn)}, \quad a_0 = {sp.latex(a0)}"
        char_poly = sp.Symbol("r") - c1
    else:
        eq = a(n) - c1 * a(n - 1) - c2 * a(n - 2) - fn
        ics = {a(0): a0, a(1): a1}
        rec_latex = rf"a_n = {sp.latex(c1)} a_{{n-1}} + {sp.latex(c2)} a_{{n-2}} + {sp.latex(fn)}, \quad a_0={sp.latex(a0)}, a_1={sp.latex(a1)}"
        r_sym = sp.Symbol("r")
        char_poly = r_sym**2 - c1 * r_sym - c2

    try:
        closed_form = sp.rsolve(eq, a(n), ics)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Symbolic recurrence solver failed: {exc}") from exc

    if closed_form is None:
        raise HTTPException(status_code=400, detail="SymPy could not obtain a closed-form solution for these coefficients.")

    closed_simplified = sp.simplify(closed_form)

    # Iterative numerical ground truth
    iter_terms: list[float] = []
    for k in range(payload.terms_count):
        if k == 0:
            iter_terms.append(float(sp.N(a0)))
        elif k == 1 and payload.order == 2:
            iter_terms.append(float(sp.N(a1)))
        else:
            fn_val = float(sp.N(fn.subs(n, k)))
            prev1 = iter_terms[k - 1]
            prev2 = iter_terms[k - 2] if payload.order == 2 else 0.0
            iter_terms.append(float(sp.N(c1)) * prev1 + float(sp.N(c2)) * prev2 + fn_val)

    # Evaluate closed-form & compare residuals
    comparison = []
    max_residual = 0.0
    for k in range(payload.terms_count):
        sym_val = float(sp.re(sp.N(closed_simplified.subs(n, k))))
        it_val = iter_terms[k]
        err = abs(sym_val - it_val)
        max_residual = max(max_residual, err)
        comparison.append({"n": k, "iterative": round(it_val, 6), "closed_form": round(sym_val, 6), "residual": err})

    char_roots = [str(sp.simplify(rt)) for rt in sp.solve(char_poly, sp.Symbol("r"))]

    return {
        "topic_key": "recurrence_solver",
        "module": "recurrence_relations",
        "title": f"Order-{payload.order} Linear Recurrence Relation Solver (SymPy)",
        "introduction": "Solves 1st- and 2nd-order homogeneous or non-homogeneous linear recurrences symbolically and verifies against iterative iteration.",
        "definition": "Uses characteristic polynomial roots and initial conditions via SymPy rsolve.",
        "formula_latex": rec_latex,
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Characteristic Polynomial", "explanation": f"P(r) = {char_poly} = 0 ⇒ roots {char_roots}.", "value": char_roots},
            {"step_number": 2, "title": "Symbolic Closed Form (SymPy rsolve)", "explanation": f"a(n) = {closed_simplified}.", "value": str(closed_simplified)},
            {"step_number": 3, "title": "Numerical Residual Verification", "explanation": f"Compared {payload.terms_count} iterative terms against closed-form evaluation; max |err| = {max_residual:.2e}.", "value": max_residual},
        ],
        "result": {
            "characteristic_roots": char_roots,
            "closed_form_str": str(closed_simplified),
            "closed_form_latex": sp.latex(closed_simplified),
            "terms": comparison,
        },
        "visualization": {"series": comparison},
        "verification": {"closed_form_matches_iteration": max_residual < 1e-5, "max_residual": max_residual},
        "limitations": "Limited to 1st- and 2nd-order constant-coefficient linear recurrences.",
    }
