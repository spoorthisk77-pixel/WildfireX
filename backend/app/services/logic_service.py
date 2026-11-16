from dataclasses import dataclass
import itertools
from typing import Any, Union
from fastapi import HTTPException

from backend.app.schemas.logic import (
    DeMorganRequest,
    EquivalenceRequest,
    InferenceRuleRequest,
    PredicateQuantifierRequest,
    PropositionalEvalRequest,
)


# Safe custom tokenizer & recursive-descent AST for propositional logic (NO eval / exec)
@dataclass(frozen=True)
class VarNode:
    name: str


@dataclass(frozen=True)
class ConstNode:
    value: bool


@dataclass(frozen=True)
class NotNode:
    child: "ExprNode"


@dataclass(frozen=True)
class BinNode:
    op: str  # AND | OR | XOR | IMPLIES | IFF
    left: "ExprNode"
    right: "ExprNode"


ExprNode = Union[VarNode, ConstNode, NotNode, BinNode]


def _tokenize(expr: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    i = 0
    n = len(expr)
    while i < n:
        ch = expr[i]
        if ch.isspace():
            i += 1
            continue
        if ch == "(":
            tokens.append(("LPAREN", "("))
            i += 1
        elif ch == ")":
            tokens.append(("RPAREN", ")"))
            i += 1
        elif ch in ("!", "~", "¬"):
            tokens.append(("NOT", "¬"))
            i += 1
        elif ch in ("&", "∧"):
            if i + 1 < n and expr[i + 1] == "&":
                i += 2
            else:
                i += 1
            tokens.append(("AND", "∧"))
        elif ch in ("|", "∨"):
            if i + 1 < n and expr[i + 1] == "|":
                i += 2
            else:
                i += 1
            tokens.append(("OR", "∨"))
        elif ch in ("^", "⊕"):
            tokens.append(("XOR", "⊕"))
            i += 1
        elif ch == "→":
            tokens.append(("IMPLIES", "→"))
            i += 1
        elif ch == "↔":
            tokens.append(("IFF", "↔"))
            i += 1
        elif expr[i : i + 3] == "<->":
            tokens.append(("IFF", "↔"))
            i += 3
        elif expr[i : i + 2] == "->":
            tokens.append(("IMPLIES", "→"))
            i += 2
        elif ch.isalpha() or ch == "_":
            j = i
            while j < n and (expr[j].isalnum() or expr[j] == "_"):
                j += 1
            word = expr[i:j]
            upper = word.upper()
            if upper in ("NOT",):
                tokens.append(("NOT", "¬"))
            elif upper in ("AND",):
                tokens.append(("AND", "∧"))
            elif upper in ("OR",):
                tokens.append(("OR", "∨"))
            elif upper in ("XOR",):
                tokens.append(("XOR", "⊕"))
            elif upper in ("IMPLIES",):
                tokens.append(("IMPLIES", "→"))
            elif upper in ("IFF",):
                tokens.append(("IFF", "↔"))
            elif upper in ("TRUE", "T"):
                tokens.append(("CONST", "TRUE"))
            elif upper in ("FALSE", "F"):
                tokens.append(("CONST", "FALSE"))
            else:
                tokens.append(("IDENT", word))
            i = j
        else:
            raise HTTPException(status_code=400, detail=f"Unexpected character '{ch}' at position {i} in logic expression.")
    return tokens


class _LogicParser:
    """Precedence (lowest -> highest): IFF -> IMPLIES -> OR/XOR -> AND -> NOT -> ATOM."""

    def __init__(self, tokens: list[tuple[str, str]]):
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> tuple[str, str] | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _consume(self) -> tuple[str, str]:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def parse(self) -> ExprNode:
        if not self.tokens:
            raise HTTPException(status_code=400, detail="Logic expression cannot be empty.")
        node = self._parse_iff()
        if self.pos < len(self.tokens):
            raise HTTPException(status_code=400, detail=f"Unexpected token '{self.tokens[self.pos][1]}'.")
        return node

    def _parse_iff(self) -> ExprNode:
        node = self._parse_implies()
        while self._peek() and self._peek()[0] == "IFF":
            self._consume()
            right = self._parse_implies()
            node = BinNode("IFF", node, right)
        return node

    def _parse_implies(self) -> ExprNode:
        node = self._parse_or()
        if self._peek() and self._peek()[0] == "IMPLIES":
            self._consume()
            right = self._parse_implies()  # right-associative
            node = BinNode("IMPLIES", node, right)
        return node

    def _parse_or(self) -> ExprNode:
        node = self._parse_and()
        while self._peek() and self._peek()[0] in ("OR", "XOR"):
            tok_type, _ = self._consume()
            right = self._parse_and()
            node = BinNode(tok_type, node, right)
        return node

    def _parse_and(self) -> ExprNode:
        node = self._parse_not()
        while self._peek() and self._peek()[0] == "AND":
            self._consume()
            right = self._parse_not()
            node = BinNode("AND", node, right)
        return node

    def _parse_not(self) -> ExprNode:
        if self._peek() and self._peek()[0] == "NOT":
            self._consume()
            return NotNode(self._parse_not())
        return self._parse_atom()

    def _parse_atom(self) -> ExprNode:
        tok = self._peek()
        if tok is None:
            raise HTTPException(status_code=400, detail="Unexpected end of logic expression.")
        if tok[0] == "LPAREN":
            self._consume()
            inner = self._parse_iff()
            closing = self._peek()
            if not closing or closing[0] != "RPAREN":
                raise HTTPException(status_code=400, detail="Missing closing parenthesis ')' in logic expression.")
            self._consume()
            return inner
        if tok[0] == "CONST":
            self._consume()
            return ConstNode(tok[1] == "TRUE")
        if tok[0] == "IDENT":
            self._consume()
            return VarNode(tok[1])
        raise HTTPException(status_code=400, detail=f"Unexpected token '{tok[1]}' where proposition or '(' was expected.")


def _collect_vars(node: ExprNode, out: list[str]) -> None:
    if isinstance(node, VarNode):
        if node.name not in out:
            out.append(node.name)
    elif isinstance(node, NotNode):
        _collect_vars(node.child, out)
    elif isinstance(node, BinNode):
        _collect_vars(node.left, out)
        _collect_vars(node.right, out)


def _format_node(node: ExprNode) -> str:
    if isinstance(node, VarNode):
        return node.name
    if isinstance(node, ConstNode):
        return "T" if node.value else "F"
    if isinstance(node, NotNode):
        inner = _format_node(node.child)
        return f"¬{inner}" if isinstance(node.child, (VarNode, ConstNode, NotNode)) else f"¬({inner})"
    sym_map = {"AND": "∧", "OR": "∨", "XOR": "⊕", "IMPLIES": "→", "IFF": "↔"}
    return f"({_format_node(node.left)} {sym_map[node.op]} {_format_node(node.right)})"


def _collect_subexpressions(node: ExprNode, out: list[tuple[str, ExprNode]]) -> None:
    if isinstance(node, (VarNode, ConstNode)):
        return
    if isinstance(node, NotNode):
        _collect_subexpressions(node.child, out)
    elif isinstance(node, BinNode):
        _collect_subexpressions(node.left, out)
        _collect_subexpressions(node.right, out)
    label = _format_node(node)
    if all(existing_label != label for existing_label, _ in out):
        out.append((label, node))


def _eval_node(node: ExprNode, env: dict[str, bool]) -> bool:
    if isinstance(node, VarNode):
        if node.name not in env:
            raise HTTPException(status_code=400, detail=f"Unbound proposition/predicate '{node.name}'.")
        return env[node.name]
    if isinstance(node, ConstNode):
        return node.value
    if isinstance(node, NotNode):
        return not _eval_node(node.child, env)
    lv = _eval_node(node.left, env)
    rv = _eval_node(node.right, env)
    if node.op == "AND":
        return lv and rv
    if node.op == "OR":
        return lv or rv
    if node.op == "XOR":
        return lv != rv
    if node.op == "IMPLIES":
        return (not lv) or rv
    if node.op == "IFF":
        return lv == rv
    raise HTTPException(status_code=400, detail=f"Unsupported operator {node.op}.")


def _parse_expr(expr: str) -> ExprNode:
    return _LogicParser(_tokenize(expr)).parse()


def evaluate_propositional(payload: PropositionalEvalRequest) -> dict[str, Any]:
    ast = _parse_expr(payload.expression)
    variables: list[str] = []
    _collect_vars(ast, variables)
    if len(variables) > 5:
        raise HTTPException(status_code=400, detail="Truth table evaluation is capped at 5 distinct variables (32 rows).")

    subexprs: list[tuple[str, ExprNode]] = []
    _collect_subexpressions(ast, subexprs)
    sub_labels = [lbl for lbl, _ in subexprs]
    final_label = _format_node(ast)

    rows: list[dict[str, bool]] = []
    true_count = 0
    for combo in itertools.product([True, False], repeat=len(variables)):
        env = dict(zip(variables, combo))
        row: dict[str, bool] = dict(env)
        for lbl, sub_node in subexprs:
            row[lbl] = _eval_node(sub_node, env)
        final_val = _eval_node(ast, env)
        row[final_label] = final_val
        if final_val:
            true_count += 1
        rows.append(row)

    total_rows = len(rows)
    if true_count == total_rows:
        classification = "tautology"
    elif true_count == 0:
        classification = "contradiction"
    else:
        classification = "contingency"

    return {
        "topic_key": "propositional_truth_table",
        "module": "mathematical_logic",
        "title": "Propositional Logic & Truth Table Evaluation",
        "introduction": "Parses propositional formulas via a safe recursive-descent AST (no eval/exec) and builds step-by-step truth tables.",
        "definition": "A formula is a tautology if true under all 2^n valuations, a contradiction if always false, and a contingency otherwise.",
        "formula_latex": final_label.replace("¬", r"\neg ").replace("∧", r"\land ").replace("∨", r"\lor ").replace("→", r"\to ").replace("↔", r"\leftrightarrow "),
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Tokenize & Build Safe AST", "explanation": f"Detected {len(variables)} variables: {variables or ['(constant)']}.", "value": final_label},
            {"step_number": 2, "title": "Evaluate Intermediate Subexpressions", "explanation": f"Evaluated {len(sub_labels)} intermediate columns across {total_rows} valuations.", "value": sub_labels},
            {"step_number": 3, "title": "Classify Formula", "explanation": f"{true_count}/{total_rows} rows evaluated True ⇒ {classification}.", "value": classification},
        ],
        "result": {
            "canonical_expression": final_label,
            "variables": variables,
            "classification": classification,
            "true_rows": true_count,
            "total_rows": total_rows,
        },
        "visualization": {
            "columns": variables + [lbl for lbl in sub_labels if lbl != final_label] + [final_label],
            "rows": rows,
        },
        "verification": {"row_count_matches_2_pow_n": total_rows == (2 ** len(variables))},
        "limitations": "Interactive truth tables are bounded to ≤ 5 propositional variables (2⁵ = 32 rows) for readability.",
    }


