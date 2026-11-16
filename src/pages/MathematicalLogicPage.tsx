import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import type { MathTopicResponse } from '../types/api';
import { MathLabSection } from '../components/MathLabSection';

type LogicTab = 'propositional' | 'equivalence' | 'demorgan' | 'inference' | 'predicate';

export function MathematicalLogicPage() {
  const [tab, setTab] = useState<LogicTab>('propositional');

  // Propositional
  const [expr, setExpr] = useState('(P -> Q) AND (Q -> R) -> (P -> R)');
  // Equivalence
  const [exprL, setExprL] = useState('P -> Q');
  const [exprR, setExprR] = useState('NOT P OR Q');
  const [checkType, setCheckType] = useState<'equivalence' | 'implication' | 'biconditional'>('equivalence');
  // De Morgan
  const [dmVars, setDmVars] = useState('P, Q');
  const [dmForm, setDmForm] = useState<'negated_conjunction' | 'negated_disjunction'>('negated_conjunction');
  // Inference
  const [infRule, setInfRule] = useState<'modus_ponens' | 'modus_tollens' | 'hypothetical_syllogism' | 'disjunctive_syllogism' | 'custom'>('modus_ponens');
  const [customPremises, setCustomPremises] = useState('P -> Q\nP');
  const [customConclusion, setCustomConclusion] = useState('Q');
  // Predicates & Quantifiers
  const [quantifier, setQuantifier] = useState<'forall' | 'exists'>('forall');
  const [predExpr, setPredExpr] = useState('TreeCover(x) -> Burnable(x)');
  const [domainRows, setDomainRows] = useState<Array<{ label: string; TreeCover: boolean; Burnable: boolean }>>([
    { label: 'Cell_r01_c01', TreeCover: true, Burnable: true },
    { label: 'Cell_r01_c02', TreeCover: false, Burnable: true },
    { label: 'Cell_r02_c04', TreeCover: false, Burnable: false },
  ]);

  const [response, setResponse] = useState<MathTopicResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      let res: MathTopicResponse;
      if (tab === 'propositional') {
        res = await apiClient.evaluateLogic('propositional', { expression: expr });
      } else if (tab === 'equivalence') {
        res = await apiClient.evaluateLogic('equivalence', {
          expression_left: exprL,
          expression_right: exprR,
          check_type: checkType,
        });
      } else if (tab === 'demorgan') {
        res = await apiClient.evaluateLogic('demorgan', {
          variables: dmVars.split(',').map((s) => s.trim()).filter(Boolean),
          law_form: dmForm,
        });
      } else if (tab === 'inference') {
        res = await apiClient.evaluateLogic('inference', {
          rule_name: infRule,
          premises: infRule === 'custom' ? customPremises.split('\n').map((s) => s.trim()).filter(Boolean) : undefined,
          conclusion: infRule === 'custom' ? customConclusion : undefined,
        });
      } else {
        res = await apiClient.evaluateLogic('predicate-quantifier', {
          quantifier,
          predicate_expression: predExpr,
          domain: domainRows.map((d) => ({
            label: d.label,
            predicates: { TreeCover: d.TreeCover, Burnable: d.Burnable },
          })),
        });
      }
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logic evaluation failed.');
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    void execute();
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-lg border border-[#DCE2DC] bg-white p-2 text-xs">
        {(
          [
            ['propositional', 'Truth Table & Tautology'],
            ['equivalence', 'Equivalence & Conditionals'],
            ['demorgan', "De Morgan's Laws"],
            ['inference', 'Rules of Inference'],
            ['predicate', 'Predicates & Quantifiers (∀, ∃)'],
          ] as Array<[LogicTab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === k ? 'bg-[#1B4332] text-white' : 'text-[#4B5851] hover:bg-[#F5F6F3]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <MathLabSection
        title="Mathematical Logic Laboratory"
        introduction="Evaluates propositional formulas, truth tables with intermediate subexpressions, inference rules, and finite-domain quantifiers using a safe recursive-descent AST parser."
        definition="Operators supported: NOT (!, ~), AND (&), OR (|), XOR (^), -> (IMPLIES), <-> (IFF)."
        formulaLatex={String.raw`(P \to Q) \equiv (\neg P \lor Q)`}
        executing={executing}
        error={error}
        response={response}
        onExecute={execute}
        inputPanel={
          <div className="text-xs space-y-3">
            {tab === 'propositional' && (
              <div>
                <label className="block text-[#5B6861] mb-1">Propositional Formula (up to 5 variables)</label>
                <input
                  type="text"
                  value={expr}
                  onChange={(e) => setExpr(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-3 py-2 font-mono"
                />
              </div>
            )}

            {tab === 'equivalence' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#5B6861] mb-1">Left Formula φ</label>
                  <input type="text" value={exprL} onChange={(e) => setExprL(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Right Formula ψ</label>
                  <input type="text" value={exprR} onChange={(e) => setExprR(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Relation</label>
                  <select
                    value={checkType}
                    onChange={(e) => setCheckType(e.target.value as typeof checkType)}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-3 py-1.5"
                  >
                    <option value="equivalence">Logical Equivalence (φ ≡ ψ)</option>
                    <option value="implication">Semantic Entailment (φ ⊨ ψ)</option>
                    <option value="biconditional">Biconditional (φ ↔ ψ)</option>
                  </select>
                </div>
              </div>
            )}

            {tab === 'demorgan' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">Propositional Variables (2–4)</label>
                  <input type="text" value={dmVars} onChange={(e) => setDmVars(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Law Form</label>
                  <select
                    value={dmForm}
                    onChange={(e) => setDmForm(e.target.value as typeof dmForm)}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-3 py-1.5"
                  >
                    <option value="negated_conjunction">¬(P ∧ Q) ≡ ¬P ∨ ¬Q</option>
                    <option value="negated_disjunction">¬(P ∨ Q) ≡ ¬P ∧ ¬Q</option>
                  </select>
                </div>
              </div>
            )}

            {tab === 'inference' && (
              <div className="space-y-3 max-w-xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">Inference Rule</label>
                  <select
                    value={infRule}
                    onChange={(e) => setInfRule(e.target.value as typeof infRule)}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-3 py-1.5"
                  >
                    <option value="modus_ponens">Modus Ponens (P→Q, P ⊢ Q)</option>
                    <option value="modus_tollens">Modus Tollens (P→Q, ¬Q ⊢ ¬P)</option>
                    <option value="hypothetical_syllogism">Hypothetical Syllogism (P→Q, Q→R ⊢ P→R)</option>
                    <option value="disjunctive_syllogism">Disjunctive Syllogism (P∨Q, ¬P ⊢ Q)</option>
                    <option value="custom">Custom Premises & Conclusion</option>
                  </select>
                </div>
                {infRule === 'custom' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[#5B6861] mb-1">Premises (one per line)</label>
                      <textarea rows={3} value={customPremises} onChange={(e) => setCustomPremises(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                    </div>
                    <div>
                      <label className="block text-[#5B6861] mb-1">Conclusion</label>
                      <input type="text" value={customConclusion} onChange={(e) => setCustomConclusion(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'predicate' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#5B6861] mb-1">Quantifier</label>
                    <select
                      value={quantifier}
                      onChange={(e) => setQuantifier(e.target.value as 'forall' | 'exists')}
                      className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                    >
                      <option value="forall">Universal (∀x ∈ D)</option>
                      <option value="exists">Existential (∃x ∈ D)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[#5B6861] mb-1">Predicate Formula over x</label>
                    <input type="text" value={predExpr} onChange={(e) => setPredExpr(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                  </div>
                </div>
                <div className="border border-[#E7EBE6] rounded overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-[#F5F6F3] text-[#5B6861]">
                      <tr>
                        <th className="px-3 py-1.5">Domain Element x</th>
                        <th className="px-3 py-1.5">TreeCover(x)</th>
                        <th className="px-3 py-1.5">Burnable(x)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2EF] font-mono">
                      {domainRows.map((row, idx) => (
                        <tr key={row.label}>
                          <td className="px-3 py-1.5">{row.label}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={row.TreeCover}
                              onChange={(e) =>
                                setDomainRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, TreeCover: e.target.checked } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={row.Burnable}
                              onChange={(e) =>
                                setDomainRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, Burnable: e.target.checked } : r)),
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        }
        renderVisualization={(res) => {
          const vis = res.visualization as Record<string, unknown>;
          if (tab === 'predicate') {
            const evals = (vis.domain_evaluations as Array<{ element: string; satisfies_formula: boolean; predicates: Record<string, boolean> }>) || [];
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                      <th className="py-1.5 px-2">Element</th>
                      <th className="py-1.5 px-2">Predicates</th>
                      <th className="py-1.5 px-2">Formula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2EF]">
                    {evals.map((ev) => (
                      <tr key={ev.element}>
                        <td className="py-1.5 px-2">{ev.element}</td>
                        <td className="py-1.5 px-2 text-[#4B5851]">{JSON.stringify(ev.predicates)}</td>
                        <td className={`py-1.5 px-2 font-semibold ${ev.satisfies_formula ? 'text-[#1E6B45]' : 'text-[#B42318]'}`}>
                          {ev.satisfies_formula ? 'TRUE' : 'FALSE'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          const columns = (vis.columns as string[]) || [];
          const rows = (vis.rows as Array<Record<string, boolean>>) || [];
          if (columns.length === 0) return null;
          return (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-center text-xs font-mono">
                <thead className="bg-[#F5F6F3] sticky top-0">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="px-2.5 py-1.5 border-b border-[#E7EBE6] text-[#151B18]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F2EF]">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {columns.map((col) => {
                        const val = row[col];
                        return (
                          <td
                            key={col}
                            className={`px-2.5 py-1 ${val ? 'text-[#1E6B45] font-semibold' : 'text-[#6B7871]'}`}
                          >
                            {val ? 'T' : 'F'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      />
    </div>
  );
}
