import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '../services/apiClient';
import type { MathTopicResponse } from '../types/api';
import { MathLabSection } from '../components/MathLabSection';
import { LatexFormula } from '../components/LatexFormula';

type Module3Tab = 'ogf' | 'egf' | 'partitions' | 'sequences' | 'recurrence';

export function GeneratingRecurrencePage({ initialSection }: { initialSection: 'generating' | 'recurrence' }) {
  const [tab, setTab] = useState<Module3Tab>(initialSection === 'recurrence' ? 'recurrence' : 'ogf');

  // OGF & EGF
  const [ogfExpr, setOgfExpr] = useState('1 / (1 - x - x^2)');
  const [egfExpr, setEgfExpr] = useState('exp(x) * (1 + x)');
  const [order, setOrder] = useState(10);
  const [extractIdx, setExtractIdx] = useState(6);

  // Partitions
  const [partN, setPartN] = useState(8);
  const [distinctOnly, setDistinctOnly] = useState(false);

  // Counting Sequences
  const [seqType, setSeqType] = useState<'fibonacci' | 'catalan' | 'bell' | 'stirling_second' | 'derangement' | 'lucas'>('catalan');
  const [seqTerms, setSeqTerms] = useState(10);
  const [stirlingK, setStirlingK] = useState(3);

  // Recurrence Solver
  const [recOrder, setRecOrder] = useState<1 | 2>(2);
  const [c1, setC1] = useState(1);
  const [c2, setC2] = useState(1);
  const [a0, setA0] = useState(0);
  const [a1, setA1] = useState(1);
  const [nhType, setNhType] = useState<'none' | 'constant' | 'linear' | 'exponential'>('none');
  const [nhCoeff, setNhCoeff] = useState(0);
  const [nhBase, setNhBase] = useState(2);
  const [recTerms, setRecTerms] = useState(12);

  const [response, setResponse] = useState<MathTopicResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialSection === 'recurrence' ? 'recurrence' : 'ogf');
  }, [initialSection]);

  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      let res: MathTopicResponse;
      if (tab === 'ogf') {
        res = await apiClient.solveGeneratingOrRecurrence('ogf', {
          expression: ogfExpr,
          order,
          extract_index: extractIdx,
        });
      } else if (tab === 'egf') {
        res = await apiClient.solveGeneratingOrRecurrence('egf', {
          expression: egfExpr,
          order: Math.min(order, 12),
          extract_index: Math.min(extractIdx, 12),
        });
      } else if (tab === 'partitions') {
        res = await apiClient.solveGeneratingOrRecurrence('partitions', {
          n: partN,
          distinct_only: distinctOnly,
        });
      } else if (tab === 'sequences') {
        res = await apiClient.solveGeneratingOrRecurrence('sequences', {
          sequence_type: seqType,
          terms_count: seqTerms,
          stirling_k: stirlingK,
        });
      } else {
        res = await apiClient.solveGeneratingOrRecurrence('recurrence', {
          order: recOrder,
          c1,
          c2,
          initial_a0: a0,
          initial_a1: a1,
          non_homogeneous_type: nhType,
          non_homogeneous_coeff: nhCoeff,
          non_homogeneous_base: nhBase,
          terms_count: recTerms,
        });
      }
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Symbolic computation failed.');
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
            ['ogf', 'Ordinary Generating Functions'],
            ['egf', 'Exponential Generating Functions'],
            ['partitions', 'Integer Partitions p(n)'],
            ['sequences', 'Counting Sequences'],
            ['recurrence', 'Recurrence Solver (SymPy)'],
          ] as Array<[Module3Tab, string]>
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
        title="Generating Functions & Recurrence Relations (SymPy Engine)"
        introduction="Symbolic series expansion, coefficient extraction, partition counting, and closed-form linear recurrence solving with exact numerical verification."
        definition="Evaluated symbolically on the Python backend via SymPy rsolve and Maclaurin series expansion."
        formulaLatex={String.raw`A(x) = \sum_{n=0}^{\infty} a_n x^n, \qquad a_n = c_1 a_{n-1} + c_2 a_{n-2} + f(n)`}
        executing={executing}
        error={error}
        response={response}
        onExecute={execute}
        inputPanel={
          <div className="text-xs space-y-3">
            {(tab === 'ogf' || tab === 'egf') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-[#5B6861] mb-1">
                    {tab === 'ogf' ? 'A(x) Expression' : 'E(x) Expression'}
                  </label>
                  <input
                    type="text"
                    value={tab === 'ogf' ? ogfExpr : egfExpr}
                    onChange={(e) => (tab === 'ogf' ? setOgfExpr(e.target.value) : setEgfExpr(e.target.value))}
                    className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Expansion Order</label>
                  <input type="number" min={2} max={15} value={order} onChange={(e) => setOrder(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Extract Index n</label>
                  <input type="number" min={0} max={15} value={extractIdx} onChange={(e) => setExtractIdx(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {tab === 'partitions' && (
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-[#5B6861] mb-1">Integer n (0–30)</label>
                  <input type="number" min={0} max={30} value={partN} onChange={(e) => setPartN(Number(e.target.value))} className="w-32 rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <label className="inline-flex items-center gap-2 pt-4">
                  <input type="checkbox" checked={distinctOnly} onChange={(e) => setDistinctOnly(e.target.checked)} />
                  <span>Distinct parts only q(n)</span>
                </label>
              </div>
            )}

            {tab === 'sequences' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">Sequence Family</label>
                  <select value={seqType} onChange={(e) => setSeqType(e.target.value as typeof seqType)} className="w-full rounded border border-[#C6CFC8] bg-white px-3 py-1.5">
                    <option value="fibonacci">Fibonacci</option>
                    <option value="catalan">Catalan</option>
                    <option value="bell">Bell Numbers</option>
                    <option value="stirling_second">Stirling 2nd Kind S(n,k)</option>
                    <option value="derangement">Derangements !n</option>
                    <option value="lucas">Lucas Numbers</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Terms Count</label>
                  <input type="number" min={2} max={18} value={seqTerms} onChange={(e) => setSeqTerms(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                {seqType === 'stirling_second' && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">Blocks k</label>
                    <input type="number" min={1} max={10} value={stirlingK} onChange={(e) => setStirlingK(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                  </div>
                )}
              </div>
            )}

            {tab === 'recurrence' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[#5B6861] mb-1">Order</label>
                  <select value={recOrder} onChange={(e) => setRecOrder(Number(e.target.value) as 1 | 2)} className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5">
                    <option value={1}>1st Order</option>
                    <option value={2}>2nd Order</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">c₁ (coeff of aₙ₋₁)</label>
                  <input type="number" step="0.5" value={c1} onChange={(e) => setC1(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                {recOrder === 2 && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">c₂ (coeff of aₙ₋₂)</label>
                    <input type="number" step="0.5" value={c2} onChange={(e) => setC2(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                )}
                <div>
                  <label className="block text-[#5B6861] mb-1">Initial a₀</label>
                  <input type="number" step="1" value={a0} onChange={(e) => setA0(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                {recOrder === 2 && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">Initial a₁</label>
                    <input type="number" step="1" value={a1} onChange={(e) => setA1(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                )}
                <div>
                  <label className="block text-[#5B6861] mb-1">Non-Homogeneous f(n)</label>
                  <select value={nhType} onChange={(e) => setNhType(e.target.value as typeof nhType)} className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5">
                    <option value="none">0 (Homogeneous)</option>
                    <option value="constant">Constant d</option>
                    <option value="linear">Linear d·n</option>
                    <option value="exponential">Exponential d·bⁿ</option>
                  </select>
                </div>
                {nhType !== 'none' && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">d Coefficient</label>
                    <input type="number" step="1" value={nhCoeff} onChange={(e) => setNhCoeff(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                )}
                {nhType === 'exponential' && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">Base b</label>
                    <input type="number" step="1" value={nhBase} onChange={(e) => setNhBase(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                )}
                <div>
                  <label className="block text-[#5B6861] mb-1">Terms Count</label>
                  <input type="number" min={3} max={25} value={recTerms} onChange={(e) => setRecTerms(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
              </div>
            )}
          </div>
        }
        renderResultSummary={(res) => {
          const r = res.result as Record<string, unknown>;
          if (tab === 'recurrence' && r.closed_form_latex) {
            return (
              <div className="space-y-3 text-xs">
                <div className="rounded bg-[#F5F6F3] p-3">
                  <div className="text-[11px] font-semibold text-[#5B6861] mb-1">Symbolic Closed-Form Solution</div>
                  <LatexFormula latex={`a_n = ${String(r.closed_form_latex)}`} displayMode={false} />
                </div>
                <pre className="overflow-x-auto rounded bg-[#F5F6F3] p-3 font-mono text-xs text-[#151B18]">
                  {JSON.stringify(r, null, 2)}
                </pre>
              </div>
            );
          }
          return (
            <pre className="overflow-x-auto rounded bg-[#F5F6F3] p-3 font-mono text-xs text-[#151B18]">
              {JSON.stringify(r, null, 2)}
            </pre>
          );
        }}
        renderVisualization={(res) => {
          const vis = res.visualization as Record<string, unknown>;
          const series = (vis.series as Array<Record<string, number>>) || [];
          if (series.length === 0) return null;
          return (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                  <XAxis dataKey="n" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  {tab === 'recurrence' ? (
                    <>
                      <Line type="monotone" dataKey="iterative" stroke="#1B4332" strokeWidth={2} name="Iterative" />
                      <Line type="monotone" dataKey="closed_form" stroke="#D97706" strokeDasharray="4 4" strokeWidth={2} name="Closed Form" />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="an" stroke="#1B4332" strokeWidth={2} name="aₙ" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      />
    </div>
  );
}
