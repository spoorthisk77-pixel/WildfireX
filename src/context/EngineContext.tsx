import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  ForestDatasetMeta,
  ParsedDatasetPreview,
  SimulationConfig,
  SimulationSnapshot,
  SimulationTelemetryPoint,
  VoxelCell,
} from '../types/engine';
import { DEFAULT_GRID_DIM, createDormantGrid } from '../utils/datasetParser';
import { computeTelemetryPoint, stepCellularAutomata } from '../utils/caEngine';

const DEFAULT_CONFIG: SimulationConfig = {
  windSpeedKmh: 24,
  windAngleDeg: 65,
  humidityPct: 32,
  ambientTempC: 34,
  neighborhood: 'moore_8',
  boundaryCondition: 'absorbing',
  burnDurationTicks: 3,
  baseSpreadCoeff: 0.78,
  tickIntervalMs: 380,
};

interface EngineContextValue {
  datasetMeta: ForestDatasetMeta | null;
  cells: VoxelCell[];
  initialCells: VoxelCell[];
  rows: number;
  cols: number;
  generation: number;
  isRunning: boolean;
  config: SimulationConfig;
  telemetryHistory: SimulationTelemetryPoint[];
  snapshots: SimulationSnapshot[];
  selectedCellId: string | null;
  hoveredCellId: string | null;
  highlightedCellIds: Set<string>;
  isInitialized: boolean;
  loadDataset: (parsed: ParsedDatasetPreview) => void;
  unloadToDormant: () => void;
  updateConfig: (patch: Partial<SimulationConfig>) => void;
  igniteCell: (cellId: string) => void;
  toggleFirebreak: (cellId: string) => void;
  autoSeedIgnition: () => void;
  stepOnce: () => void;
  togglePlay: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  captureSnapshot: (label?: string) => void;
  setSelectedCellId: (id: string | null) => void;
  setHoveredCellId: (id: string | null) => void;
  setHighlightedCellIds: (ids: Set<string>) => void;
  latestViewportSnapshotUrl: string | null;
  setLatestViewportSnapshotUrl: (url: string | null) => void;
  registerViewportCapture: (fn: (() => string | null) | null) => void;
  captureCurrentViewportImage: () => string | null;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [datasetMeta, setDatasetMeta] = useState<ForestDatasetMeta | null>(null);
  const [rows, setRows] = useState(DEFAULT_GRID_DIM);
  const [cols, setCols] = useState(DEFAULT_GRID_DIM);
  const [initialCells, setInitialCells] = useState<VoxelCell[]>(() => createDormantGrid(DEFAULT_GRID_DIM, DEFAULT_GRID_DIM));
  const [cells, setCells] = useState<VoxelCell[]>(() => createDormantGrid(DEFAULT_GRID_DIM, DEFAULT_GRID_DIM));
  const [generation, setGeneration] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [telemetryHistory, setTelemetryHistory] = useState<SimulationTelemetryPoint[]>([]);
  const [snapshots, setSnapshots] = useState<SimulationSnapshot[]>([]);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [highlightedCellIds, setHighlightedCellIds] = useState<Set<string>>(new Set());
  const [latestViewportSnapshotUrl, setLatestViewportSnapshotUrl] = useState<string | null>(null);
  const viewportCaptureRef = useRef<(() => string | null) | null>(null);

  const isInitialized = datasetMeta !== null;

  const stateRef = useRef({ cells, rows, cols, config, generation, isInitialized });
  stateRef.current = { cells, rows, cols, config, generation, isInitialized };

  const registerViewportCapture = useCallback((fn: (() => string | null) | null) => {
    viewportCaptureRef.current = fn;
  }, []);

  const captureCurrentViewportImage = useCallback((): string | null => {
    if (viewportCaptureRef.current) {
      const captured = viewportCaptureRef.current();
      if (captured) {
        setLatestViewportSnapshotUrl(captured);
        return captured;
      }
    }
    return latestViewportSnapshotUrl;
  }, [latestViewportSnapshotUrl]);

