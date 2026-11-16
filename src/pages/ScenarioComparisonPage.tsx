import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, CheckCircle2, Download, FlaskConical, Play, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { Dataset, ProcessedGrid, ScenarioComparisonResponse } from '../types/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

const DEFAULT_PARAMS_BY_MODULE: Record<string, string> = {
  cellular_automata: JSON.stringify(
    {
      neighborhood: 'moore_8',
      boundary_condition: 'absorbing',
      base_transition_factor: 0.6,
      moisture_damping: 0.2,
      wind_direction: 'E',
      wind_bias: 0.15,
      steps: 6,
      deterministic_mode: true,
    },
    null,
    2,
  ),
  graph_theory: JSON.stringify(
    { neighborhood: 'von_neumann_4', boundary_condition: 'absorbing', patch_rows: 6, patch_cols: 6 },
    null,
    2,
  ),
  combinatorics: JSON.stringify({ topic: 'combinations', n: 10, r: 4 }, null, 2),
  logic: JSON.stringify({ expression: '(P & Q) -> R' }, null, 2),
  generating_functions: JSON.stringify({ expression: '1 / (1 - 2*x)', order: 8, extract_index: 5 }, null, 2),
  recurrence: JSON.stringify({ order: 2, c1: 1, c2: 1, initial_a0: 0, initial_a1: 1, terms_count: 10 }, null, 2),
  trees_algorithms: JSON.stringify({ algorithm: 'kruskal' }, null, 2),
};

const SCENARIO_COLORS = ['#1B4332', '#B45309', '#2563EB', '#7C3AED', '#B42318'];

