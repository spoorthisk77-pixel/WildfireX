import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileCode2,
  Globe2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import type { ParsedDatasetPreview } from '../types/engine';
import { buildGlobalForestPresetFile, parseUniversalDataset } from '../utils/datasetParser';
import { LightBarChart } from '../components/ChartsLight';

const GLOBAL_PRESETS: Array<{
  id: 'amazon' | 'western_ghats' | 'bannerghatta' | 'boreal';
  title: string;
  format: string;
  coords: string;
  summary: string;
}> = [
  {
    id: 'amazon',
    title: 'Amazon Basin — Manaus Sector',
    format: 'GeoJSON',
    coords: '-3.1°S, -60.1°W',
    summary: 'Dense tropical rainforest canopy, high biomass fuel load, and meandering riparian channel.',
  },
  {
    id: 'western_ghats',
    title: 'Western Ghats — Nagarhole Escarpment',
    format: 'CSV',
    coords: '12.0°N, 76.1°E',
    summary: 'Moist deciduous and dry scrub mosaic with steep escarpment elevation gradient.',
  },
  {
    id: 'bannerghatta',
    title: 'Bannerghatta — Dry Deciduous Corridor',
    format: 'CSV',
    coords: '12.8°N, 77.6°E',
    summary: 'Mixed dry scrub and deciduous forest ridges intersected by a central stream break.',
  },
  {
    id: 'boreal',
    title: 'Boreal Taiga — Athabasca Peatland',
    format: 'JSON',
    coords: '57.1°N, -111.5°W',
    summary: 'Coniferous black spruce ridges, high-moisture wetland pockets, and granite outcrops.',
  },
];