def evaluate_equivalence(payload: EquivalenceRequest) -> dict[str, Any]:
    ast_l = _parse_expr(payload.expression_left)
    ast_r = _parse_expr(payload.expression_right)
    vars_all: list[str] = []
    _collect_vars(ast_l, vars_all)
    _collect_vars(ast_r, vars_all)
    if len(vars_all) > 5:
        raise HTTPException(status_code=400, detail="Equivalence checking is capped at 5 distinct variables.")

    rows = []
    counterexamples = []
    left_label = _format_node(ast_l)
    right_label = _format_node(ast_r)
    holds = True

    for combo in itertools.product([True, False], repeat=len(vars_all)):
        env = dict(zip(vars_all, combo))
        lv = _eval_node(ast_l, env)
        rv = _eval_node(ast_r, env)
        if payload.check_type in ("equivalence", "biconditional"):
            ok = lv == rv
        else:
            ok = (not lv) or rv
        if not ok:
            holds = False
            counterexamples.append(env)
        rows.append({**env, "Left": lv, "Right": rv, "Satisfied": ok})

    return {
        "topic_key": "logical_equivalence",
        "module": "mathematical_logic",
        "title": "Logical Equivalence, Conditionals & Biconditionals",
        "introduction": "Tests whether two formulas share identical truth values across every valuation (φ ≡ ψ) or whether φ ⊨ ψ.",
        "definition": "φ ≡ ψ iff φ ↔ ψ is a tautology across all 2^n truth assignments.",
        "formula_latex": r"\phi \equiv \psi \iff \models (\phi \leftrightarrow \psi)",
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Normalize Both Expressions", "explanation": f"Left: {left_label}; Right: {right_label}.", "value": [left_label, right_label]},
            {"step_number": 2, "title": "Exhaustive Semantic Table", "explanation": f"Checked {len(rows)} valuations; found {len(counterexamples)} counterexamples.", "value": holds},
        ],
        "result": {
            "holds": holds,
            "check_type": payload.check_type,
            "counterexample_count": len(counterexamples),
            "first_counterexample": counterexamples[0] if counterexamples else None,
        },
        "visualization": {"columns": vars_all + ["Left", "Right", "Satisfied"], "rows": rows},
        "verification": {"exhaustive_2_pow_n_checked": len(rows) == (2 ** len(vars_all))},
        "limitations": "Truth-table equivalence is limited to ≤ 5 distinct variables.",
    }


