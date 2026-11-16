import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../services/apiClient';
import type { MathTopicResponse } from '../types/api';
import { MathLabSection } from '../components/MathLabSection';
import { LatexFormula } from '../components/LatexFormula';

type CombTopic =
  | 'sum_rule'
  | 'product_rule'
  | 'permutations'
  | 'combinations'
  | 'combinations_repetition'
  | 'pigeonhole'
  | 'inclusion_exclusion'
  | 'generalized_inclusion_exclusion'
  | 'derangements'
  | 'rook_polynomials';

const TOPIC_LIST: Array<{ key: CombTopic; label: string }> = [
  { key: 'sum_rule', label: 'Rule of Sum' },
  { key: 'product_rule', label: 'Rule of Product' },
  { key: 'permutations', label: 'Permutations' },
  { key: 'combinations', label: 'Combinations' },
  { key: 'combinations_repetition', label: 'With Repetition' },
  { key: 'pigeonhole', label: 'Pigeonhole' },
  { key: 'inclusion_exclusion', label: 'Inclusion-Exclusion' },
  { key: 'generalized_inclusion_exclusion', label: 'Gen. Inc-Exc' },
  { key: 'derangements', label: 'Derangements !n' },
  { key: 'rook_polynomials', label: 'Rook Polynomials' },
];

