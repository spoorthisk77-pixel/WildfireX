import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileDown, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import {
  computeReportMetrics,
  exportSimulationHighResPngReport,
  exportSimulationPdfReport,
} from '../utils/reportExporter';

export function ReportExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    datasetMeta,
    cells,
    generation,
    config,
    isInitialized,
    latestViewportSnapshotUrl,
    captureCurrentViewportImage,
  } = useEngine();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState(
    'Perimeter containment prioritized along natural riparian corridors and ridge firebreaks under current wind forecast.',
  );
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setError(null);
    setTitle(
      `Wildfire Simulation Briefing — ${datasetMeta?.name || 'Active Sector'} (Step ${generation})`,
    );
    const fresh = captureCurrentViewportImage() || latestViewportSnapshotUrl;
    setSnapshotUrl(fresh);
  }, [open, datasetMeta?.name, generation, captureCurrentViewportImage, latestViewportSnapshotUrl]);

  const metrics = useMemo(() => computeReportMetrics(cells, isInitialized), [cells, isInitialized]);

  if (!open) return null;

  const handleExport = async (format: 'pdf' | 'png') => {
    setExporting(format);
    setError(null);
    setFeedback(null);
    try {
      const payload = {
        title,
        notes,
        datasetMeta,
        cells,
        generation,
        config,
        isInitialized,
        snapshotDataUrl: snapshotUrl,
      };
      if (format === 'pdf') {
        await exportSimulationPdfReport(payload);
        setFeedback('Stakeholder PDF report downloaded.');
      } else {
        await exportSimulationHighResPngReport(payload);
        setFeedback('High-resolution 2400×1500 PNG briefing slide downloaded.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report export failed.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-export-title"
    >
      <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-modal-enter">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="min-w-0 pr-2">
            <h2 id="report-export-title" className="text-sm sm:text-base font-semibold text-slate-900">
              Export Stakeholder Presentation Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Packages telemetry metrics, atmospheric parameters, and the current 3D isometric terrain snapshot into a clean PDF or high-resolution PNG slide.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
            aria-label="Close export modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 max-h-[82vh] overflow-y-auto">
          {/* Left: 3D Isometric Snapshot Preview */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">Captured 3D Isometric Snapshot</span>
              <span className="text-slate-500 tabular-nums">
                Step {generation} · {config.windSpeedKmh} km/h @ {config.windAngleDeg}°
              </span>
            </div>

            <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
              {snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt="Captured 3D isometric wildfire simulation view"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="px-6 text-center text-xs text-slate-500">
                  Open the 3D Simulation Arena first to capture a live isometric terrain snapshot, or export metrics without an embedded view.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-500">Burned Area</div>
                <div className="mt-0.5 font-mono font-bold text-slate-900">{metrics.burnedAcres} ac</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-500">Active Fires</div>
                <div className="mt-0.5 font-mono font-bold text-red-600">{metrics.activeFires}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-500">Containment</div>
                <div className="mt-0.5 font-mono font-bold text-[#16A34A]">{metrics.containmentEfficiency}%</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[11px] text-slate-500">Time Step</div>
                <div className="mt-0.5 font-mono font-bold text-[#0284C7]">Step {generation}</div>
              </div>
            </div>
          </div>

          {/* Right: Report Metadata & Download Actions */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            <div className="space-y-4 text-xs">
              <label className="block">
                <span className="font-semibold text-slate-700">Presentation Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:border-[#0284C7] focus:bg-white focus:outline-none transition-colors"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700">Stakeholder Briefing Notes</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-[#0284C7] focus:bg-white focus:outline-none resize-none transition-colors"
                />
              </label>

              {feedback && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{feedback}</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => void handleExport('pdf')}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span>{exporting === 'pdf' ? 'Generating PDF...' : 'Download PDF Report (.pdf)'}</span>
              </button>

              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => void handleExport('png')}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:border-[#16A34A] hover:text-[#16A34A] disabled:opacity-60 transition-colors"
              >
                <ImageIcon className="h-4 w-4 text-[#16A34A]" />
                <span>
                  {exporting === 'png' ? 'Rendering 2400×1500 Image...' : 'Download High-Res Slide (.png)'}
                </span>
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <FileDown className="h-3.5 w-3.5" />
                <span>Client-side high-DPI rendering · Ready for slides & PDF briefs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