  const loadDataset = useCallback((parsed: ParsedDatasetPreview) => {
    setIsRunning(false);
    setDatasetMeta(parsed.meta);
    setRows(parsed.meta.rows);
    setCols(parsed.meta.cols);
    setInitialCells(parsed.cells);
    setCells(parsed.cells);
    setGeneration(0);
    setSelectedCellId(parsed.cells.find((c) => c.state === 'unburned')?.id ?? null);
    setHoveredCellId(null);
    setHighlightedCellIds(new Set());
    setLatestViewportSnapshotUrl(null);
    setTelemetryHistory([computeTelemetryPoint(parsed.cells, 0, 0)]);
  }, []);

  const unloadToDormant = useCallback(() => {
    setIsRunning(false);
    const dormant = createDormantGrid(DEFAULT_GRID_DIM, DEFAULT_GRID_DIM);
    setDatasetMeta(null);
    setRows(DEFAULT_GRID_DIM);
    setCols(DEFAULT_GRID_DIM);
    setInitialCells(dormant);
    setCells(dormant);
    setGeneration(0);
    setSelectedCellId(null);
    setHoveredCellId(null);
    setHighlightedCellIds(new Set());
    setLatestViewportSnapshotUrl(null);
    setTelemetryHistory([]);
  }, []);