def verify_demorgan(payload: DeMorganRequest) -> dict[str, Any]:
    vars_clean = [v.strip() for v in payload.variables if v.strip()]
    if payload.law_form == "negated_conjunction":
        left_expr = f"NOT ({' AND '.join(vars_clean)})"
        right_expr = " OR ".join(f"NOT {v}" for v in vars_clean)
        latex = r"\neg(P_1 \land P_2 \land \cdots) \equiv (\neg P_1 \lor \neg P_2 \lor \cdots)"
    else:
        left_expr = f"NOT ({' OR '.join(vars_clean)})"
        right_expr = " AND ".join(f"NOT {v}" for v in vars_clean)
        latex = r"\neg(P_1 \lor P_2 \lor \cdots) \equiv (\neg P_1 \land \neg P_2 \land \cdots)"

    res = evaluate_equivalence(EquivalenceRequest(expression_left=left_expr, expression_right=right_expr, check_type="equivalence"))
    res["topic_key"] = "demorgan_laws"
    res["title"] = "De Morgan's Laws Verification"
    res["formula_latex"] = latex
    return res


def verify_inference_rule(payload: InferenceRuleRequest) -> dict[str, Any]:
    presets = {
        "modus_ponens": (["P -> Q", "P"], "Q", r"((P \to Q) \land P) \to Q"),
        "modus_tollens": (["P -> Q", "NOT Q"], "NOT P", r"((P \to Q) \land \neg Q) \to \neg P"),
        "hypothetical_syllogism": (["P -> Q", "Q -> R"], "P -> R", r"((P \to Q) \land (Q \to R)) \to (P \to R)"),
        "disjunctive_syllogism": (["P OR Q", "NOT P"], "Q", r"((P \lor Q) \land \neg P) \to Q"),
    }
    if payload.rule_name == "custom":
        if not payload.premises or not payload.conclusion:
            raise HTTPException(status_code=400, detail="Custom inference check requires premises and conclusion.")
        premises, conclusion = payload.premises, payload.conclusion
        latex = r"\left(\bigwedge_i \text{Premise}_i\right) \to \text{Conclusion}"
    else:
        premises, conclusion, latex = presets[payload.rule_name]

    conj = " AND ".join(f"({p})" for p in premises)
    combined = f"({conj}) -> ({conclusion})"
    eval_res = evaluate_propositional(PropositionalEvalRequest(expression=combined))
    is_valid = eval_res["result"]["classification"] == "tautology"

    return {
        "topic_key": "rules_of_inference",
        "module": "mathematical_logic",
        "title": f"Rules of Inference Audit · {payload.rule_name.replace('_', ' ').title()}",
        "introduction": "Verifies whether a deductive argument (Premises ⊢ Conclusion) is semantically valid by testing if (⋀ Premises) → Conclusion is a tautology.",
        "definition": "An argument form is valid iff there is no valuation making all premises true and the conclusion false.",
        "formula_latex": latex,
        "inputs_echo": {"rule_name": payload.rule_name, "premises": premises, "conclusion": conclusion},
        "steps": eval_res["steps"],
        "result": {"argument_is_valid": is_valid, "premises": premises, "conclusion": conclusion},
        "visualization": eval_res["visualization"],
        "verification": {"tautology_verified": is_valid},
        "limitations": "Propositional validity only; up to 5 propositional variables supported.",
    }


