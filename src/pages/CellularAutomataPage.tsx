import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Flame,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type {
  GridCell,
  GridCellsPage,
  ProcessedGrid,
  SimulationDetail,
  SimulationRun,
} from '../types/api';
import { getLandcoverVisual } from '../utils/landcoverPalette';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

const STATE_COLORS: Record<string, { hex: string; label: string }> = {
  non_burnable: { hex: '#64748B', label: 'Non-burnable / Barrier' },
  unburned: { hex: '#4B7F52', label: 'Unburned (Fuel-capable)' },
  ignited: { hex: '#D97706', label: 'Ignited (New)' },
  burning: { hex: '#B42318', label: 'Burning (Active)' },
  extinguished: { hex: '#273036', label: 'Extinguished' },
};

export function CellularAutomataPage() {
  const navigate = useNavigate();
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [cellsPage, setCellsPage] = useState<GridCellsPage | null>(null);
  const [simulations, setSimulations] = useState<SimulationRun[]>([]);
  const [activeSim, setActiveSim] = useState<SimulationDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New simulation configuration
  const [simName, setSimName] = useState('Nagarhole Bounded CA Study');
  const [neighborhood, setNeighborhood] = useState<'moore_8' | 'von_neumann_4'>('moore_8');
  const [boundary, setBoundary] = useState<'absorbing' | 'reflective' | 'periodic'>('absorbing');
  const [baseFactor, setBaseFactor] = useState(0.6);
  const [moistureDamping, setMoistureDamping] = useState(0.2);
  const [windDir, setWindDir] = useState<'none' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'>('E');
  const [windBias, setWindBias] = useState(0.15);
  const [burnDuration, setBurnDuration] = useState(2);
  const [maxGenerations, setMaxGenerations] = useState(30);
  const [deterministicMode, setDeterministicMode] = useState(true);

  // Interactive seed / barrier selection mode before initializing
  const [paintMode, setPaintMode] = useState<'seed' | 'barrier'>('seed');
  const [seedCellUids, setSeedCellUids] = useState<string[]>([]);
  const [barrierCellUids, setBarrierCellUids] = useState<string[]>([]);

  // Playback & comparison state
  const [viewGeneration, setViewGeneration] = useState<number>(0);
  const [compareGenA, setCompareGenA] = useState<number>(0);
  const [compareGenB, setCompareGenB] = useState<number>(0);
  const [autoPlaying, setAutoPlaying] = useState(false);

  const loadWorkspace = async () => {
    setLoading(true);
    setError(null);
    try {
      const [gridList, simList] = await Promise.all([
        apiClient.listGrids(),
        apiClient.listSimulations(),
      ]);
      setGrids(gridList);
      setSimulations(simList);
      if (gridList.length > 0) {
        const gid = gridList[0].id;
        setSelectedGridId(gid);
        const page = await apiClient.getGridCells(gid, { limit: 16000 });
        setCellsPage(page);
        const centerCell =
          page.cells.find(
            (c) =>
              c.quality_status === 'valid' &&
              (c.landcover_category === 'Tree cover' || c.landcover_category === 'Grassland') &&
              c.row_idx >= Math.floor(page.grid.rows / 3),
          ) || page.cells.find((c) => c.quality_status === 'valid');
        if (centerCell) setSeedCellUids([centerCell.cell_uid]);
      }
      if (simList.length > 0) {
        const detail = await apiClient.getSimulationDetail(simList[0].id);
        setActiveSim(detail);
        setViewGeneration(detail.simulation.current_generation);
        setCompareGenA(0);
        setCompareGenB(detail.simulation.current_generation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Cellular Automata Studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  // Auto-play timer when active
  useEffect(() => {
    if (!autoPlaying || !activeSim) return;
    if (activeSim.simulation.status === 'completed' || activeSim.simulation.current_generation >= activeSim.simulation.max_generations) {
      setAutoPlaying(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const updated = await apiClient.stepSimulation(activeSim.simulation.id, 1);
        setActiveSim(updated);
        setViewGeneration(updated.simulation.current_generation);
        setCompareGenB(updated.simulation.current_generation);
        setSimulations((prev) => prev.map((s) => (s.id === updated.simulation.id ? updated.simulation : s)));
        if (updated.simulation.status === 'completed') setAutoPlaying(false);
      } catch {
        setAutoPlaying(false);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [autoPlaying, activeSim]);

  const handleGridSelect = async (gridId: number) => {
    setSelectedGridId(gridId);
    setSeedCellUids([]);
    setBarrierCellUids([]);
    setBusy(true);
    try {
      const page = await apiClient.getGridCells(gridId, { limit: 16000 });
      setCellsPage(page);
      const firstBurnable = page.cells.find(
        (c) => c.quality_status === 'valid' && c.landcover_category !== 'Permanent water bodies',
      );
      if (firstBurnable) setSeedCellUids([firstBurnable.cell_uid]);
    } finally {
      setBusy(false);
    }
  };

  const toggleCellPaint = (cell: GridCell) => {
    if (cell.quality_status !== 'valid' || cell.landcover_category === 'Permanent water bodies') return;
    if (paintMode === 'seed') {
      setBarrierCellUids((prev) => prev.filter((u) => u !== cell.cell_uid));
      setSeedCellUids((prev) =>
        prev.includes(cell.cell_uid) ? prev.filter((u) => u !== cell.cell_uid) : [...prev, cell.cell_uid],
      );
    } else {
      setSeedCellUids((prev) => prev.filter((u) => u !== cell.cell_uid));
      setBarrierCellUids((prev) =>
        prev.includes(cell.cell_uid) ? prev.filter((u) => u !== cell.cell_uid) : [...prev, cell.cell_uid],
      );
    }
  };

  const handleCreateSimulation = async () => {
    if (!selectedGridId || seedCellUids.length === 0) {
      setError('Select at least one burnable seed cell on the lattice before initializing.');
      return;
    }
    setBusy(true);
    setError(null);
    setAutoPlaying(false);
    try {
      const created = await apiClient.createSimulation({
        name: simName.trim() || 'Hypothetical CA Run',
        grid_id: selectedGridId,
        neighborhood,
        boundary_condition: boundary,
        seed_cell_uids: seedCellUids,
        barrier_cell_uids: barrierCellUids,
        base_transition_factor: baseFactor,
        moisture_damping: moistureDamping,
        wind_direction: windDir,
        wind_bias: windBias,
        burn_duration_steps: burnDuration,
        max_generations: maxGenerations,
        deterministic_mode: deterministicMode,
      });
      setActiveSim(created);
      setViewGeneration(0);
      setCompareGenA(0);
      setCompareGenB(0);
      const list = await apiClient.listSimulations();
      setSimulations(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize simulation.');
    } finally {
      setBusy(false);
    }
  };

  const handleStep = async (count: number) => {
    if (!activeSim) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiClient.stepSimulation(activeSim.simulation.id, count);
      setActiveSim(updated);
      setViewGeneration(updated.simulation.current_generation);
      setCompareGenB(updated.simulation.current_generation);
      setSimulations((prev) => prev.map((s) => (s.id === updated.simulation.id ? updated.simulation : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to step simulation.');
    } finally {
      setBusy(false);
    }
  };

  const handlePauseResume = async () => {
    if (!activeSim) return;
    if (autoPlaying) {
      setAutoPlaying(false);
      await apiClient.updateSimulationStatus(activeSim.simulation.id, 'paused');
      const refreshed = await apiClient.getSimulationDetail(activeSim.simulation.id);
      setActiveSim(refreshed);
    } else {
      await apiClient.updateSimulationStatus(activeSim.simulation.id, 'running');
      setAutoPlaying(true);
    }
  };

  const handleReset = async () => {
    if (!activeSim) return;
    setAutoPlaying(false);
    setBusy(true);
    try {
      const reset = await apiClient.resetSimulation(activeSim.simulation.id);
      setActiveSim(reset);
      setViewGeneration(0);
      setCompareGenA(0);
      setCompareGenB(0);
      const list = await apiClient.listSimulations();
      setSimulations(list);
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSim = async (simId: number) => {
    setAutoPlaying(false);
    setBusy(true);
    try {
      const detail = await apiClient.getSimulationDetail(simId);
      setActiveSim(detail);
      setViewGeneration(detail.simulation.current_generation);
      setCompareGenA(0);
      setCompareGenB(detail.simulation.current_generation);
      if (detail.simulation.grid_id !== selectedGridId) {
        const page = await apiClient.getGridCells(detail.simulation.grid_id, { limit: 16000 });
        setCellsPage(page);
        setSelectedGridId(detail.simulation.grid_id);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSim = async (simId: number) => {
    await apiClient.deleteSimulation(simId);
    const list = await apiClient.listSimulations();
    setSimulations(list);
    if (activeSim?.simulation.id === simId) {
      setActiveSim(null);
    }
  };

  const displayedStep = useMemo(() => {
    if (!activeSim) return null;
    return (
      activeSim.steps.find((s) => s.generation === viewGeneration) ||
      activeSim.steps[activeSim.steps.length - 1] ||
      null
    );
  }, [activeSim, viewGeneration]);

  const chartSeries = useMemo(() => {
    if (!activeSim) return [];
    return activeSim.steps.map((s) => ({
      generation: s.generation,
      unburned: s.state_counts_json.unburned ?? 0,
      ignited: s.state_counts_json.ignited ?? 0,
      burning: s.state_counts_json.burning ?? 0,
      extinguished: s.state_counts_json.extinguished ?? 0,
      affected: s.affected_cell_count,
    }));
  }, [activeSim]);

  const comparisonSummary = useMemo(() => {
    if (!activeSim || activeSim.steps.length === 0) return null;
    const stepA = activeSim.steps.find((s) => s.generation === compareGenA);
    const stepB = activeSim.steps.find((s) => s.generation === compareGenB);
    if (!stepA || !stepB) return null;
    return {
      stepA,
      stepB,
      deltaAffected: stepB.affected_cell_count - stepA.affected_cell_count,
    };
  }, [activeSim, compareGenA, compareGenB]);

  if (loading) return <LoadingState message="Loading Controlled Cellular Automata Studio..." />;

  if (grids.length === 0 || !cellsPage) {
    return (
      <EmptyState
        title="No processed spatial grid available for Cellular Automata"
        description="The Cellular Automata Studio operates directly on structured geographical grids derived from imported datasets. Generate a grid in the Geospatial Laboratory first."
        actionLabel="Go to Geospatial Laboratory"
        onAction={() => navigate('/geospatial')}
      />
    );
  }

  const grid = cellsPage.grid;
  const cellSizePx = Math.max(6, Math.min(18, Math.floor(540 / Math.max(grid.rows, grid.cols))));

  return (
    <div className="space-y-6">
      {/* Strict Scientific & Safety Classification Banner */}
      <section className="rounded-lg border border-[#E6C79C] bg-[#FFFBEB] p-4 text-xs text-[#7C4A03] flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#9A5B13]" />
        <div className="space-y-1">
          <div className="font-semibold text-[#151B18]">
            Hypothetical Simulation State · Educational & Bounded Research Rules
          </div>
          <p className="leading-relaxed">
            Outputs generated here are <strong>hypothetical simulation states</strong> computed with bounded abstract
            discrete rules—never real-world historical observations, validated fire forecasts, or emergency-response
            guidance. Historical detections remain isolated in <em>Historical Observations</em> and raw geographic layers
            remain immutable in <em>Dataset Centre</em>.
          </p>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Lattice Viewport + Playback + Generation Comparison */}
        <div className="xl:col-span-8 space-y-6">
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBE6] pb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#151B18]">
                  {activeSim
                    ? `${activeSim.simulation.name} · Generation t = ${displayedStep?.generation ?? 0}`
                    : `Initial Grid Inspection · ${grid.name} (${grid.rows}×${grid.cols})`}
                </h2>
                <p className="text-xs text-[#5B6861]">
                  {activeSim
                    ? `Classification: ${activeSim.simulation.data_classification} · ${activeSim.simulation.neighborhood} · ${activeSim.simulation.boundary_condition}`
                    : 'Click burnable cells below to toggle hypothetical initial seed cells or non-burnable barriers, then click Initialize Run.'}
                </p>
              </div>

              {!activeSim && (
                <div className="flex items-center gap-1 rounded bg-[#F5F6F3] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaintMode('seed')}
                    className={`rounded px-2.5 py-1 font-medium ${paintMode === 'seed' ? 'bg-white text-[#D97706] border border-[#DCE2DC]' : 'text-[#5B6861]'}`}
                  >
                    Paint Seeds ({seedCellUids.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaintMode('barrier')}
                    className={`rounded px-2.5 py-1 font-medium ${paintMode === 'barrier' ? 'bg-white text-[#151B18] border border-[#DCE2DC]' : 'text-[#5B6861]'}`}
                  >
                    Paint Barriers ({barrierCellUids.length})
                  </button>
                </div>
              )}
            </div>

            {/* Playback Controls when Simulation is Active */}
            {activeSim && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#F5F6F3] p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || activeSim.simulation.status === 'completed'}
                    onClick={() => handleStep(1)}
                    className="inline-flex items-center gap-1 rounded bg-[#1B4332] px-3 py-1.5 font-medium text-white hover:bg-[#143326] disabled:opacity-40"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    <span>Step +1</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy || activeSim.simulation.status === 'completed'}
                    onClick={() => handleStep(5)}
                    className="rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-medium text-[#151B18] hover:bg-[#E9EDE7] disabled:opacity-40"
                  >
                    Step +5
                  </button>
                  <button
                    type="button"
                    disabled={activeSim.simulation.status === 'completed'}
                    onClick={handlePauseResume}
                    className="inline-flex items-center gap-1 rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-medium text-[#151B18] hover:bg-[#E9EDE7] disabled:opacity-40"
                  >
                    {autoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    <span>{autoPlaying ? 'Pause' : 'Auto-Play'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-medium text-[#151B18] hover:bg-[#E9EDE7]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoPlaying(false);
                      setActiveSim(null);
                    }}
                    className="rounded border border-transparent px-2 py-1.5 text-[#5B6861] hover:text-[#151B18]"
                  >
                    New Setup
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[#5B6861]">Inspect Gen</span>
                  <input
                    type="range"
                    min={0}
                    max={activeSim.simulation.current_generation}
                    value={viewGeneration}
                    onChange={(e) => setViewGeneration(Number(e.target.value))}
                    className="w-28 accent-[#1B4332]"
                  />
                  <span className="font-mono tabular-nums font-semibold">
                    {viewGeneration}/{activeSim.simulation.current_generation}
                  </span>
                </div>
              </div>
            )}

            {/* Cellular Lattice Grid */}
            <div className="overflow-auto rounded border border-[#E7EBE6] bg-[#F5F6F3] p-4 flex justify-center">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${grid.cols}, ${cellSizePx}px)`,
                  gap: '1px',
                }}
              >
                {cellsPage.cells.map((cell) => {
                  let fill = getLandcoverVisual(cell.landcover_category).hex;
                  let stateLabel = cell.landcover_category;

                  if (activeSim && displayedStep) {
                    const st = displayedStep.cell_states_json[cell.cell_uid] || 'non_burnable';
                    stateLabel = st;
                    if (st === 'unburned') {
                      fill = getLandcoverVisual(cell.landcover_category).hex;
                    } else {
                      fill = STATE_COLORS[st]?.hex ?? '#64748B';
                    }
                  } else {
                    if (seedCellUids.includes(cell.cell_uid)) {
                      fill = STATE_COLORS.ignited.hex;
                      stateLabel = 'Initial Seed';
                    } else if (barrierCellUids.includes(cell.cell_uid)) {
                      fill = STATE_COLORS.non_burnable.hex;
                      stateLabel = 'Custom Barrier';
                    }
                  }

                  return (
                    <button
                      key={cell.cell_uid}
                      type="button"
                      disabled={Boolean(activeSim)}
                      onClick={() => toggleCellPaint(cell)}
                      title={`${cell.cell_uid} · ${cell.landcover_category} · ${stateLabel}`}
                      style={{
                        width: `${cellSizePx}px`,
                        height: `${cellSizePx}px`,
                        backgroundColor: fill,
                      }}
                      className={activeSim ? 'cursor-default' : 'hover:ring-1 hover:ring-[#151B18]'}
                      aria-label={`CA Cell ${cell.cell_uid} ${stateLabel}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* State Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#4B5851]">
              {Object.entries(STATE_COLORS).map(([k, v]) => (
                <div key={k} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-[2px]" style={{ backgroundColor: v.hex }} />
                  <span>{v.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Trajectory & Visual Generation Comparison */}
          {activeSim && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
                <h3 className="font-display text-sm font-semibold text-[#151B18]">
                  Cell-State Trajectory Over Generations
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartSeries} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                      <XAxis dataKey="generation" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="ignited" stackId="1" stroke="#D97706" fill="#F59E0B" />
                      <Area type="monotone" dataKey="burning" stackId="1" stroke="#B42318" fill="#EF4444" />
                      <Area type="monotone" dataKey="extinguished" stackId="1" stroke="#273036" fill="#64748B" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3 text-xs">
                <h3 className="font-display text-sm font-semibold text-[#151B18]">
                  Visual Generation Comparison
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Generation A</label>
                    <select
                      value={compareGenA}
                      onChange={(e) => setCompareGenA(Number(e.target.value))}
                      className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono"
                    >
                      {activeSim.steps.map((s) => (
                        <option key={s.generation} value={s.generation}>
                          t = {s.generation}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Generation B</label>
                    <select
                      value={compareGenB}
                      onChange={(e) => setCompareGenB(Number(e.target.value))}
                      className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono"
                    >
                      {activeSim.steps.map((s) => (
                        <option key={s.generation} value={s.generation}>
                          t = {s.generation}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {comparisonSummary && (
                  <table className="w-full text-left border-t border-[#E7EBE6]">
                    <thead>
                      <tr className="text-[#5B6861] border-b border-[#F0F2EF]">
                        <th className="py-1.5 font-medium">State</th>
                        <th className="py-1.5 text-right font-mono">t={compareGenA}</th>
                        <th className="py-1.5 text-right font-mono">t={compareGenB}</th>
                        <th className="py-1.5 text-right font-mono">Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                      {['unburned', 'ignited', 'burning', 'extinguished', 'non_burnable'].map((st) => {
                        const a = comparisonSummary.stepA.state_counts_json[st] ?? 0;
                        const b = comparisonSummary.stepB.state_counts_json[st] ?? 0;
                        return (
                          <tr key={st}>
                            <td className="py-1.5 font-sans text-[#2A332E]">{st}</td>
                            <td className="py-1.5 text-right">{a}</td>
                            <td className="py-1.5 text-right">{b}</td>
                            <td className="py-1.5 text-right font-semibold">{b - a >= 0 ? `+${b - a}` : b - a}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Right: Parameters Configuration & Persisted Simulation History */}
        <div className="xl:col-span-4 space-y-6">
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-[#E7EBE6] pb-3">
              <Flame className="h-4 w-4 text-[#1B4332]" />
              <h3 className="font-display text-sm font-semibold text-[#151B18]">
                Controlled Simulation Parameters
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[#5B6861] mb-1">Run Label</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5"
                />
              </div>

              <div>
                <label className="block text-[#5B6861] mb-1">Target Grid</label>
                <select
                  value={selectedGridId ?? ''}
                  onChange={(e) => handleGridSelect(Number(e.target.value))}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                >
                  {grids.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.rows}×{g.cols})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#5B6861] mb-1">Neighborhood</label>
                  <select
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value as 'moore_8' | 'von_neumann_4')}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-2 py-1.5"
                  >
                    <option value="moore_8">Moore (8)</option>
                    <option value="von_neumann_4">Von Neumann (4)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Boundary</label>
                  <select
                    value={boundary}
                    onChange={(e) => setBoundary(e.target.value as 'absorbing' | 'reflective' | 'periodic')}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-2 py-1.5"
                  >
                    <option value="absorbing">Absorbing</option>
                    <option value="reflective">Reflective</option>
                    <option value="periodic">Periodic</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#5B6861] mb-1">Base Factor ({baseFactor})</label>
                  <input
                    type="range"
                    min={0.15}
                    max={0.95}
                    step={0.05}
                    value={baseFactor}
                    onChange={(e) => setBaseFactor(Number(e.target.value))}
                    className="w-full accent-[#1B4332]"
                  />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Moisture Damp ({moistureDamping})</label>
                  <input
                    type="range"
                    min={0.0}
                    max={0.8}
                    step={0.05}
                    value={moistureDamping}
                    onChange={(e) => setMoistureDamping(Number(e.target.value))}
                    className="w-full accent-[#1B4332]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[#5B6861] mb-1">Wind Bias</label>
                  <select
                    value={windDir}
                    onChange={(e) => setWindDir(e.target.value as typeof windDir)}
                    className="w-full rounded border border-[#C6CFC8] bg-white px-2 py-1.5"
                  >
                    {['none', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Burn Steps</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={burnDuration}
                    onChange={(e) => setBurnDuration(Number(e.target.value))}
                    className="w-full rounded border border-[#C6CFC8] px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Max Gen</label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={maxGenerations}
                    onChange={(e) => setMaxGenerations(Number(e.target.value))}
                    className="w-full rounded border border-[#C6CFC8] px-2 py-1.5 font-mono"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[#2A332E]">
                <input
                  type="checkbox"
                  checked={deterministicMode}
                  onChange={(e) => setDeterministicMode(e.target.checked)}
                />
                <span>Deterministic threshold transition (reproducible)</span>
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={handleCreateSimulation}
                className="w-full rounded-md bg-[#1B4332] px-4 py-2 font-medium text-white hover:bg-[#143326] disabled:opacity-50"
              >
                Initialize Controlled Run ({seedCellUids.length} seed{seedCellUids.length === 1 ? '' : 's'})
              </button>
            </div>
          </section>

          {/* Current Step Cell-State Counts */}
          {displayedStep && (
            <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-[#151B18] border-b border-[#E7EBE6] pb-2">
                Generation {displayedStep.generation} Statistics
              </h3>
              <dl className="grid grid-cols-2 gap-2 font-mono tabular-nums pt-1">
                <div>
                  <dt className="font-sans text-[#6B7871]">Affected Cells</dt>
                  <dd className="text-sm font-semibold text-[#151B18]">{displayedStep.affected_cell_count}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[#6B7871]">Newly Ignited</dt>
                  <dd className="text-sm font-semibold text-[#D97706]">{displayedStep.newly_ignited_count}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[#6B7871]">Burning</dt>
                  <dd className="font-semibold text-[#B42318]">{displayedStep.state_counts_json.burning ?? 0}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[#6B7871]">Extinguished</dt>
                  <dd className="font-semibold text-[#273036]">{displayedStep.state_counts_json.extinguished ?? 0}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Simulation History Persisted in SQLite */}
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3 text-xs">
            <h3 className="font-display text-sm font-semibold text-[#151B18] border-b border-[#E7EBE6] pb-2">
              Persisted Simulation History ({simulations.length})
            </h3>
            {simulations.length === 0 ? (
              <p className="text-[#6B7871]">No hypothetical simulation runs recorded yet.</p>
            ) : (
              <div className="divide-y divide-[#F0F2EF] max-h-60 overflow-y-auto">
                {simulations.map((sim) => (
                  <div key={sim.id} className="py-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadSim(sim.id)}
                      className="text-left flex-1 hover:text-[#1B4332]"
                    >
                      <div className="font-semibold text-[#151B18]">{sim.name}</div>
                      <div className="font-mono text-[11px] text-[#5B6861]">
                        Gen {sim.current_generation}/{sim.max_generations} · {sim.status} · {sim.neighborhood}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSim(sim.id)}
                      className="rounded p-1 text-[#6B7871] hover:text-[#B42318]"
                      title="Delete simulation run"
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
    </div>
  );
}
