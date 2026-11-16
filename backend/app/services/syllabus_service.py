from typing import Any


SYLLABUS_MODULES: list[dict[str, Any]] = [
    {
        "module_number": "Module I",
        "module_title": "Combinatorics & Inclusion-Exclusion",
        "route_path": "/combinatorics",
        "api_prefix": "/api/math/combinatorics",
        "concepts": [
            {
                "concept": "Sum & Product Counting Principles",
                "status": "Implemented & Verified",
                "application_scope": "Direct landscape zoning combinations & independent educational calculator",
                "capabilities": "Disjoint alternatives addition rule + sequential stage cardinality product rule with step-by-step derivation.",
                "verification_note": "Verified in pytest & live API via /api/math/combinatorics/solve.",
            },
            {
                "concept": "Permutations & Combinations (nPr, nCr, Multiset)",
                "status": "Implemented & Verified",
                "application_scope": "Ignition seed-tuple selection counts on structured grid cells & general counting",
                "capabilities": "Exact integer arithmetic with r <= n bounds validation and multiset factorial denominators.",
                "verification_note": "Unit tested for boundary cases (r > n rejection, C(10,3)=120).",
            },
            {
                "concept": "Pigeonhole Principle",
                "status": "Implemented & Verified",
                "application_scope": "Mapping observations/cells across finite discrete bins (e.g., months or land-cover categories)",
                "capabilities": "Computes generalized ceiling guarantee ceil(N/k) and excess witnesses.",
                "verification_note": "Verified algebraically with automated step explanations.",
            },
            {
                "concept": "Principle of Inclusion-Exclusion & Derangements (!n)",
                "status": "Implemented & Verified",
                "application_scope": "Multi-layer spatial filter overlap & independent educational fixed-point-free permutation lab",
                "capabilities": "Alternating-sum inclusion-exclusion for multiple overlapping criteria and dual verification (!n via I-E and recurrence).",
                "verification_note": "Automated equality check between I-E sum and subfactorial recurrence (!4=9).",
            },
            {
                "concept": "Rook Polynomials & Forbidden Positions",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational discrete optimization demonstration (non-overlapping placement under water/barren constraints)",
                "capabilities": "Exact dynamic polynomial expansion R(B, x) on custom binary restriction matrices.",
                "verification_note": "Verified on 2x2 unrestricted board (1 + 4x + 2x^2).",
            },
        ],
    },
    {
        "module_number": "Module II",
        "module_title": "Mathematical Logic",
        "route_path": "/mathematical-logic",
        "api_prefix": "/api/math/logic",
        "concepts": [
            {
                "concept": "Propositional Connectives & Safe AST Truth Tables",
                "status": "Implemented & Verified",
                "application_scope": "Boolean condition inspection on environmental predicates & general logic explorer",
                "capabilities": "Recursive-descent tokenizer/AST supporting NOT, AND, OR, XOR, ->, <-> with zero eval/exec; classifies tautology/contradiction/contingency.",
                "verification_note": "Security tested against code-injection strings and verified for P OR NOT P.",
            },
            {
                "concept": "Logical Equivalence & De Morgan's Laws",
                "status": "Implemented & Verified",
                "application_scope": "Equivalent spatial rule simplification & formal symbolic proof verification",
                "capabilities": "Exhaustive 2^n truth-row comparison with explicit counterexample witness on mismatch.",
                "verification_note": "Verified automated De Morgan equivalence checks.",
            },
            {
                "concept": "Rules of Inference (Modus Ponens, Modus Tollens, Syllogisms)",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational formal deduction verifier",
                "capabilities": "Semantic validity proof verifying (Premise1 AND ... -> Conclusion) is a tautology.",
                "verification_note": "Verified valid derivations and invalid fallacy counterexamples.",
            },
            {
                "concept": "Predicate Logic & Finite Quantifiers (ForAll, Exists)",
                "status": "Implemented & Verified",
                "application_scope": "Direct evaluation of logical assertions over real Nagarhole grid cell domains",
                "capabilities": "Evaluates universal and existential predicates over finite cell property dictionaries.",
                "verification_note": "Tested with TreeCover(x) -> Burnable(x) predicate domain checks.",
            },
        ],
    },
    {
        "module_number": "Module III",
        "module_title": "Generating Functions & Recurrence Relations",
        "route_path": "/generating-functions",
        "api_prefix": "/api/math/generating-recurrence",
        "concepts": [
            {
                "concept": "Ordinary Generating Functions (OGF)",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational symbolic power-series & state-counting demonstration",
                "capabilities": "Restricted SymPy parse_expr with Taylor/Maclaurin expansion and coefficient extraction [x^k]A(x).",
                "verification_note": "Verified Fibonacci OGF 1/(1-x-x^2) extracting [x^6]=13.",
            },
            {
                "concept": "Exponential Generating Functions (EGF) & Integer Partitions",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational labeled-combinatorics and partition counting workspace",
                "capabilities": "Computes EGF series coefficients multiplied by n! and exact integer partition p(n).",
                "verification_note": "SymPy series expansion and partition enumeration verified.",
            },
            {
                "concept": "Linear Recurrence Relations (Homogeneous & Non-Homogeneous)",
                "status": "Implemented & Verified",
                "application_scope": "Discrete-time generation growth modeling & closed-form verification",
                "capabilities": "Solves characteristic equations (distinct, repeated, complex roots) symbolically via SymPy rsolve.",
                "verification_note": "Cross-checks iterative sequence values vs closed-form terms term-by-term.",
            },
        ],
    },
    {
        "module_number": "Module IV",
        "module_title": "Graph Theory",
        "route_path": "/graph-theory",
        "api_prefix": "/api/math/graph-theory",
        "concepts": [
            {
                "concept": "Grid Adjacency Graph G = (V, E) & Handshaking Lemma",
                "status": "Implemented & Verified",
                "application_scope": "Direct modeling of real processed Nagarhole landscape cells as vertices and spatial neighbors as edges",
                "capabilities": "Builds NetworkX graph for Moore-8 or Von Neumann-4 stencils; verifies Sum(deg(v)) = 2|E| and odd-degree parity.",
                "verification_note": "Verified directly against live SQLite grid cells in pytest.",
            },
            {
                "concept": "Graph Isomorphism (VF2)",
                "status": "Implemented & Verified",
                "application_scope": "Structural patch motif comparison & educational isomorphism workbench",
                "capabilities": "Degree-sequence invariant pre-check + exact NetworkX VF2 bijection mapping.",
                "verification_note": "Tested on C4 cycle relabeling and non-isomorphic counterexamples.",
            },
            {
                "concept": "Walks, Trails, Paths, Euler & Hamiltonian Properties",
                "status": "Implemented & Verified",
                "application_scope": "Landscape traversal topology & educational graph-traversal verification",
                "capabilities": "Adjacency matrix A^k walk counts, Eulerian circuit/path parity theorem, and bounded backtracking Hamiltonian solver.",
                "verification_note": "Verified matrix power walk counts and Eulerian/Hamiltonian witnesses.",
            },
            {
                "concept": "Planarity, Euler's Formula & Graph Coloring",
                "status": "Implemented & Verified",
                "application_scope": "Direct verification of 4-neighbor planar lattice & educational chromatic/dual graph lab",
                "capabilities": "Boyer-Myrvold planarity test, v - e + f = 2 verification, exact chromatic number, and chromatic polynomial.",
                "verification_note": "Verified K4-minus-edge exact chromatic number = 3 and Euler formula.",
            },
        ],
    },
    {
        "module_number": "Module V",
        "module_title": "Trees & Algorithms",
        "route_path": "/trees-algorithms",
        "api_prefix": "/api/math/trees-algorithms",
        "concepts": [
            {
                "concept": "Tree Characterization & Binary Tree Traversals",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational tree theorem & traversal step visualizer",
                "capabilities": "Checks connectedness, acyclicity, and |E| = |V| - 1; computes Preorder, Inorder, Postorder, and Level-order sequences.",
                "verification_note": "Automated verification of tree axioms and traversal outputs.",
            },
            {
                "concept": "Huffman Prefix-Free Coding & Kraft Inequality",
                "status": "Implemented & Verified",
                "application_scope": "Direct land-cover symbol compression study & educational greedy-coding lab",
                "capabilities": "Constructs optimal binary prefix-free codes, computes average bit length vs Shannon entropy, verifies Sum(2^-l_i) <= 1.",
                "verification_note": "Verified Kraft inequality and prefix-free property in pytest.",
            },
            {
                "concept": "Kruskal & Prim Minimum Spanning Trees + Dijkstra Shortest Paths",
                "status": "Implemented & Verified",
                "application_scope": "Direct minimum-cost landscape corridor / cellular graph weighted paths & custom graph builder",
                "capabilities": "Step-by-step union-find (Kruskal), frontier priority-queue (Prim), and shortest-path distance table (Dijkstra).",
                "verification_note": "Verified MST total weight=6.0 and edge-trace consistency.",
            },
            {
                "concept": "Sorting Algorithms (Insertion, Merge, Quick Sort)",
                "status": "Implemented & Verified",
                "application_scope": "Independent educational algorithm comparison & complexity profiler",
                "capabilities": "Records exact step traces, comparisons, and swaps/merges with empirical verification against Python sorted().",
                "verification_note": "Tested across all three sorting algorithms in API & pytest.",
            },
        ],
    },
]


def get_syllabus_coverage() -> dict[str, Any]:
    total_concepts = sum(len(m["concepts"]) for m in SYLLABUS_MODULES)
    direct_count = sum(
        1
        for m in SYLLABUS_MODULES
        for c in m["concepts"]
        if "Direct" in c["application_scope"]
    )
    return {
        "total_modules": len(SYLLABUS_MODULES),
        "total_concepts": total_concepts,
        "implemented_and_verified_count": total_concepts,
        "direct_geospatial_applications": direct_count,
        "independent_educational_demos": total_concepts - direct_count,
        "modules": SYLLABUS_MODULES,
    }