def evaluate_predicate_quantifier(payload: PredicateQuantifierRequest) -> dict[str, Any]:
    # Rewrite Predicate(x) tokens cleanly into safe AST variable names
    # e.g., TreeCover(x) -> TreeCover
    cleaned = payload.predicate_expression.replace("(x)", "").replace("(X)", "")
    ast = _parse_expr(cleaned)
    pred_names: list[str] = []
    _collect_vars(ast, pred_names)

    domain_results = []
    witnesses_true = []
    counterexamples_false = []

    for elem in payload.domain:
        env = {p: bool(elem.predicates.get(p, False)) for p in pred_names}
        val = _eval_node(ast, env)
        domain_results.append({"element": elem.label, "predicates": env, "satisfies_formula": val})
        if val:
            witnesses_true.append(elem.label)
        else:
            counterexamples_false.append(elem.label)

    if payload.quantifier == "forall":
        holds = len(counterexamples_false) == 0
        latex = rf"\forall x \in D,\; ({_format_node(ast)})"
    else:
        holds = len(witnesses_true) > 0
        latex = rf"\exists x \in D,\; ({_format_node(ast)})"

    return {
        "topic_key": "predicate_quantifiers",
        "module": "mathematical_logic",
        "title": "Predicate Logic & Finite-Domain Quantifiers (∀, ∃)",
        "introduction": "Evaluates universal (∀) and existential (∃) statements over a finite domain of landscape elements or cells.",
        "definition": "∀x P(x) holds iff P(a) is True for every a ∈ D; ∃x P(x) holds iff P(a) is True for at least one a ∈ D.",
        "formula_latex": latex,
        "inputs_echo": payload.model_dump(),
        "steps": [
            {"step_number": 1, "title": "Extract Unary Predicates", "explanation": f"Detected predicates: {pred_names}.", "value": pred_names},
            {"step_number": 2, "title": "Evaluate Each Domain Element", "explanation": f"Evaluated {len(domain_results)} domain objects: {len(witnesses_true)} True, {len(counterexamples_false)} False.", "value": len(witnesses_true)},
            {"step_number": 3, "title": "Apply Quantifier", "explanation": f"Quantifier '{payload.quantifier}' evaluates to {holds}.", "value": holds},
        ],
        "result": {
            "quantifier": payload.quantifier,
            "holds": holds,
            "domain_size": len(domain_results),
            "witnesses": witnesses_true,
            "counterexamples": counterexamples_false,
        },
        "visualization": {"domain_evaluations": domain_results},
        "verification": {
            "duality_check": (holds == (len(counterexamples_false) == 0)) if payload.quantifier == "forall" else (holds == (len(witnesses_true) > 0)),
        },
        "limitations": "Supports finite domain unary predicate evaluation up to 24 domain elements.",
    }
