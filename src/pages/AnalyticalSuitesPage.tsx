import React, { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Flame,
  MapPin,
  Network,
  Route,
  ShieldCheck,
  Truck,
  Upload,
} from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import type { AnalyticalTabId } from '../types/engine';
import {
  buildPatchTopologyGraph,
  traceDijkstraRouting,
  traceKruskalFirebreakMst,
} from '../utils/caEngine';
import { LightBarChart, LightLineChart } from '../components/ChartsLight';

const ANALYTICS_TABS: Array<{
  id: AnalyticalTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'resource-deployment', label: 'Resource Deployment', icon: Truck },
  { id: 'ignition-rules', label: 'Ignition Risk Rules', icon: Flame },
  { id: 'spread-forecasting', label: 'Spread Forecasting', icon: Activity },
  { id: 'network-zoning', label: 'Network & Zoning', icon: Network },
  { id: 'evacuation-routing', label: 'Evacuation & Routing', icon: Route },
];

const HAZARD_TIERS = [
  { label: 'Low Hazard', bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
  { label: 'Guarded', bg: '#E0F2FE', text: '#075985', border: '#BAE6FD' },
  { label: 'Elevated', bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  { label: 'Critical', bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
];

const ACRES_PER_VOXEL = 6.18;

export function AnalyticalSuitesPage() {
  const navigate = useNavigate();
  const { openUploadModal } = useOutletContext<{ openUploadModal: () => void }>();
  const {
    datasetMeta,
    cells,
    rows,
    cols,
    config,
    isInitialized,
    telemetryHistory,
    setHighlightedCellIds,
  } = useEngine();

  const [activeTab, setActiveTab] = useState<AnalyticalTabId>('resource-deployment');

  // 1. Resource Deployment state
  const [waterTankers, setWaterTankers] = useState(14);
  const [reconDrones, setReconDrones] = useState(9);
  const [groundCrews, setGroundCrews] = useState(18);
  const [aerialDrops, setAerialDrops] = useState(6);

  // 2. Ignition Risk Rules state
  const [fuelCutoff, setFuelCutoff] = useState(0.65);
  const [humidityCutoff, setHumidityCutoff] = useState(38);
  const [windCutoff, setWindCutoff] = useState(25);
  const [tempCutoff, setTempCutoff] = useState(32);

  // 3. Spread Forecasting state
  const [forecastSteps, setForecastSteps] = useState(12);

  // 4 & 5. Network & Zoning + Evacuation & Routing
  const [patchStartRow, setPatchStartRow] = useState(2);
  const [patchStartCol, setPatchStartCol] = useState(2);
  const [routeSourceIdx, setRouteSourceIdx] = useState(0);
  const [routeTargetIdx, setRouteTargetIdx] = useState(35);
  const [routeViewMode, setRouteViewMode] = useState<'evacuation' | 'firebreak'>('evacuation');

  // Compute regional sector breakdown from active dataset
  const sectorStats = useMemo(() => {
    const thirdR = Math.max(1, Math.floor(rows / 3));
    const north = cells.filter((c) => c.row < thirdR && c.state !== 'dormant' && c.state !== 'water');
    const central = cells.filter(
      (c) => c.row >= thirdR && c.row < thirdR * 2 && c.state !== 'dormant' && c.state !== 'water',
    );
    const south = cells.filter((c) => c.row >= thirdR * 2 && c.state !== 'dormant' && c.state !== 'water');

    const summarize = (name: string, list: typeof cells) => {
      const highRisk = list.filter((c) => (c.fuelDensity ?? 0) >= 0.62 || c.state === 'burning' || c.state === 'ignited').length;
      const activeFire = list.filter((c) => c.state === 'burning' || c.state === 'ignited').length;
      const avgFuel =
        list.length > 0
          ? list.reduce((s, c) => s + (c.fuelDensity ?? 0), 0) / list.length
          : 0;
      return { name, totalBlocks: list.length, highRisk, activeFire, avgFuel };
    };

    const s1 = summarize('North Ridge Sector', north);
    const s2 = summarize('Central Canopy Sector', central);
    const s3 = summarize('Southern Corridor Sector', south);
    const sectors = [s1, s2, s3];
    const totalHighRisk = Math.max(1, sectors.reduce((s, x) => s + x.highRisk, 0));
    const totalCapacityUnits = waterTankers * 8 + groundCrews * 5 + reconDrones * 4 + aerialDrops * 14;

    return sectors.map((sec) => {
      const share = sec.highRisk / totalHighRisk;
      const assignedTankers = Math.round(waterTankers * share);
      const assignedDrones = Math.round(reconDrones * share);
      const assignedCrews = Math.round(groundCrews * share);
      const assignedCapacity = Math.round(totalCapacityUnits * share);
      const coveragePct = Math.min(100, Math.round((assignedCapacity / Math.max(1, sec.highRisk * 1.4)) * 100));
      return {
        ...sec,
        assignedTankers,
        assignedDrones,
        assignedCrews,
        coveragePct,
      };
    });
  }, [aerialDrops, cells, groundCrews, reconDrones, rows, waterTankers]);

  // Human-readable Ignition Risk Rules evaluation against grid
  const riskRuleMatches = useMemo(() => {
    const critical: string[] = [];
    const moderate: string[] = [];
    const protectedBlocks: string[] = [];

    for (const c of cells) {
      if (c.state === 'dormant') continue;
      if (c.state === 'water' || c.state === 'firebreak' || (c.moistureIndex ?? 0) >= 0.7) {
        protectedBlocks.push(c.id);
        continue;
      }
      const highFuel = (c.fuelDensity ?? 0) >= fuelCutoff;
      const dryAir = config.humidityPct <= humidityCutoff || (c.moistureIndex ?? 1) <= 0.35;
      const highWind = config.windSpeedKmh >= windCutoff;
      const hotSurface = (c.temperature ?? config.ambientTempC) >= tempCutoff;

      if (highFuel && dryAir && (highWind || hotSurface)) {
        critical.push(c.id);
      } else if (highFuel || (dryAir && hotSurface)) {
        moderate.push(c.id);
      }
    }
    return { critical, moderate, protectedBlocks };
  }, [cells, config.ambientTempC, config.humidityPct, config.windSpeedKmh, fuelCutoff, humidityCutoff, tempCutoff, windCutoff]);

  // Spread Forecasting projections (acres over time steps)
  const forecastSeries = useMemo(() => {
    const curAffected = telemetryHistory.length
      ? telemetryHistory[telemetryHistory.length - 1].affectedTotal
      : cells.filter((c) => c.state === 'burning' || c.state === 'ignited' || c.state === 'extinguished').length;
    const baseBlocks = Math.max(1, curAffected || 2);
    const windBoost = 1 + (config.windSpeedKmh / 45) * 0.48;
    const dryBoost = 1 + ((100 - config.humidityPct) / 100) * 0.35;
    const growthMultiplier = Math.min(1.42, 1.06 * windBoost * dryBoost * 0.68);
    const maxBurnable = Math.max(10, cells.filter((c) => c.state !== 'dormant' && c.state !== 'water').length);

    const points: Array<{ step: number; projectedAcres: number; observedAcres: number | null }> = [];
    let runningBlocks = baseBlocks;
    for (let s = 0; s <= forecastSteps; s += 1) {
      if (s > 0) {
        const remainingRatio = Math.max(0.05, (maxBurnable - runningBlocks) / maxBurnable);
        const delta = runningBlocks * (growthMultiplier - 1) * remainingRatio;
        runningBlocks = Math.min(maxBurnable, runningBlocks + Math.max(0.5, delta));
      }
      const obs = telemetryHistory[s] ? Number((telemetryHistory[s].affectedTotal * ACRES_PER_VOXEL).toFixed(1)) : null;
      points.push({
        step: s,
        projectedAcres: Number((runningBlocks * ACRES_PER_VOXEL).toFixed(1)),
        observedAcres: obs,
      });
    }
    return points;
  }, [cells, config.humidityPct, config.windSpeedKmh, forecastSteps, telemetryHistory]);

  // Network & Zoning + Evacuation & Routing
  const patchGraph = useMemo(
    () => buildPatchTopologyGraph(cells, rows, cols, 6, patchStartRow, patchStartCol),
    [cells, rows, cols, patchStartRow, patchStartCol],
  );

  const dijkstraResult = useMemo(
    () => traceDijkstraRouting(patchGraph, routeSourceIdx, routeTargetIdx),
    [patchGraph, routeSourceIdx, routeTargetIdx],
  );

  const kruskalResult = useMemo(() => traceKruskalFirebreakMst(patchGraph), [patchGraph]);

  const hazardSummaryChart = useMemo(() => {
    const tierCounts = [0, 0, 0, 0];
    patchGraph.nodeCells.forEach((cell, idx) => {
      if (cell.state === 'dormant' || cell.state === 'water') return;
      const tier = Math.min(3, patchGraph.chromaticColors[idx] ?? 0);
      tierCounts[tier] += 1;
    });
    return {
      labels: HAZARD_TIERS.map((t) => t.label),
      datasets: [
        {
          label: 'Forest Blocks',
          data: tierCounts,
          backgroundColor: ['#16A34A', '#0284C7', '#D97706', '#DC2626'],
          borderRadius: 4,
        },
      ],
    };
  }, [patchGraph]);

  if (!isInitialized) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-4">
        <div className="text-base font-semibold text-slate-900">
          Please upload a forest dataset (CSV, JSON, GeoJSON) to initialize simulation
        </div>
        <p className="mx-auto max-w-lg text-xs text-slate-500 leading-relaxed">
          Resource deployment tables, ignition risk rule evaluators, spread forecasts, zoning maps, and evacuation routing solvers activate automatically once a terrain dataset is loaded.
        </p>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
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
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Open Dataset Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Operational Analytics & Decision Suites
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Active Terrain: {datasetMeta?.name} · {datasetMeta?.region}
          </p>
        </div>
      </div>

      {/* Intuitive Tab Strip */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs">
        {ANALYTICS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#0284C7] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Resource Deployment */}
      {activeTab === 'resource-deployment' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Available Suppression Fleet</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Adjust available response units to automatically balance coverage across high-risk forest sectors.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Water Tankers</span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums">{waterTankers} units</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={waterTankers}
                  onChange={(e) => setWaterTankers(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Reconnaissance Drones</span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums">{reconDrones} units</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={reconDrones}
                  onChange={(e) => setReconDrones(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Ground Hotshot Crews</span>
                  <span className="font-mono font-semibold text-[#16A34A] tabular-nums">{groundCrews} teams</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={50}
                  value={groundCrews}
                  onChange={(e) => setGroundCrews(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Aerial Retardant Aircraft</span>
                  <span className="font-mono font-semibold text-amber-600 tabular-nums">{aerialDrops} aircraft</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={aerialDrops}
                  onChange={(e) => setAerialDrops(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>
            </div>
          </section>

          <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5">
            <h2 className="text-sm font-semibold text-slate-900">Sector Asset Allocation & Coverage</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Forest Sector</th>
                    <th className="px-4 py-2.5 text-right font-semibold">High-Risk Blocks</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Water Tankers</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Drones</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ground Crews</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sectorStats.map((sec) => (
                    <tr key={sec.name} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{sec.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{sec.highRisk}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#0284C7] font-semibold">
                        {sec.assignedTankers}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{sec.assignedDrones}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#16A34A] font-semibold">
                        {sec.assignedCrews}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {sec.coveragePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="h-60">
              <LightBarChart
                yLabel="Units Assigned"
                data={{
                  labels: sectorStats.map((s) => s.name),
                  datasets: [
                    {
                      label: 'Water Tankers',
                      data: sectorStats.map((s) => s.assignedTankers),
                      backgroundColor: '#0284C7',
                      borderRadius: 4,
                    },
                    {
                      label: 'Recon Drones',
                      data: sectorStats.map((s) => s.assignedDrones),
                      backgroundColor: '#38BDF8',
                      borderRadius: 4,
                    },
                    {
                      label: 'Ground Crews',
                      data: sectorStats.map((s) => s.assignedCrews),
                      backgroundColor: '#16A34A',
                      borderRadius: 4,
                    },
                  ],
                }}
              />
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Ignition Risk Rules */}
      {activeTab === 'ignition-rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Environmental Trigger Thresholds</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tune operational safety thresholds to scan the imported forest terrain for high-risk ignition zones.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Dense Canopy Fuel Threshold</span>
                  <span className="font-mono font-semibold text-[#16A34A] tabular-nums">≥ {fuelCutoff.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={0.9}
                  step={0.05}
                  value={fuelCutoff}
                  onChange={(e) => setFuelCutoff(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Low Humidity Warning</span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums">≤ {humidityCutoff}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={75}
                  step={5}
                  value={humidityCutoff}
                  onChange={(e) => setHumidityCutoff(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">High Wind Alert</span>
                  <span className="font-mono font-semibold text-amber-600 tabular-nums">≥ {windCutoff} km/h</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={55}
                  step={5}
                  value={windCutoff}
                  onChange={(e) => setWindCutoff(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Surface Heat Alert</span>
                  <span className="font-mono font-semibold text-red-600 tabular-nums">≥ {tempCutoff}°C</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={45}
                  step={1}
                  value={tempCutoff}
                  onChange={(e) => setTempCutoff(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setHighlightedCellIds(new Set(riskRuleMatches.critical));
                  navigate('/');
                }}
                className="w-full rounded-lg bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0369A1] transition-colors"
              >
                Highlight {riskRuleMatches.critical.length} Critical Blocks on 3D Arena
              </button>
            </div>
          </section>

          <section className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-red-200 bg-white p-5 shadow-2xs">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      High Risk: Dense Canopy + Dry Conditions + Elevated Wind or Heat
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Triggered when Fuel Density ≥ {fuelCutoff.toFixed(2)}, Humidity ≤ {humidityCutoff}%, and either Wind ≥ {windCutoff} km/h or Temperature ≥ {tempCutoff}°C.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-red-600 tabular-nums">
                    {riskRuleMatches.critical.length}
                  </div>
                  <div className="text-[11px] text-slate-500">blocks matched</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-2xs">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Flame className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Moderate Risk: Dry Surface Vegetation or Heavy Biomass Accumulation
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Triggered when terrain carries significant dry scrubland or moderate fuel accumulation without simultaneous peak wind gusts.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-amber-600 tabular-nums">
                    {riskRuleMatches.moderate.length}
                  </div>
                  <div className="text-[11px] text-slate-500">blocks matched</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-2xs">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Natural Containment: Riparian Channels, Firebreaks & High Moisture
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Blocks containing water corridors, engineered firebreaks, or moisture index ≥ 0.70 that naturally slow flame propagation.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-[#16A34A] tabular-nums">
                    {riskRuleMatches.protectedBlocks.length}
                  </div>
                  <div className="text-[11px] text-slate-500">protected blocks</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Spread Forecasting */}
      {activeTab === 'spread-forecasting' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Spread Horizon Controls</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Projects cumulative burned area in acres based on your active Wind Speed ({config.windSpeedKmh} km/h) and Relative Humidity ({config.humidityPct}%).
            </p>

            <div className="text-xs space-y-3">
              <div>
                <div className="flex justify-between text-slate-700 mb-1.5">
                  <span className="font-medium">Forecast Window</span>
                  <span className="font-mono font-semibold text-[#0284C7] tabular-nums">{forecastSteps} steps</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={24}
                  value={forecastSteps}
                  onChange={(e) => setForecastSteps(Number(e.target.value))}
                  className="saas-slider w-full"
                />
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 space-y-1.5 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-500">Projected Final Burned Area</span>
                  <span className="font-mono font-semibold text-red-600">
                    {forecastSeries[forecastSeries.length - 1]?.projectedAcres.toLocaleString()} ac
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Wind Factor</span>
                  <span className="font-mono font-semibold text-slate-900">{config.windSpeedKmh} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Atmospheric Humidity</span>
                  <span className="font-mono font-semibold text-[#16A34A]">{config.humidityPct}% RH</span>
                </div>
              </div>
            </div>
          </section>

          <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Cumulative Burned Acreage Projection</h2>
            <div className="h-72">
              <LightLineChart
                yLabel="Burned Acres"
                data={{
                  labels: forecastSeries.map((pt) => `Step ${pt.step}`),
                  datasets: [
                    {
                      label: 'Projected Burned Area (Acres)',
                      data: forecastSeries.map((pt) => pt.projectedAcres),
                      borderColor: '#0284C7',
                      backgroundColor: 'rgba(2, 132, 199, 0.10)',
                      fill: true,
                      borderWidth: 2,
                      tension: 0.25,
                    },
                    ...(telemetryHistory.length > 0
                      ? [
                          {
                            label: 'Observed Simulation Acreage',
                            data: forecastSeries.map((pt) => pt.observedAcres),
                            borderColor: '#16A34A',
                            borderDash: [5, 4],
                            borderWidth: 2,
                            tension: 0.25,
                          },
                        ]
                      : []),
                  ],
                }}
              />
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: Network & Zoning */}
      {activeTab === 'network-zoning' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">6×6 Sector Hazard Zoning Map</h2>
                <p className="text-xs text-slate-500">Adjacent forest blocks grouped into non-interfering response zones.</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Sector Origin:</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, rows - 6)}
                  value={patchStartRow}
                  onChange={(e) => setPatchStartRow(Number(e.target.value))}
                  className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-800"
                />
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cols - 6)}
                  value={patchStartCol}
                  onChange={(e) => setPatchStartCol(Number(e.target.value))}
                  className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {patchGraph.nodeCells.map((cell, idx) => {
                const tier = Math.min(3, patchGraph.chromaticColors[idx] ?? 0);
                const inactive = cell.state === 'dormant' || cell.state === 'water';
                const palette = HAZARD_TIERS[tier];
                return (
                  <div
                    key={cell.id}
                    style={
                      inactive
                        ? { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', color: '#0369A1' }
                        : { backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }
                    }
                    className="aspect-square rounded-lg border flex flex-col items-center justify-center text-[10px] font-semibold tabular-nums"
                    title={`${cell.id} · ${inactive ? 'Water / Break' : palette.label}`}
                  >
                    <span>{inactive ? 'Water' : palette.label.split(' ')[0]}</span>
                    <span className="font-mono text-[9px] font-normal opacity-80">
                      {cell.row},{cell.col}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5">
            <h2 className="text-sm font-semibold text-slate-900">Hazard Tier Breakdown & Connectivity</h2>
            <div className="grid grid-cols-3 gap-3 text-xs tabular-nums">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">Inspected Blocks</div>
                <div className="mt-1 font-mono text-xl font-bold text-slate-900">{patchGraph.nodeCells.length}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">Spread Links</div>
                <div className="mt-1 font-mono text-xl font-bold text-[#0284C7]">{patchGraph.edgeCount}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-slate-500">Distinct Zones</div>
                <div className="mt-1 font-mono text-xl font-bold text-[#16A34A]">{patchGraph.chromaticNumberUsed}</div>
              </div>
            </div>

            <div className="h-56">
              <LightBarChart data={hazardSummaryChart} yLabel="Blocks" />
            </div>
          </section>
        </div>
      )}

      {/* TAB 5: Evacuation & Routing */}
      {activeTab === 'evacuation-routing' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setRouteViewMode('evacuation')}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
                    routeViewMode === 'evacuation' ? 'bg-white text-[#0284C7] shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Civilian Evacuation Route
                </button>
                <button
                  type="button"
                  onClick={() => setRouteViewMode('firebreak')}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${
                    routeViewMode === 'firebreak' ? 'bg-white text-[#16A34A] shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Firebreak Corridor Plan
                </button>
              </div>

              <label className="flex items-center gap-2">
                <span className="text-slate-500">Origin:</span>
                <select
                  value={routeSourceIdx}
                  onChange={(e) => setRouteSourceIdx(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-slate-800"
                >
                  {patchGraph.nodeIds.map((id, i) => (
                    <option key={id} value={i}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <span className="text-slate-500">Safe Hub:</span>
                <select
                  value={routeTargetIdx}
                  onChange={(e) => setRouteTargetIdx(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-slate-800"
                >
                  {patchGraph.nodeIds.map((id, i) => (
                    <option key={id} value={i}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="text-slate-600 tabular-nums">
              {routeViewMode === 'evacuation' ? (
                <span>
                  Safest Route Distance:{' '}
                  <strong className="font-mono text-[#0284C7]">
                    {dijkstraResult.pathLabels.length > 0 ? `${dijkstraResult.pathLabels.length} sectors` : 'No clear path'}
                  </strong>
                </span>
              ) : (
                <span>
                  Recommended Firebreak Segments:{' '}
                  <strong className="font-mono text-[#16A34A]">{kruskalResult.mstEdges.length} links</strong>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Clean Visual Route Map */}
            <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MapPin className="h-4 w-4 text-[#0284C7]" />
                <span>
                  {routeViewMode === 'evacuation' ? 'Safe Evacuation Corridor Map' : 'Optimal Firebreak Placement Grid'}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {patchGraph.nodeCells.map((cell, idx) => {
                  const onEvacPath = dijkstraResult.pathIndices.includes(idx);
                  const onMstCorridor = kruskalResult.mstEdges.some((e) => e.uIdx === idx || e.vIdx === idx);
                  const isStart = idx === routeSourceIdx;
                  const isEnd = idx === routeTargetIdx;
                  const highlighted = routeViewMode === 'evacuation' ? onEvacPath : onMstCorridor;
                  return (
                    <div
                      key={cell.id}
                      className={`aspect-square rounded-lg flex items-center justify-center font-mono text-[10px] font-semibold border ${
                        isStart && routeViewMode === 'evacuation'
                          ? 'bg-[#0284C7] text-white border-[#0369A1]'
                          : isEnd && routeViewMode === 'evacuation'
                            ? 'bg-[#16A34A] text-white border-[#15803D]'
                            : highlighted
                              ? 'bg-sky-100 text-[#0369A1] border-sky-300'
                              : 'bg-white text-slate-400 border-slate-200'
                      }`}
                    >
                      {isStart && routeViewMode === 'evacuation'
                        ? 'START'
                        : isEnd && routeViewMode === 'evacuation'
                          ? 'SAFE'
                          : `${cell.row},${cell.col}`}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {routeViewMode === 'evacuation'
                  ? 'Highlights the lowest-risk shortest corridor avoiding dense dry canopy and active fires.'
                  : 'Connects strategic containment corridors with minimal engineering distance across the sector.'}
              </p>
            </section>

            {/* Step-by-Step Readable Dispatch Itinerary */}
            <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {routeViewMode === 'evacuation'
                  ? 'Step-by-Step Evacuation Dispatch Instructions'
                  : 'Step-by-Step Firebreak Construction Priorities'}
              </h3>

              {routeViewMode === 'evacuation' ? (
                dijkstraResult.pathLabels.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No unblocked route exists between the selected origin and destination. Choose another origin sector or adjust the grid origin.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {dijkstraResult.pathLabels.map((label, stepIdx) => {
                      const cell = patchGraph.nodeCells[dijkstraResult.pathIndices[stepIdx]];
                      const isFirst = stepIdx === 0;
                      const isLast = stepIdx === dijkstraResult.pathLabels.length - 1;
                      return (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold text-[#0284C7] w-14">
                              Step {stepIdx + 1}
                            </span>
                            <span className="font-medium text-slate-900">
                              {isFirst
                                ? `Depart evacuation origin ${label}`
                                : isLast
                                  ? `Arrive at safe extraction hub ${label}`
                                  : `Advance through low-risk corridor ${label}`}
                            </span>
                          </div>
                          <span className="text-slate-500 tabular-nums">
                            {cell?.biome} · Fuel {(cell?.fuelDensity ?? 0).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {kruskalResult.mstEdges.slice(0, 18).map((edge, idx) => (
                    <div key={`${edge.uIdx}-${edge.vIdx}`} className="flex items-center justify-between px-4 py-2.5 text-xs tabular-nums">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-[#16A34A] w-16">
                          Break #{idx + 1}
                        </span>
                        <span className="font-medium text-slate-900">
                          Clear containment strip between {patchGraph.nodeIds[edge.uIdx]} and {patchGraph.nodeIds[edge.vIdx]}
                        </span>
                      </div>
                      <span className="font-mono text-slate-500">Effort score {edge.weight.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
