import React, { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  FileDown,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Shield,
  SkipForward,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import { VoxelViewport3D } from '../components/VoxelViewport3D';
import { LightLineChart } from '../components/ChartsLight';

const ACRES_PER_VOXEL = 6.18; // ~2.5 hectares per terrain block

export function WorkspacePage() {
  const navigate = useNavigate();
  const { openUploadModal, openReportModal } = useOutletContext<{
    openUploadModal: () => void;
    openReportModal: () => void;
  }>();
  const {
    datasetMeta,
    cells,
    rows,
    cols,
    generation,
    isRunning,
    config,
    telemetryHistory,
    selectedCellId,
    hoveredCellId,
    highlightedCellIds,
    isInitialized,
    updateConfig,
    igniteCell,
    toggleFirebreak,
    autoSeedIgnition,
    stepOnce,
    togglePlay,
    resetSimulation,
    unloadToDormant,
    captureSnapshot,
    setSelectedCellId,
    setHoveredCellId,
    registerViewportCapture,
    setLatestViewportSnapshotUrl,
  } = useEngine();

  const [projection, setProjection] = useState<'isometric' | 'perspective'>('isometric');
  const [resetCamCounter, setResetCamCounter] = useState(0);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const activeCell = useMemo(() => {
    const targetId = hoveredCellId || selectedCellId;
    if (!targetId) return null;
    return cells.find((c) => c.id === targetId) || null;
  }, [cells, hoveredCellId, selectedCellId]);

  const counts = useMemo(() => {
    let unburned = 0;
    let ignited = 0;
    let burning = 0;
    let extinguished = 0;
    let firebreak = 0;
    let water = 0;
    for (const c of cells) {
      if (c.state === 'unburned') unburned += 1;
      else if (c.state === 'ignited') ignited += 1;
      else if (c.state === 'burning') burning += 1;
      else if (c.state === 'extinguished') extinguished += 1;
      else if (c.state === 'firebreak') firebreak += 1;
      else if (c.state === 'water') water += 1;
    }
    const activeFires = burning + ignited;
    const affectedBlocks = activeFires + extinguished;
    const burnedAcres = Number((affectedBlocks * ACRES_PER_VOXEL).toFixed(1));
    const totalBurnable = unburned + affectedBlocks;
    const containmentEfficiency =
      !isInitialized
        ? 0
        : affectedBlocks === 0
          ? 100
          : Math.min(
              100,
              Math.round(
                ((extinguished + firebreak * 0.8) /
                  Math.max(1, activeFires + extinguished + firebreak * 0.8)) *
                  100,
              ),
            );
    return {
      unburned,
      ignited,
      burning,
      extinguished,
      firebreak,
      activeFires,
      burnedAcres,
      containmentEfficiency,
      totalBurnable,
    };
  }, [cells, isInitialized]);

  const progressionChartData = useMemo(
    () => ({
      labels: telemetryHistory.map((p) => `Step ${p.generation}`),
      datasets: [
        {
          label: 'Active Fire Blocks',
          data: telemetryHistory.map((p) => p.burning),
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.10)',
          borderWidth: 2,
          pointRadius: 2,
          fill: true,
          tension: 0.25,
        },
        {
          label: 'Ignited Perimeter',
          data: telemetryHistory.map((p) => p.ignited),
          borderColor: '#D97706',
          backgroundColor: 'rgba(217, 119, 6, 0.08)',
          borderWidth: 1.8,
          pointRadius: 2,
          tension: 0.25,
        },
        {
          label: 'Contained / Extinguished',
          data: telemetryHistory.map((p) => p.extinguished),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 1.8,
          pointRadius: 1.5,
          tension: 0.25,
        },
      ],
    }),
    [telemetryHistory],
  );

  const fmtNum = (val: number | null, suffix = '', digits = 2) =>
    val === null || val === undefined ? '—' : `${val.toFixed(digits)}${suffix}`;

  return (
    <div className="space-y-5">
      {/* Workspace Context Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            3D Isometric Wildfire Simulation Arena
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>{isInitialized ? `Sector: ${datasetMeta?.region}` : 'Status: Dormant (No dataset loaded)'}</span>
            <span aria-hidden="true">·</span>
            <span>Terrain Grid: {rows}×{cols} ({cells.length} blocks)</span>
            <span aria-hidden="true">·</span>
            <span>Elapsed Time: Step {generation}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isInitialized ? (
            <>
              <button
                type="button"
                onClick={openReportModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-[#0284C7] shadow-2xs hover:bg-sky-100 transition-colors whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export Report (PDF / PNG)</span>
              </button>
              <button
                type="button"
                onClick={() => captureSnapshot()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:border-[#0284C7] hover:text-[#0284C7] transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Save Snapshot</span>
              </button>
              <button
                type="button"
                onClick={unloadToDormant}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 shadow-2xs hover:border-red-300 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Dataset</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openUploadModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-[#0284C7] shadow-2xs hover:bg-sky-50 transition-colors whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Load Forest Dataset</span>
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Telemetry Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Burned Acreage</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900">
            {isInitialized ? `${counts.burnedAcres.toLocaleString()} ac` : '0.0 ac'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {isInitialized ? `${counts.unburned} forest blocks unburned` : 'Awaiting forest telemetry'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Active Fire Count</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-red-600">
            {isInitialized ? counts.activeFires : 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {isInitialized ? `${counts.burning} burning · ${counts.ignited} igniting` : 'No active ignitions'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Containment Efficiency</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#16A34A]">
            {isInitialized ? `${counts.containmentEfficiency}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {isInitialized ? `${counts.firebreak} barriers · ${counts.extinguished} contained` : 'Standby perimeter'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Elapsed Time Steps</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#0284C7]">
            {generation}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {isInitialized ? `Wind ${config.windSpeedKmh} km/h · ${config.humidityPct}% RH` : 'Simulation paused'}
          </div>
        </div>
      </div>

      {/* Main Split: 3D Isometric Terrain Viewport + Right Block Inspector & Curve */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Main 3D Simulation Arena */}
        <section className="xl:col-span-8 relative min-h-[580px] lg:h-[650px] rounded-xl border border-slate-200 bg-[#F1F5F9] shadow-sm overflow-hidden">
          <VoxelViewport3D
            cells={cells}
            rows={rows}
            cols={cols}
            isInitialized={isInitialized}
            config={config}
            selectedCellId={selectedCellId}
            hoveredCellId={hoveredCellId}
            highlightedCellIds={highlightedCellIds}
            projection={projection}
            resetCamCounter={resetCamCounter}
            onSelectCell={(id) => setSelectedCellId(id)}
            onHoverCell={(id) => setHoveredCellId(id)}
            onRegisterCapture={registerViewportCapture}
            onCacheFrame={setLatestViewportSnapshotUrl}
          />

          {/* Top-Left Terrain Banner & Top-Right Camera Switcher */}
          <div className="pointer-events-none absolute top-4 left-4 right-4 flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 px-3.5 py-2 shadow-sm">
              <div className="text-xs font-semibold text-slate-900">
                {isInitialized ? datasetMeta?.name : 'Dormant Terrain Grid'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                {isInitialized
                  ? `${datasetMeta?.sourceFormat.toUpperCase()} · ${datasetMeta?.recordCount} records · Wind ${config.windSpeedKmh} km/h at ${config.windAngleDeg}°`
                  : 'Empty grid state · Zero active data loaded'}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm text-xs font-medium">
              <button
                type="button"
                onClick={() => setProjection('isometric')}
                className={`rounded-md px-2.5 py-1 transition-colors whitespace-nowrap ${
                  projection === 'isometric' ? 'bg-[#0284C7] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Isometric
              </button>
              <button
                type="button"
                onClick={() => setProjection('perspective')}
                className={`rounded-md px-2.5 py-1 transition-colors whitespace-nowrap ${
                  projection === 'perspective' ? 'bg-[#0284C7] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Perspective
              </button>
              <button
                type="button"
                onClick={() => setResetCamCounter((n) => n + 1)}
                className="rounded-md px-2 py-1 text-slate-500 hover:text-slate-900"
                title="Reset Camera"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Empty State Prompt (Exact Required Copy) */}
          {!isInitialized && (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4">
              <div className="pointer-events-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center shadow-lg">
                <div className="text-sm font-semibold text-slate-900">
                  Please upload a forest dataset (CSV, JSON, GeoJSON) to initialize simulation
                </div>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Import your own geospatial layer or select a calibrated global forest sector (Amazon, Western Ghats, Bannerghatta, or Boreal Taiga) to populate terrain elevation, canopy fuel, and moisture blocks.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={openUploadModal}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import Forest Dataset</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/ingestion')}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Open Full Dataset Portal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Bottom Control Dock */}
          {isInitialized && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center px-3">
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:text-slate-900"
              >
                {dockCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span>{dockCollapsed ? 'Show Simulation Controls' : 'Hide Simulation Controls'}</span>
              </button>

              {!dockCollapsed && (
                <div className="pointer-events-auto w-full max-w-[900px] rounded-xl border border-slate-200 bg-white/95 px-4 py-3.5 shadow-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
                      >
                        {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        <span>{isRunning ? 'Pause' : 'Start Simulation'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={stepOnce}
                        disabled={isRunning}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        <span>Step +1</span>
                      </button>
                      <button
                        type="button"
                        onClick={autoSeedIgnition}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
                      >
                        <Flame className="h-3.5 w-3.5" />
                        <span>Seed Fire</span>
                      </button>
                      <button
                        type="button"
                        onClick={resetSimulation}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <select
                        value={config.neighborhood}
                        onChange={(e) =>
                          updateConfig({ neighborhood: e.target.value as 'moore_8' | 'von_neumann_4' })
                        }
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700"
                        aria-label="Spread neighborhood pattern"
                      >
                        <option value="moore_8">8-Direction Spread</option>
                        <option value="von_neumann_4">4-Direction Spread</option>
                      </select>
                      <select
                        value={config.boundaryCondition}
                        onChange={(e) =>
                          updateConfig({
                            boundaryCondition: e.target.value as 'absorbing' | 'reflective' | 'periodic',
                          })
                        }
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-700"
                        aria-label="Sector boundary behavior"
                      >
                        <option value="absorbing">Open Boundary</option>
                        <option value="reflective">Contained Edge</option>
                        <option value="periodic">Continuous Wrap</option>
                      </select>
                    </div>
                  </div>

                  {/* Environmental Parameter Sliders */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-600 mb-1.5">
                        <span className="font-medium">Wind Speed</span>
                        <span className="font-mono font-semibold text-[#0284C7] tabular-nums">{config.windSpeedKmh} km/h</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={65}
                        step={1}
                        value={config.windSpeedKmh}
                        onChange={(e) => updateConfig({ windSpeedKmh: Number(e.target.value) })}
                        className="saas-slider w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1.5">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Compass className="h-3.5 w-3.5 text-[#0284C7]" /> Compass Angle
                        </span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">{config.windAngleDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={359}
                        step={5}
                        value={config.windAngleDeg}
                        onChange={(e) => updateConfig({ windAngleDeg: Number(e.target.value) })}
                        className="saas-slider w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1.5">
                        <span className="font-medium">Temperature</span>
                        <span className="font-mono font-semibold text-amber-600 tabular-nums">{config.ambientTempC}°C</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={50}
                        step={1}
                        value={config.ambientTempC}
                        onChange={(e) => updateConfig({ ambientTempC: Number(e.target.value) })}
                        className="saas-slider w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1.5">
                        <span className="font-medium">Humidity</span>
                        <span className="font-mono font-semibold text-[#16A34A] tabular-nums">{config.humidityPct}%</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        step={1}
                        value={config.humidityPct}
                        onChange={(e) => updateConfig({ humidityPct: Number(e.target.value) })}
                        className="saas-slider w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Side Panel: Clean Block Tooltip Inspector + Propagation Chart */}
        <aside className="xl:col-span-4 flex flex-col gap-5">
          {/* Block Inspector Tooltip Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Terrain Block Inspector</h2>
              <span className="font-mono text-xs font-medium text-[#0284C7] tabular-nums">
                {activeCell ? activeCell.id : 'Hover or click block'}
              </span>
            </div>

            {!activeCell ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                Move your pointer over or click any block inside the 3D isometric terrain to inspect elevation, fuel density, moisture index, temperature, and land-cover class.
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Coordinates (Row, Col)</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                      ({activeCell.row}, {activeCell.col})
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Block Status</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-[#0284C7] capitalize">
                      {activeCell.state}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Elevation</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                      {fmtNum(activeCell.elevation, ' m', 1)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Fuel Density</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-[#16A34A]">
                      {fmtNum(activeCell.fuelDensity, '', 3)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Moisture Index</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-[#0284C7]">
                      {fmtNum(activeCell.moistureIndex, '', 3)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <dt className="text-slate-500">Surface Temp</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-amber-600">
                      {fmtNum(activeCell.temperature, ' °C', 1)}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50 p-3 flex items-center justify-between">
                    <div>
                      <dt className="text-slate-500">Land Cover / Biome</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-slate-900">{activeCell.biome}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-slate-500">GPS Lat / Lon</dt>
                      <dd className="mt-0.5 font-mono text-[11px] text-slate-700">
                        {activeCell.lat !== null && activeCell.lon !== null
                          ? `${activeCell.lat.toFixed(4)}, ${activeCell.lon.toFixed(4)}`
                          : '—'}
                      </dd>
                    </div>
                  </div>
                </dl>

                {isInitialized && activeCell.state !== 'dormant' && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => igniteCell(activeCell.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <Flame className="h-3.5 w-3.5" />
                      <span>Ignite Block</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFirebreak(activeCell.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-100 transition-colors"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      <span>{activeCell.state === 'firebreak' ? 'Remove Break' : 'Add Firebreak'}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Propagation Trajectory Card */}
          <section className="flex-1 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Fire Progression Curve</h2>
              <span className="text-xs text-slate-500">Blocks over time</span>
            </div>
            <div className="h-[210px] w-full">
              {!isInitialized ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400 text-center px-4">
                  Upload a forest dataset to track active ignition and containment curves.
                </div>
              ) : (
                <LightLineChart data={progressionChartData} yLabel="Blocks" />
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