export function CombinatoricsPage() {
  const [topic, setTopic] = useState<CombTopic>('combinations');
  const [n, setN] = useState(10);
  const [r, setR] = useState(3);
  const [groupSizesText, setGroupSizesText] = useState('4, 7, 3');
  const [multText, setMultText] = useState('');
  const [items, setItems] = useState(25);
  const [containers, setContainers] = useState(6);

  // Inclusion-Exclusion
  const [universe, setUniverse] = useState(100);
  const [setA, setSetA] = useState(40);
  const [setB, setSetB] = useState(35);
  const [setC, setSetC] = useState('');
  const [ab, setAb] = useState(12);
  const [ac, setAc] = useState('');
  const [bc, setBc] = useState('');
  const [abc, setAbc] = useState('');
  const [genSumsText, setGenSumsText] = useState('90, 45, 12, 2');

  // Rook board 4x4
  const [board, setBoard] = useState<number[][]>([
    [1, 0, 1, 0],
    [1, 1, 0, 1],
    [0, 1, 1, 0],
    [0, 0, 1, 1],
  ]);

  const [response, setResponse] = useState<MathTopicResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { topic };
      if (topic === 'sum_rule' || topic === 'product_rule') {
        payload.group_sizes = groupSizesText
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((v) => !Number.isNaN(v));
      } else if (topic === 'permutations') {
        payload.n = n;
        payload.r = r;
        if (multText.trim()) {
          payload.repetition_multiplicities = multText
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((v) => !Number.isNaN(v));
        }
      } else if (topic === 'combinations' || topic === 'combinations_repetition') {
        payload.n = n;
        payload.r = r;
      } else if (topic === 'pigeonhole') {
        payload.items = items;
        payload.containers = containers;
      } else if (topic === 'inclusion_exclusion') {
        payload.universe_size = universe;
        payload.set_a = setA;
        payload.set_b = setB;
        payload.ab = ab;
        if (setC !== '') {
          payload.set_c = Number(setC);
          payload.ac = Number(ac || 0);
          payload.bc = Number(bc || 0);
          payload.abc = Number(abc || 0);
        }
      } else if (topic === 'generalized_inclusion_exclusion') {
        payload.universe_size = universe;
        payload.intersection_sums = genSumsText
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((v) => !Number.isNaN(v));
      } else if (topic === 'derangements') {
        payload.n = n;
      } else if (topic === 'rook_polynomials') {
        payload.board_matrix = board;
      }
      const res = await apiClient.solveCombinatorics(payload);
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Combinatorics computation failed.');
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    void execute();
  }, [topic]);

  const toggleRookCell = (ri: number, ci: number) => {
    setBoard((prev) => prev.map((row, rIdx) => (rIdx === ri ? row.map((v, cIdx) => (cIdx === ci ? (v ? 0 : 1) : v)) : row)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#DCE2DC] bg-white p-2 text-xs">
        {TOPIC_LIST.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTopic(item.key)}
            className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
              topic === item.key ? 'bg-[#1B4332] text-white' : 'text-[#4B5851] hover:bg-[#F5F6F3]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <MathLabSection
        title="Combinatorics Laboratory"
        introduction="Interactive discrete enumeration across all 10 classical counting principles with exact arbitrary-precision backend calculations."
        definition="Select any topic above and adjust its discrete integer parameters."
        formulaLatex={String.raw`\binom{n}{r} = \frac{n!}{r!(n-r)!}`}
        executing={executing}
        error={error}
        response={response}
        onExecute={execute}
        inputPanel={
          <div className="text-xs space-y-3">
            {(topic === 'sum_rule' || topic === 'product_rule') && (
              <div>
                <label className="block text-[#5B6861] mb-1">Category / Stage Cardinalities (comma-separated)</label>
                <input
                  type="text"
                  value={groupSizesText}
                  onChange={(e) => setGroupSizesText(e.target.value)}
                  className="w-full max-w-md rounded border border-[#C6CFC8] px-3 py-1.5 font-mono"
                />
              </div>
            )}

            {(topic === 'permutations' || topic === 'combinations' || topic === 'combinations_repetition') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">Total Elements / Categories (n)</label>
                  <input type="number" value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Selected Count (r)</label>
                  <input type="number" value={r} onChange={(e) => setR(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                {topic === 'permutations' && (
                  <div>
                    <label className="block text-[#5B6861] mb-1">Multiset Multiplicities (optional)</label>
                    <input
                      type="text"
                      value={multText}
                      onChange={(e) => setMultText(e.target.value)}
                      placeholder="e.g. 3, 2, 1"
                      className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {topic === 'pigeonhole' && (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-[#5B6861] mb-1">Objects / Pigeons (N)</label>
                  <input type="number" value={items} onChange={(e) => setItems(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Containers / Holes (k)</label>
                  <input type="number" min={1} value={containers} onChange={(e) => setContainers(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {topic === 'inclusion_exclusion' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[#5B6861] mb-1">|U| Universe</label>
                  <input type="number" value={universe} onChange={(e) => setUniverse(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|A|</label>
                  <input type="number" value={setA} onChange={(e) => setSetA(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|B|</label>
                  <input type="number" value={setB} onChange={(e) => setSetB(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|A ∩ B|</label>
                  <input type="number" value={ab} onChange={(e) => setAb(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|C| (optional 3-set)</label>
                  <input type="number" value={setC} onChange={(e) => setSetC(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|A ∩ C|</label>
                  <input type="number" value={ac} onChange={(e) => setAc(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|B ∩ C|</label>
                  <input type="number" value={bc} onChange={(e) => setBc(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">|A ∩ B ∩ C|</label>
                  <input type="number" value={abc} onChange={(e) => setAbc(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {topic === 'generalized_inclusion_exclusion' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">|U| Universe Size</label>
                  <input type="number" value={universe} onChange={(e) => setUniverse(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Intersection Sums S₁, S₂, ... (comma-separated)</label>
                  <input type="text" value={genSumsText} onChange={(e) => setGenSumsText(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {topic === 'derangements' && (
              <div className="max-w-xs">
                <label className="block text-[#5B6861] mb-1">Number of Elements n (0–25)</label>
                <input type="number" min={0} max={25} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
              </div>
            )}

            {topic === 'rook_polynomials' && (
              <div>
                <label className="block text-[#5B6861] mb-2">Click squares to toggle Allowed (green = 1) vs Forbidden (dark = 0)</label>
                <div className="inline-grid grid-cols-4 gap-1 bg-[#E7EBE6] p-1.5 rounded">
                  {board.map((row, ri) =>
                    row.map((val, ci) => (
                      <button
                        key={`${ri}-${ci}`}
                        type="button"
                        onClick={() => toggleRookCell(ri, ci)}
                        className={`h-9 w-9 rounded font-mono font-semibold ${
                          val ? 'bg-[#1B4332] text-white' : 'bg-[#D3D9D4] text-[#5B6861]'
                        }`}
                      >
                        {val}
                      </button>
                    )),
                  )}
                </div>
              </div>
            )}
          </div>
        }
        renderResultSummary={(res) => {
          const r = res.result as Record<string, unknown>;
          if (topic === 'rook_polynomials' && r.polynomial_latex) {
            return (
              <div className="space-y-3">
                <div className="rounded bg-[#F5F6F3] p-3">
                  <LatexFormula latex={`R(B, x) = ${String(r.polynomial_latex)}`} displayMode={false} />
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
          const series =
            (vis.series as Array<{ label: string; value: number }>) ||
            (vis.coefficients as Array<{ k: number; rooks: number }>)?.map((c) => ({
              label: `k=${c.k}`,
              value: c.rooks,
            })) ||
            [];
          if (series.length === 0) return null;
          return (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1B4332" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      />
    </div>
  );
}
