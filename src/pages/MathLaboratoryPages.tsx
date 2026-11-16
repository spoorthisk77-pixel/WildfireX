import React, { useEffect, useState } from 'react';
import { CheckCircle2, Network, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { Experiment, ProcessedGrid } from '../types/api';
import { ErrorState, LoadingState } from '../components/StateViews';

interface MathModuleSpec {
  moduleType: string;
  title: string;
  phaseLabel: string;
  mathematicalScope: string;
  plannedCapabilities: string[];
  defaultParameters: Record<string, unknown>;
}

export const MATH_MODULE_SPECS: Record<string, MathModuleSpec> = {
  cellular_automata: {
    moduleType: 'cellular_automata',
    title: 'Cellular Automata Studio',
    phaseLabel: 'Phase 2 Simulation Engine · Foundation Ready',
    mathematicalScope:
      'Discrete 2D lattice automaton over structured Nagarhole land-cover cells with 4-neighbor (von Neumann) and 8-neighbor (Moore) transition rules.',
    plannedCapabilities: [
      'Deterministic and stochastic state transitions (Unburned, Ignited, Burning, Extinguished, Non-burnable)',
      'Slope and wind-vector directional spread bias derived from SRTM elevation gradients',
      'Step-by-step lattice playback coupled with the 3D Landscape voxel renderer',
    ],
    defaultParameters: { neighborhood: 'moore_8', base_ignition_prob: 0.42, steps: 25 },
  },
  graph_theory: {
    moduleType: 'graph_theory',
    title: 'Graph Theory Explorer',
    phaseLabel: 'Topology Metrics Active · Solver Expansion in Phase 2',
    mathematicalScope:
      'Undirected and weighted landscape graph G = (V, E) where vertices V correspond to valid grid cells and edges E capture spatial fuel adjacency.',
    plannedCapabilities: [
      'Inspect real NetworkX vertex counts, edge counts, and connected components from generated grids',
      'Degree distribution, articulation points, and minimum cut-set fuel-break analysis (Phase 2)',
      'Spectral Laplacian connectivity and percolation threshold estimation (Phase 2)',
    ],
    defaultParameters: { weighting: 'landcover_conductance', compute_centrality: true },
  },
  combinatorics: {
    moduleType: 'combinatorics',
    title: 'Combinatorics Laboratory',
    phaseLabel: 'Phase 2 Discrete Enumeration Module',
    mathematicalScope:
      'Combinatorial enumeration of multi-point ignition configurations, connected burning subgraphs, and k-cell firebreak placements.',
    plannedCapabilities: [
      'Binomial and multinomial enumeration over stratified fuel classes',
      'Polya-Burnside symmetry counting on bounded lattice patches',
      'Optimal k-barrier placement combinations under budget constraints',
    ],
    defaultParameters: { ignition_points_k: 3, barrier_budget: 8 },
  },
  mathematical_logic: {
    moduleType: 'mathematical_logic',
    title: 'Mathematical Logic',
    phaseLabel: 'Phase 2 Formal Transition Verification',
    mathematicalScope:
      'Propositional and first-order predicates governing valid cell state transitions, safety invariants, and containment proofs.',
    plannedCapabilities: [
      'Formal predicate editor for ignition preconditions (e.g. Fuel(c) ∧ Dry(c) ∧ ∃n∈N(c): Burning(n))',
      'Truth-table evaluation across land-cover classes and moisture thresholds',
      'Reachability invariant checking across boundary buffer zones',
    ],
    defaultParameters: { logic_system: 'first_order_spatial', verify_water_barrier: true },
  },
  generating_functions: {
    moduleType: 'generating_functions',
    title: 'Generating Functions',
    phaseLabel: 'Phase 2 Analytic Combinatorics Module',
    mathematicalScope:
      'Ordinary and exponential generating functions modeling fire-cluster size distributions and branching ignition cascades.',
    plannedCapabilities: [
      'Coefficient extraction for expected cluster sizes at discrete time horizons',
      'Probability generating functions for secondary ember spotting',
      'Asymptotic growth rate comparison against empirical FIRMS cluster sizes',
    ],
    defaultParameters: { series_order: 12, branching_mean: 1.35 },
  },
  recurrence_relations: {
    moduleType: 'recurrence_relations',
    title: 'Recurrence Relations',
    phaseLabel: 'Phase 2 Discrete Dynamical Systems Module',
    mathematicalScope:
      'Linear and non-linear difference equations tracking active fire-front perimeter P_t and cumulative burned area B_t.',
    plannedCapabilities: [
      'Closed-form and iterative evaluation of discrete SIR-like forest compartment recurrences',
      'Stability and fixed-point analysis under suppression intervention rates',
      'Calibration against time-indexed cellular automaton trajectories',
    ],
    defaultParameters: { time_horizon: 30, suppression_rate: 0.12 },
  },
  trees_algorithms: {
    moduleType: 'trees_algorithms',
    title: 'Trees and Algorithms',
    phaseLabel: 'Phase 2 Spanning & Traversal Algorithms',
    mathematicalScope:
      'Spanning trees, breadth-first ignition cascades, and Dijkstra/A* minimum-resistance spread paths on the weighted landscape graph.',
    plannedCapabilities: [
      'BFS ignition wavefront tree construction from historical FIRMS origin cells',
      'Minimum spanning corridor extraction across high-fuel tree-cover clusters',
      'Max-flow / min-cut firebreak corridor optimization',
    ],
    defaultParameters: { algorithm: 'dijkstra_spread', heuristic: 'euclidean' },
  },
};

export function MathLaboratoryPage({ specKey }: { specKey: string }) {
  const spec = MATH_MODULE_SPECS[specKey] || MATH_MODULE_SPECS.cellular_automata;

  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expName, setExpName] = useState(`${spec.title} Configuration`);
  const [selectedGridId, setSelectedGridId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [gridList, expList] = await Promise.all([apiClient.listGrids(), apiClient.listExperiments()]);
      setGrids(gridList);
      setExperiments(expList.filter((e) => e.module_type === spec.moduleType));
      if (gridList.length > 0 && !selectedGridId) {
        setSelectedGridId(String(gridList[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load laboratory module.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setExpName(`${spec.title} Configuration`);
    setSaveMessage(null);
    void loadData();
  }, [specKey]);

  const handleRegisterExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await apiClient.createExperiment({
        name: expName.trim(),
        module_type: spec.moduleType,
        description: spec.mathematicalScope,
        grid_id: selectedGridId ? Number(selectedGridId) : null,
        parameters: spec.defaultParameters,
        notes: notes.trim() || undefined,
      });
      setNotes('');
      setSaveMessage('Experiment configuration saved to SQLite.');
      await loadData();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to register experiment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await apiClient.deleteExperiment(id);
    await loadData();
  };

  if (loading) return <LoadingState message={`Loading ${spec.title}...`} />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      {/* Module Architecture & Implementation State Disclosure */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7EBE6] pb-3">
          <div>
            <div className="text-xs font-medium text-[#9A5B13]">{spec.phaseLabel}</div>
            <h2 className="mt-1 font-display text-xl font-semibold text-[#151B18]">{spec.title}</h2>
          </div>
          <span className="font-mono text-xs text-[#5B6861]">Module: {spec.moduleType}</span>
        </div>

        <p className="text-sm leading-relaxed text-[#4B5851] max-w-3xl">{spec.mathematicalScope}</p>

        <div className="rounded-md bg-[#F5F6F3] p-4">
          <div className="text-xs font-semibold text-[#151B18] mb-2">Module Specification & Roadmap</div>
          <ul className="space-y-1.5 text-xs text-[#4B5851] list-disc pl-4">
            {spec.plannedCapabilities.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Graph Theory Real Grid Metrics when in Graph Theory Explorer */}
      {specKey === 'graph_theory' && grids.length > 0 && (
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-3">
          <h3 className="font-display text-sm font-semibold text-[#151B18] flex items-center gap-2">
            <Network className="h-4 w-4 text-[#1B4332]" />
            <span>Extracted NetworkX Graph Topology from Processed Grids</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                  <th className="py-2 font-medium">Grid</th>
                  <th className="py-2 font-medium text-right">Vertices |V|</th>
                  <th className="py-2 font-medium text-right">Edges |E|</th>
                  <th className="py-2 font-medium text-right">Components</th>
                  <th className="py-2 font-medium text-right">Connectivity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                {grids.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 font-sans font-medium text-[#151B18]">{g.name}</td>
                    <td className="py-2 text-right">{g.metadata_json?.graph_nodes ?? g.valid_cell_count}</td>
                    <td className="py-2 text-right">{g.metadata_json?.graph_edges ?? 0}</td>
                    <td className="py-2 text-right">{g.metadata_json?.connected_components ?? '—'}</td>
                    <td className="py-2 text-right">{g.metadata_json?.connectivity ?? 4}-neighbor</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Experiment Configuration Registration (Persisted in SQLite) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
          <h3 className="font-display text-sm font-semibold text-[#151B18] border-b border-[#E7EBE6] pb-3">
            Register Experiment Configuration
          </h3>
          <form onSubmit={handleRegisterExperiment} className="mt-4 space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Experiment Name *</label>
              <input
                type="text"
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Target Structured Grid (Optional)</label>
              <select
                value={selectedGridId}
                onChange={(e) => setSelectedGridId(e.target.value)}
                className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
              >
                <option value="">None (Bind later)</option>
                {grids.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.rows}×{g.cols})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#2A332E] mb-1">Research Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hypotheses, initial parameter justification, or citation notes..."
                className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#1E6B45] flex items-center gap-1">
                {saveMessage && <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{saveMessage || ''}</span>
              </span>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1B4332] px-3.5 py-2 font-medium text-white hover:bg-[#143326] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
          <h3 className="font-display text-sm font-semibold text-[#151B18] border-b border-[#E7EBE6] pb-3">
            Saved Configurations ({experiments.length})
          </h3>
          {experiments.length === 0 ? (
            <p className="mt-4 text-xs text-[#6B7871]">
              No experiment configurations registered for this module yet.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#F0F2EF]">
              {experiments.map((exp) => (
                <div key={exp.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-[#151B18]">{exp.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#5B6861]">
                      Status: {exp.status} · Grid #{exp.grid_id ?? 'Unbound'} ·{' '}
                      {new Date(exp.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(exp.id)}
                    className="rounded p-1 text-[#6B7871] hover:text-[#B42318]"
                    title="Delete configuration"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