export function ScenarioComparisonPage() {
  const navigate = useNavigate();
  const [comparison, setComparison] = useState<ScenarioComparisonResponse | null>(null);
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected simulations for side-by-side comparison
  const [selectedSimIds, setSelectedSimIds] = useState<number[]>([]);

  // Experiment workbench form state
  const [expName, setExpName] = useState('');
  const [expModule, setExpModule] = useState('cellular_automata');
  const [expGridId, setExpGridId] = useState<string>('');
  const [expDatasetId, setExpDatasetId] = useState<string>('');
  const [expDesc, setExpDesc] = useState('');
  const [expParamsText, setExpParamsText] = useState(DEFAULT_PARAMS_BY_MODULE.cellular_automata);
  const [creatingExp, setCreatingExp] = useState(false);
  const [runningExpId, setRunningExpId] = useState<number | null>(null);
  const [expandedExpId, setExpandedExpId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [comp, gridList, dsRes] = await Promise.all([
        apiClient.getScenarioComparison(),
        apiClient.listGrids(),
        apiClient.listDatasets(),
      ]);
      setComparison(comp);
      setGrids(gridList);
      setDatasets(dsRes.items);

      if (gridList.length > 0 && !expGridId) {
        setExpGridId(String(gridList[0].id));
      }
      if (dsRes.items.length > 0 && !expDatasetId) {
        setExpDatasetId(String(dsRes.items[0].id));
      }
      setSelectedSimIds((prev) => {
        if (prev.length > 0) {
          return prev.filter((id) => comp.simulation_scenarios.some((s) => s.simulation_id === id));
        }
        return comp.simulation_scenarios.slice(0, 3).map((s) => s.simulation_id);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenario comparison data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSimSelection = (simId: number) => {
    setSelectedSimIds((prev) =>
      prev.includes(simId) ? prev.filter((id) => id !== simId) : [...prev, simId].slice(0, 5),
    );
  };

  const handleModuleChange = (mod: string) => {
    setExpModule(mod);
    setExpParamsText(DEFAULT_PARAMS_BY_MODULE[mod] || '{}');
  };

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim()) {
      setFeedback({ type: 'error', text: 'Provide a descriptive name for the experiment.' });
      return;
    }
    let parsedParams: Record<string, unknown> = {};
    try {
      parsedParams = JSON.parse(expParamsText);
    } catch {
      setFeedback({ type: 'error', text: 'Experiment parameters must be valid JSON.' });
      return;
    }

    setCreatingExp(true);
    setFeedback(null);
    try {
      const created = await apiClient.createExperiment({
        name: expName.trim(),
        module_type: expModule,
        description: expDesc.trim() || undefined,
        grid_id: expGridId ? Number(expGridId) : null,
        dataset_id: expDatasetId ? Number(expDatasetId) : null,
        parameters: parsedParams,
      });
      setExpName('');
      setExpDesc('');
      setExpandedExpId(created.id);
      setFeedback({ type: 'success', text: `Experiment "${created.name}" registered (#${created.id}).` });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create experiment.' });
    } finally {
      setCreatingExp(false);
    }
  };

  const handleExecuteExperiment = async (expId: number) => {
    setRunningExpId(expId);
    setFeedback(null);
    try {
      const executed = await apiClient.executeExperiment(expId);
      setExpandedExpId(executed.id);
      setFeedback({
        type: 'success',
        text: `Experiment "${executed.name}" completed (${executed.status}).`,
      });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Experiment execution failed.' });
    } finally {
      setRunningExpId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.deleteExperiment(deleteTarget.id);
      setFeedback({ type: 'success', text: `Deleted experiment "${deleteTarget.name}".` });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete experiment.' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const comparedScenarios = useMemo(() => {
    if (!comparison) return [];
    return comparison.simulation_scenarios.filter((s) => selectedSimIds.includes(s.simulation_id));
  }, [comparison, selectedSimIds]);

  const stateComparisonChartData = useMemo(() => {
    return comparedScenarios.map((s) => ({
      name: s.name.length > 18 ? `${s.name.slice(0, 18)}…` : s.name,
      unburned: s.final_state_counts.unburned ?? 0,
      ignited: s.final_state_counts.ignited ?? 0,
      burning: s.final_state_counts.burning ?? 0,
      extinguished: s.final_state_counts.extinguished ?? 0,
      non_burnable: s.final_state_counts.non_burnable ?? 0,
    }));
  }, [comparedScenarios]);

  const trajectoryChartData = useMemo(() => {
    if (comparedScenarios.length === 0) return [];
    const maxGen = Math.max(
      ...comparedScenarios.map((s) => (s.trajectory.length ? s.trajectory[s.trajectory.length - 1].generation : 0)),
      0,
    );
    const rows: Array<Record<string, number | string>> = [];
    for (let g = 0; g <= maxGen; g += 1) {
      const row: Record<string, number | string> = { generation: `t=${g}` };
      comparedScenarios.forEach((s) => {
        const pt = s.trajectory.find((t) => t.generation === g);
        if (pt) {
          row[`sim_${s.simulation_id}`] = pt.affected_cell_count;
        }
      });
      rows.push(row);
    }
    return rows;
  }, [comparedScenarios]);

  if (loading) return <LoadingState message="Loading scenario comparison and experiment workspace..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const simCount = comparison?.simulation_scenarios.length ?? 0;
  const expCount = comparison?.experiments.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Non-Forecast Scientific Notice */}
      <section className="rounded-lg border border-[#DCE2DC] bg-[#F5F6F3] px-5 py-3.5 text-xs text-[#2A332E] leading-relaxed">
        <span className="font-semibold text-[#151B18]">Hypothetical Scenario Boundary: </span>
        {comparison?.scenario_notice ||
          'Scenario comparisons evaluate bounded, hypothetical cellular automaton and mathematical configurations side-by-side for educational sensitivity analysis. They are NOT operational wildfire forecasts.'}
      </section>

      {simCount === 0 && grids.length === 0 && expCount === 0 && (
        <EmptyState
          title="No simulations or experiments available to compare"
          description="Generate a structured grid in the Geospatial Laboratory and run controlled cellular automata scenarios or register mathematical experiments below."
          actionLabel="Open Cellular Automata Lab"
          onAction={() => navigate('/cellular-automata')}
        />
      )}

      {/* Controlled Simulation Scenario Comparison */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBE6] pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#151B18]">
              Hypothetical Cellular Automata Scenario Comparison ({simCount})
            </h2>
            <p className="mt-1 text-xs text-[#5B6861]">
              Select up to 5 controlled scenarios to compare dataset versions, neighborhood rules, initial conditions, state distributions, and graph topology.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/cellular-automata')}
            className="rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3]"
          >
            Open Cellular Automata Lab
          </button>
        </div>

        {simCount === 0 ? (
          <p className="text-xs text-[#6B7871]">
            No cellular automata simulations have been saved yet. Create and step scenarios in the Cellular Automata Lab to compare them side-by-side.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {comparison?.simulation_scenarios.map((s) => {
                const checked = selectedSimIds.includes(s.simulation_id);
                return (
                  <label
                    key={s.simulation_id}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'border-[#1B4332] bg-[#EEF3EF] text-[#151B18] font-medium'
                        : 'border-[#DCE2DC] bg-white text-[#4B5851] hover:bg-[#FAFBF9]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSimSelection(s.simulation_id)}
                      className="rounded border-[#C6CFC8]"
                    />
                    <span>{s.name}</span>
                    <span className="font-mono text-[11px] text-[#5B6861]">t={s.generation_count}</span>
                  </label>
                );
              })}
            </div>

            {comparedScenarios.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                        <th className="py-2 pr-3 font-medium">Metric / Assumption</th>
                        {comparedScenarios.map((s) => (
                          <th key={s.simulation_id} className="py-2 px-3 font-semibold text-[#151B18]">
                            {s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2EF]">
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Classification</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono text-[#151B18]">
                            {s.data_classification}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Input Dataset & Hash</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono text-[#151B18]">
                            {s.dataset_name || 'N/A'} ({s.dataset_hash || '—'})
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Grid Configuration</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono tabular-nums">
                            {s.grid_name} · {s.grid_configuration.rows ?? '?'}×{s.grid_configuration.cols ?? '?'} @{' '}
                            {s.grid_configuration.resolution_meters ?? '?'}m ({s.grid_configuration.crs ?? '—'})
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Neighborhood / Boundary</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono">
                            {s.mathematical_assumptions.neighborhood} · {s.mathematical_assumptions.boundary_condition}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">CA Parameters</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono text-[11px] text-[#4B5851]">
                            factor={String(s.mathematical_assumptions.parameters.base_transition_factor ?? '—')}, damp=
                            {String(s.mathematical_assumptions.parameters.moisture_damping ?? '—')}, wind=
                            {String(s.mathematical_assumptions.parameters.wind_direction ?? '—')} (
                            {String(s.mathematical_assumptions.parameters.wind_bias ?? '0')})
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Initial Conditions</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono tabular-nums">
                            {s.initial_conditions.seed_count} seed cell(s)
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Generations / Affected</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono tabular-nums font-medium text-[#151B18]">
                            {s.generation_count}/{s.max_generations} steps · {s.affected_cell_count} affected
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Final State Counts</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono text-[11px] tabular-nums">
                            U:{s.final_state_counts.unburned ?? 0} · I:{s.final_state_counts.ignited ?? 0} · B:
                            {s.final_state_counts.burning ?? 0} · E:{s.final_state_counts.extinguished ?? 0} · NB:
                            {s.final_state_counts.non_burnable ?? 0}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Graph Topology (|V|, |E|)</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono tabular-nums">
                            |V|={s.graph_metrics.vertices ?? '—'} · |E|={s.graph_metrics.edges ?? '—'} · comp=
                            {s.graph_metrics.connected_components ?? '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 text-[#5B6861]">Data Quality / Duration</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.simulation_id} className="py-2 px-3 font-mono tabular-nums">
                            {s.data_quality.valid_cell_pct !== null ? `${s.data_quality.valid_cell_pct}% valid` : '—'} ·{' '}
                            {s.processing_duration_ms !== null ? `${s.processing_duration_ms} ms` : 'Single-step'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Comparison Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                  <div className="rounded-md border border-[#E7EBE6] p-4">
                    <h3 className="text-xs font-semibold text-[#151B18] mb-3">
                      Final Cell-State Distribution Across Scenarios
                    </h3>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stateComparisonChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4B5851' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#4B5851' }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="unburned" stackId="a" fill="#2D6A4F" name="Unburned" />
                          <Bar dataKey="ignited" stackId="a" fill="#D97706" name="Ignited" />
                          <Bar dataKey="burning" stackId="a" fill="#B42318" name="Burning" />
                          <Bar dataKey="extinguished" stackId="a" fill="#526059" name="Extinguished" />
                          <Bar dataKey="non_burnable" stackId="a" fill="#CBD5CE" name="Non-burnable" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-md border border-[#E7EBE6] p-4">
                    <h3 className="text-xs font-semibold text-[#151B18] mb-3">
                      Affected Cell Trajectory by Generation (Hypothetical)
                    </h3>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trajectoryChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                          <XAxis dataKey="generation" tick={{ fontSize: 10, fill: '#4B5851' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#4B5851' }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          {comparedScenarios.map((s, idx) => (
                            <Line
                              key={s.simulation_id}
                              type="monotone"
                              dataKey={`sim_${s.simulation_id}`}
                              name={s.name}
                              stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                              strokeWidth={2}
                              dot={{ r: 2.5 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* Reproducible Experiment Management Workbench */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBE6] pb-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[#1B4332]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#151B18]">
                Experiment Management & Execution ({expCount})
              </h2>
              <p className="text-xs text-[#5B6861]">
                Create, execute, inspect, export (JSON/CSV), and delete reproducible experiments linked to exact dataset SHA-256 checksums.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleCreateExperiment} className="rounded-md border border-[#DCE2DC] bg-[#FAFBF9] p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Experiment Name *</label>
              <input
                type="text"
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                placeholder="e.g. Nagarhole Moore Sensitivity"
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
              />
            </div>

            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Mathematical / CA Module</label>
              <select
                value={expModule}
                onChange={(e) => handleModuleChange(e.target.value)}
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
              >
                <option value="cellular_automata">Cellular Automata</option>
                <option value="graph_theory">Graph Theory (Grid Inspection)</option>
                <option value="combinatorics">Combinatorics (Module I)</option>
                <option value="logic">Mathematical Logic (Module II)</option>
                <option value="generating_functions">Generating Functions (Module III)</option>
                <option value="recurrence">Recurrence Relations (Module III)</option>
                <option value="trees_algorithms">Trees & Graph Algorithms (Module V)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Linked Grid (Optional)</label>
              <select
                value={expGridId}
                onChange={(e) => setExpGridId(e.target.value)}
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
              >
                <option value="">Unbound / Pure Math</option>
                {grids.map((g) => (
                  <option key={g.id} value={g.id}>
                    #{g.id} {g.name} ({g.rows}×{g.cols})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Dataset Version Lock</label>
              <select
                value={expDatasetId}
                onChange={(e) => setExpDatasetId(e.target.value)}
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
              >
                <option value="">Derive from Grid / None</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.sha256_hash.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Description & Hypothesis Notes</label>
              <textarea
                rows={4}
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Document controlled assumptions and parameter choices..."
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Configuration Parameters (JSON)</label>
              <textarea
                rows={4}
                value={expParamsText}
                onChange={(e) => setExpParamsText(e.target.value)}
                className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              {feedback && (
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    feedback.type === 'success' ? 'text-[#1E6B45]' : 'text-[#B42318]'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={creatingExp}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1B4332] px-4 py-2 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{creatingExp ? 'Registering...' : 'Register Experiment'}</span>
            </button>
          </div>
        </form>

        {expCount === 0 ? (
          <p className="text-xs text-[#6B7871]">No experiments registered yet. Register an experiment configuration above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                  <th className="py-2 font-medium">Experiment</th>
                  <th className="py-2 font-medium">Module</th>
                  <th className="py-2 font-medium">Grid / Dataset Hash</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Executed</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2EF]">
                {comparison?.experiments.map((exp) => (
                  <React.Fragment key={exp.id}>
                    <tr>
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => setExpandedExpId(expandedExpId === exp.id ? null : exp.id)}
                          className="font-medium text-[#151B18] hover:underline text-left"
                        >
                          {exp.name}
                        </button>
                      </td>
                      <td className="py-2.5 font-mono text-[#4B5851]">{exp.module_type}</td>
                      <td className="py-2.5 font-mono text-[11px] text-[#5B6861]">
                        {exp.grid_name || (exp.grid_id ? `Grid #${exp.grid_id}` : 'Pure Math')} ·{' '}
                        {exp.dataset_version_hash ? exp.dataset_version_hash.slice(0, 12) : 'No dataset lock'}
                      </td>
                      <td className="py-2.5 font-medium text-[#151B18]">{exp.status}</td>
                      <td className="py-2.5 font-mono tabular-nums text-[#5B6861]">
                        {exp.executed_at ? new Date(exp.executed_at).toLocaleString() : 'Not run'}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          disabled={runningExpId === exp.id}
                          onClick={() => handleExecuteExperiment(exp.id)}
                          className="inline-flex items-center gap-1 rounded border border-[#1B4332] bg-[#1B4332] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#143326] disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          <span>{runningExpId === exp.id ? 'Running...' : 'Execute'}</span>
                        </button>
                        <a
                          href={apiClient.getExperimentExportUrl(exp.id, 'json')}
                          className="inline-flex items-center gap-1 rounded border border-[#C6CFC8] px-2 py-1 text-[11px] text-[#151B18] hover:bg-[#F5F6F3]"
                        >
                          <Download className="h-3 w-3" />
                          <span>JSON</span>
                        </a>
                        <a
                          href={apiClient.getExperimentExportUrl(exp.id, 'csv')}
                          className="inline-flex items-center gap-1 rounded border border-[#C6CFC8] px-2 py-1 text-[11px] text-[#151B18] hover:bg-[#F5F6F3]"
                        >
                          <Download className="h-3 w-3" />
                          <span>CSV</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: exp.id, name: exp.name })}
                          className="inline-flex items-center rounded border border-[#E7EBE6] p-1 text-[#6B7871] hover:border-[#F2B8B5] hover:text-[#B42318]"
                          title="Delete experiment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {expandedExpId === exp.id && (
                      <tr className="bg-[#FAFBF9]">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="font-semibold text-[#151B18] mb-1">Parameters</div>
                              <pre className="max-h-48 overflow-auto rounded border border-[#E7EBE6] bg-white p-2.5 font-mono text-[11px]">
                                {JSON.stringify(exp.parameters, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="font-semibold text-[#151B18] mb-1">Execution Results</div>
                              <pre className="max-h-48 overflow-auto rounded border border-[#E7EBE6] bg-white p-2.5 font-mono text-[11px]">
                                {exp.results_json
                                  ? JSON.stringify(exp.results_json, null, 2)
                                  : 'Not executed yet. Click Execute to compute and persist results.'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Structured Grid Baseline Table */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
        <h2 className="font-display text-base font-semibold text-[#151B18]">
          Structured Grid Baseline Comparison ({grids.length})
        </h2>
        <p className="mt-1 text-xs text-[#5B6861]">
          Compare spatial resolutions, boundary clipping state, valid cell coverage, and NetworkX topology across processed grids.
        </p>

        {grids.length === 0 ? (
          <p className="mt-4 text-xs text-[#6B7871]">No processed grids available yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                  <th className="py-2 font-medium">Grid Name</th>
                  <th className="py-2 font-medium">CRS</th>
                  <th className="py-2 font-medium text-right">Resolution (m)</th>
                  <th className="py-2 font-medium text-right">Dimensions</th>
                  <th className="py-2 font-medium text-right">Valid / Total</th>
                  <th className="py-2 font-medium text-right">Graph Edges</th>
                  <th className="py-2 font-medium">Boundary Clipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                {grids.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2.5 font-sans font-medium text-[#151B18]">{g.name}</td>
                    <td className="py-2.5">{g.crs}</td>
                    <td className="py-2.5 text-right">{g.resolution_meters.toFixed(1)}</td>
                    <td className="py-2.5 text-right">
                      {g.rows}×{g.cols}
                    </td>
                    <td className="py-2.5 text-right">
                      {g.valid_cell_count}/{g.cell_count}
                    </td>
                    <td className="py-2.5 text-right">{g.metadata_json?.graph_edges ?? 0}</td>
                    <td className="py-2.5 font-sans">{g.clipped_to_boundary ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Registered Experiment"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This removes its parameter history and stored execution output from SQLite.`
            : ''
        }
        confirmLabel="Delete Experiment"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