export function IngestionPage() {
  const navigate = useNavigate();
  const { datasetMeta, isInitialized, loadDataset, unloadToDormant } = useEngine();

  const [staged, setStaged] = useState<ParsedDatasetPreview | null>(null);
  const [stagedRaw, setStagedRaw] = useState<{ filename: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const ingestRawText = (filename: string, rawText: string, label?: string, region?: string) => {
    setError(null);
    try {
      const parsed = parseUniversalDataset(filename, rawText, label, region);
      setStaged(parsed);
      setStagedRaw({ filename, content: rawText });
    } catch (err) {
      setStaged(null);
      setError(err instanceof Error ? err.message : 'Failed to parse geospatial dataset.');
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['csv', 'json', 'geojson'].includes(ext)) {
      setError('Unsupported file extension. Please upload a .csv, .json, or .geojson file.');
      return;
    }
    const text = await file.text();
    ingestRawText(file.name, text);
  };

  const handleLoadGlobalPreset = (presetId: 'amazon' | 'western_ghats' | 'bannerghatta' | 'boreal') => {
    const payload = buildGlobalForestPresetFile(presetId);
    ingestRawText(payload.filename, payload.content, payload.label, payload.region);
  };

  const handleDeployToEngine = () => {
    if (!staged) return;
    loadDataset(staged);
    navigate('/');
  };

  const handleDownloadStaged = () => {
    if (!stagedRaw) return;
    const blob = new Blob([stagedRaw.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stagedRaw.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const biomeDistribution = useMemo(() => {
    if (!staged) return null;
    const counts = new Map<string, number>();
    staged.cells.forEach((c) => {
      if (c.state === 'dormant') return;
      counts.set(c.biome, (counts.get(c.biome) || 0) + 1);
    });
    const labels = Array.from(counts.keys());
    return {
      labels,
      datasets: [
        {
          label: 'Terrain Blocks',
          data: labels.map((l) => counts.get(l) || 0),
          backgroundColor: labels.map((l) =>
            l.includes('Water')
              ? '#0284C7'
              : l.includes('Barren')
                ? '#94A3B8'
                : l.includes('Dry')
                  ? '#D97706'
                  : '#16A34A',
          ),
          borderRadius: 4,
        },
      ],
    };
  }, [staged]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Geospatial Dataset Ingestion Portal
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Import CSV, JSON, or GeoJSON forest terrain datasets. Simulation remains dormant until you deploy a dataset.
          </p>
        </div>

        {isInitialized && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#16A34A]">
              Active: {datasetMeta?.name}
            </span>
            <button
              type="button"
              onClick={unloadToDormant}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Unload to Dormant</span>
            </button>
          </div>
        )}
      </div>

      {/* Dropzone + Global Forest Reference Sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0] || null;
            void handleFile(dropped);
          }}
          className={`lg:col-span-5 rounded-xl border-2 border-dashed p-6 flex flex-col justify-between transition-colors ${
            dragActive
              ? 'border-[#0284C7] bg-sky-50'
              : 'border-slate-300 bg-white shadow-2xs'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#0284C7] text-xs font-semibold">
              <Upload className="h-4 w-4" />
              <span>Upload Custom Forest File (.CSV / .JSON / .GEOJSON)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Accepts grid-indexed tables (<span className="font-mono text-slate-800">row, col</span>) or WGS84 coordinates (<span className="font-mono text-slate-800">latitude, longitude</span>) with elevation, fuel density, moisture index, temperature, and biome columns.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <label className="block cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center hover:border-[#0284C7] hover:bg-sky-50/40 transition-colors">
              <input
                type="file"
                accept=".csv,.json,.geojson"
                onChange={(e) => void handleFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <FileCode2 className="mx-auto h-7 w-7 text-[#0284C7]" />
              <div className="mt-2.5 text-sm font-semibold text-slate-800">
                Drop dataset file here or click to browse
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Instant schema validation and coordinate mapping
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Globe2 className="h-4 w-4 text-[#0284C7]" />
              <span>Global Forest Reference Datasets</span>
            </div>
            <span className="text-xs text-slate-500">576 terrain blocks per sector</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {GLOBAL_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="text-xs font-medium text-[#0284C7]">
                    {preset.format} · {preset.coords}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{preset.title}</h3>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{preset.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadGlobalPreset(preset.id)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-[#0284C7] hover:text-[#0284C7] transition-colors shadow-2xs"
                >
                  Preview {preset.format} Sector
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Staged Dataset Preview & Deployment */}
      {staged && (
        <section className="rounded-xl border border-sky-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Dataset Ready to Deploy: {staged.meta.name}
                </h2>
                <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {staged.meta.sourceFormat.toUpperCase()} · {staged.meta.rows}×{staged.meta.cols} grid ·{' '}
                  {staged.meta.recordCount} valid blocks ({staged.meta.skippedCount} skipped)
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadStaged}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Source</span>
              </button>
              <button
                type="button"
                onClick={handleDeployToEngine}
                className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors shadow-xs"
              >
                <span>Initialize 3D Simulation Arena</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs tabular-nums">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
              <div className="text-slate-500">Elevation Range</div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                {staged.meta.elevationRange
                  ? `${staged.meta.elevationRange.min.toFixed(0)}–${staged.meta.elevationRange.max.toFixed(0)} m`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
              <div className="text-slate-500">Avg Fuel Density</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#16A34A]">
                {staged.meta.meanFuelDensity !== null ? staged.meta.meanFuelDensity.toFixed(3) : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
              <div className="text-slate-500">Avg Moisture Index</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#0284C7]">
                {staged.meta.meanMoisture !== null ? staged.meta.meanMoisture.toFixed(3) : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
              <div className="text-slate-500">Avg Surface Temp</div>
              <div className="mt-1 font-mono text-base font-semibold text-amber-600">
                {staged.meta.meanTemperature !== null ? `${staged.meta.meanTemperature.toFixed(1)} °C` : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 h-56 rounded-lg border border-slate-100 bg-slate-50 p-4">
              {biomeDistribution && <LightBarChart data={biomeDistribution} yLabel="Blocks" />}
            </div>

            <div className="lg:col-span-7 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-700">
                <Database className="h-3.5 w-3.5 text-[#0284C7]" />
                <span>Sample Parsed Records ({staged.rawColumnNames.length} attributes)</span>
              </div>
              <table className="w-full text-left font-mono text-xs tabular-nums">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <tr>
                    {staged.rawColumnNames.slice(0, 8).map((col) => (
                      <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staged.sampleRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      {staged.rawColumnNames.slice(0, 8).map((col) => (
                        <td key={col} className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