  const updateConfig = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const igniteCell = useCallback((cellId: string) => {
    if (!stateRef.current.isInitialized) return;
    setCells((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== cellId) return c;
        if (c.state === 'dormant' || c.state === 'water' || c.state === 'barren' || c.state === 'firebreak') return c;
        return {
          ...c,
          state: 'burning' as const,
          burnTicksRemaining: stateRef.current.config.burnDurationTicks,
          ignitionGeneration: stateRef.current.generation,
        };
      });
      return updated;
    });
  }, []);

  const toggleFirebreak = useCallback((cellId: string) => {
    if (!stateRef.current.isInitialized) return;
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        if (c.state === 'firebreak') {
          const orig = initialCells.find((ic) => ic.id === cellId);
          return orig ? { ...orig } : { ...c, state: 'unburned' };
        }
        if (c.state === 'dormant' || c.state === 'water') return c;
        return { ...c, state: 'firebreak', burnTicksRemaining: 0 };
      }),
    );
  }, [initialCells]);

  const autoSeedIgnition = useCallback(() => {
    if (!stateRef.current.isInitialized) return;
    setCells((prev) => {
      const burnable = prev.filter((c) => c.state === 'unburned');
      if (burnable.length === 0) return prev;
      // Pick highest fuel near center
      const centerR = Math.floor(stateRef.current.rows / 2);
      const centerC = Math.floor(stateRef.current.cols / 2);
      const sorted = [...burnable].sort((a, b) => {
        const scoreA = (a.fuelDensity ?? 0.5) - Math.hypot(a.row - centerR, a.col - centerC) * 0.04;
        const scoreB = (b.fuelDensity ?? 0.5) - Math.hypot(b.row - centerR, b.col - centerC) * 0.04;
        return scoreB - scoreA;
      });
      const targetId = sorted[0].id;
      setSelectedCellId(targetId);
      return prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              state: 'burning' as const,
              burnTicksRemaining: stateRef.current.config.burnDurationTicks,
              ignitionGeneration: stateRef.current.generation,
            }
          : c,
      );
    });
  }, []);

  const stepOnce = useCallback(() => {
    const { cells: curCells, rows: r, cols: c, config: cfg, generation: gen, isInitialized: ready } = stateRef.current;
    if (!ready) return;

    // Ensure at least one active cell if user presses Step on unseeded grid
    const hasActive = curCells.some((cell) => cell.state === 'burning' || cell.state === 'ignited');
    let sourceCells = curCells;
    if (!hasActive && gen === 0) {
      const burnable = curCells.filter((cell) => cell.state === 'unburned');
      if (burnable.length > 0) {
        const centerR = Math.floor(r / 2);
        const centerC = Math.floor(c / 2);
        const seed = [...burnable].sort(
          (a, b) =>
            (b.fuelDensity ?? 0.5) -
            Math.hypot(b.row - centerR, b.col - centerC) * 0.04 -
            ((a.fuelDensity ?? 0.5) - Math.hypot(a.row - centerR, a.col - centerC) * 0.04),
        )[0];
        sourceCells = curCells.map((cell) =>
          cell.id === seed.id
            ? { ...cell, state: 'burning' as const, burnTicksRemaining: cfg.burnDurationTicks, ignitionGeneration: 0 }
            : cell,
        );
      }
    }

    const nextGen = gen + 1;
    const prevAffected = sourceCells.filter(
      (cell) => cell.state === 'ignited' || cell.state === 'burning' || cell.state === 'extinguished',
    ).length;
    const next = stepCellularAutomata(sourceCells, r, c, cfg, nextGen);
    const point = computeTelemetryPoint(next, nextGen, prevAffected);

    setCells(next);
    setGeneration(nextGen);
    setTelemetryHistory((hist) => [...hist.slice(-119), point]);

    const stillActive = next.some((cell) => cell.state === 'burning' || cell.state === 'ignited');
    if (!stillActive) {
      setIsRunning(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!stateRef.current.isInitialized) return;
    setIsRunning((prev) => {
      if (!prev) {
        const hasActive = stateRef.current.cells.some((c) => c.state === 'burning' || c.state === 'ignited');
        if (!hasActive && stateRef.current.generation === 0) {
          // Will auto-seed on first tick cleanly
        }
      }
      return !prev;
    });
  }, []);

  const pauseSimulation = useCallback(() => setIsRunning(false), []);

  const resetSimulation = useCallback(() => {
    setIsRunning(false);
    setCells(initialCells);
    setGeneration(0);
    setTelemetryHistory(datasetMeta ? [computeTelemetryPoint(initialCells, 0, 0)] : []);
  }, [initialCells, datasetMeta]);

  const captureSnapshot = useCallback(
    (label?: string) => {
      if (!datasetMeta) return;
      captureCurrentViewportImage();
      const affected = cells.filter(
        (c) => c.state === 'ignited' || c.state === 'burning' || c.state === 'extinguished',
      ).length;
      setSnapshots((prev) => [
        {
          id: `SNP-${Date.now().toString(36).toUpperCase()}`,
          label: label || `Run t=${generation} (${datasetMeta.name.slice(0, 24)})`,
          datasetName: datasetMeta.name,
          generations: generation,
          affectedCells: affected,
          windSpeedKmh: config.windSpeedKmh,
          windAngleDeg: config.windAngleDeg,
          humidityPct: config.humidityPct,
          capturedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [captureCurrentViewportImage, cells, config.humidityPct, config.windAngleDeg, config.windSpeedKmh, datasetMeta, generation],
  );

  useEffect(() => {
    if (!isRunning || !isInitialized) return;
    const timer = window.setInterval(() => {
      stepOnce();
    }, config.tickIntervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, isInitialized, config.tickIntervalMs, stepOnce]);

  return (
    <EngineContext.Provider
      value={{
        datasetMeta,
        cells,
        initialCells,
        rows,
        cols,
        generation,
        isRunning,
        config,
        telemetryHistory,
        snapshots,
        selectedCellId,
        hoveredCellId,
        highlightedCellIds,
        isInitialized,
        loadDataset,
        unloadToDormant,
        updateConfig,
        igniteCell,
        toggleFirebreak,
        autoSeedIgnition,
        stepOnce,
        togglePlay,
        pauseSimulation,
        resetSimulation,
        captureSnapshot,
        setSelectedCellId,
        setHoveredCellId,
        setHighlightedCellIds,
        latestViewportSnapshotUrl,
        setLatestViewportSnapshotUrl,
        registerViewportCapture,
        captureCurrentViewportImage,
      }}
    >
      {children}
    </EngineContext.Provider>
  );
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside EngineProvider');
  return ctx;
}
