import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Globe2, Upload, X } from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import { buildGlobalForestPresetFile, parseUniversalDataset } from '../utils/datasetParser';

const GLOBAL_PRESETS: Array<{
  id: 'amazon' | 'western_ghats' | 'bannerghatta' | 'boreal';
  name: string;
  region: string;
  format: string;
  summary: string;
}> = [
  {
    id: 'amazon',
    name: 'Amazon Basin',
    region: 'Manaus Tropical Canopy · Brazil',
    format: 'GeoJSON',
    summary: 'High-density rainforest biomass intersected by a wide riparian river channel.',
  },
  {
    id: 'western_ghats',
    name: 'Western Ghats',
    region: 'Nagarhole Escarpment · Karnataka',
    format: 'CSV',
    summary: 'Moist deciduous and dry scrub mosaic with steep escarpment elevation gradient.',
  },
  {
    id: 'bannerghatta',
    name: 'Bannerghatta',
    region: 'Dry Deciduous Corridor · Bengaluru South',
    format: 'CSV',
    summary: 'Mixed scrubland and deciduous ridges divided by a central stream corridor.',
  },
  {
    id: 'boreal',
    name: 'Boreal Taiga',
    region: 'Athabasca Peatland · Alberta',
    format: 'JSON',
    summary: 'Coniferous black spruce ridges with wetland bog pockets and granite outcrops.',
  },
];

export function DatasetUploadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { loadDataset } = useEngine();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!open) return null;

  const processFileText = (filename: string, content: string, label?: string, region?: string) => {
    setError(null);
    try {
      const parsed = parseUniversalDataset(filename, content, label, region);
      loadDataset(parsed);
      setStatusMessage(`Loaded ${parsed.meta.name} (${parsed.meta.recordCount} forest blocks).`);
      window.setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 280);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse dataset file.');
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['csv', 'json', 'geojson'].includes(ext)) {
      setError('Unsupported file format. Please select a .csv, .json, or .geojson file.');
      return;
    }
    const text = await file.text();
    processFileText(file.name, text);
  };

  const handleImportPreset = (id: 'amazon' | 'western_ghats' | 'bannerghatta' | 'boreal') => {
    const payload = buildGlobalForestPresetFile(id);
    processFileText(payload.filename, payload.content, payload.label, payload.region);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="upload-modal-title" className="text-base font-semibold text-slate-900">
              Import Forest Dataset
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload CSV, JSON, or GeoJSON terrain telemetry or choose a calibrated regional forest sector.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* File Dropzone */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void handleFile(e.dataTransfer.files?.[0] || null);
            }}
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragActive
                ? 'border-[#0284C7] bg-sky-50'
                : 'border-slate-300 bg-slate-50 hover:border-[#0284C7] hover:bg-sky-50/40'
            }`}
          >
            <input
              type="file"
              accept=".csv,.json,.geojson"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
              <Upload className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-800">
              Drop a CSV, JSON, or GeoJSON dataset here, or click to browse
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Automatically maps elevation, fuel density, moisture index, surface temperature, and biome class.
            </p>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Global Forest Reference Sectors */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Globe2 className="h-4 w-4 text-[#0284C7]" />
                <span>Calibrated Global Forest Sectors</span>
              </div>
              <span className="text-xs text-slate-500">576 spatial blocks per sector</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GLOBAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleImportPreset(preset.id)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-[#0284C7] hover:shadow-sm transition-all flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{preset.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#0284C7]">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {preset.format}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{preset.region}</div>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{preset.summary}</p>
                  </div>
                  <div className="pt-1 text-xs font-semibold text-[#16A34A]">
                    Load Sector Into Arena →
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
