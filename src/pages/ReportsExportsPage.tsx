import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { Dataset, Experiment, ProcessedGrid, ReportRecord, SimulationRun } from '../types/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { SCIENTIFIC_DISCLAIMER } from '../utils/disclaimer';

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ReportsExportsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [simulations, setSimulations] = useState<SimulationRun[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  // Research report generator state
  const [title, setTitle] = useState('Nagarhole National Park WildfireX Research Report');
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [gridId, setGridId] = useState<string>('');
  const [simulationId, setSimulationId] = useState<string>('');
  const [experimentId, setExperimentId] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Preview 15 sections & Delete dialog
  const [previewReport, setPreviewReport] = useState<ReportRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dsRes, gridList, simList, expList, repList] = await Promise.all([
        apiClient.listDatasets(),
        apiClient.listGrids(),
        apiClient.listSimulations(),
        apiClient.listExperiments(),
        apiClient.listReports(),
      ]);
      setDatasets(dsRes.items);
      setGrids(gridList);
      setSimulations(simList);
      setExperiments(expList);
      setReports(repList);
      if (gridList.length > 0 && !gridId) setGridId(String(gridList[0].id));
      if (simList.length > 0 && !simulationId) setSimulationId(String(simList[0].id));
      if (expList.length > 0 && !experimentId) setExperimentId(String(expList[0].id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports and exportable artifacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFeedback({ type: 'error', text: 'Report title is required.' });
      return;
    }
    setGenerating(true);
    setFeedback(null);
    try {
      const created = await apiClient.generateReport({
        title: title.trim(),
        format,
        report_type: 'comprehensive_research',
        grid_id: gridId ? Number(gridId) : null,
        simulation_id: simulationId ? Number(simulationId) : null,
        experiment_id: experimentId ? Number(experimentId) : null,
      });
      setPreviewReport(created);
      setFeedback({
        type: 'success',
        text: `Generated ${created.format.toUpperCase()} report WXR-${created.id} (${created.summary_json?.section_count ?? 15} sections).`,
      });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Report generation failed.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteReport = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.deleteReport(deleteTarget.id);
      if (previewReport?.id === deleteTarget.id) setPreviewReport(null);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete report.' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const exportProvenanceManifest = () => {
    const manifest = {
      exported_at: new Date().toISOString(),
      study_region: 'Nagarhole National Park, Karnataka, India',
      dataset_count: datasets.length,
      disclaimer: SCIENTIFIC_DISCLAIMER,
      datasets: datasets.map((d) => ({
        id: d.id,
        name: d.name,
        file_format: d.file_format,
        original_filename: d.original_filename,
        sha256_hash: d.sha256_hash,
        data_source: d.data_source,
        acquisition_date: d.acquisition_date,
        license_or_citation: d.license_or_citation,
        crs: d.metadata_record?.crs ?? null,
        processing_status: d.processing_status,
      })),
    };
    triggerDownload(
      'wildfirex_dataset_provenance_manifest.json',
      JSON.stringify(manifest, null, 2),
      'application/json',
    );
  };

  const exportGridCsv = async (grid: ProcessedGrid) => {
    setExportingId(grid.id);
    try {
      const page = await apiClient.getGridCells(grid.id, { limit: 16000 });
      const headers = [
        'cell_uid',
        'row_idx',
        'col_idx',
        'center_lat',
        'center_lon',
        'native_x',
        'native_y',
        'crs',
        'spatial_resolution_m',
        'landcover_code',
        'landcover_category',
        'original_source_value',
        'elevation_m',
        'vegetation_index',
        'quality_status',
        'graph_vertex_id',
        'neighbor_count',
      ];
      const rows = page.cells.map((c) =>
        [
          c.cell_uid,
          c.row_idx,
          c.col_idx,
          c.center_lat,
          c.center_lon,
          c.native_x,
          c.native_y,
          c.crs,
          c.spatial_resolution,
          c.landcover_code ?? '',
          `"${c.landcover_category.replace(/"/g, '""')}"`,
          `"${(c.original_source_value ?? '').replace(/"/g, '""')}"`,
          c.elevation_m ?? '',
          c.vegetation_index ?? '',
          c.quality_status,
          c.graph_vertex_id,
          c.neighbors_json.length,
        ].join(','),
      );
      const csvText = [headers.join(','), ...rows].join('\n');
      triggerDownload(`wildfirex_grid_${grid.id}_cells.csv`, csvText, 'text/csv;charset=utf-8');
    } finally {
      setExportingId(null);
    }
  };

  if (loading) return <LoadingState message="Loading research reports and exportable artifacts..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  return (
    <div className="space-y-6">
      {/* 15-Section Research Report Generator */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7EBE6] pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#1B4332]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#151B18]">
                Comprehensive 15-Section Research Report Generator (PDF / CSV)
              </h2>
              <p className="text-xs text-[#5B6861]">
                Generates an academic ReportLab PDF (with embedded composition bar chart and provenance tables) or structured CSV covering all 15 required audit sections and disclaimers.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleGenerateReport} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="lg:col-span-2">
            <label className="block font-medium text-[#2A332E] mb-1">Report Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            />
          </div>

          <div>
            <label className="block font-medium text-[#2A332E] mb-1">Output Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'pdf' | 'csv')}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="pdf">PDF Document (.pdf)</option>
              <option value="csv">Structured Sections (.csv)</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-[#2A332E] mb-1">Target Grid</label>
            <select
              value={gridId}
              onChange={(e) => setGridId(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">Auto / Latest</option>
              {grids.map((g) => (
                <option key={g.id} value={g.id}>
                  #{g.id} {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-[#2A332E] mb-1">Target Simulation</label>
            <select
              value={simulationId}
              onChange={(e) => setSimulationId(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">None / Auto</option>
              {simulations.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block font-medium text-[#2A332E] mb-1">Linked Experiment (Optional)</label>
            <select
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">None</option>
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  #{exp.id} {exp.name} ({exp.module_type})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 flex flex-wrap items-end justify-between gap-3">
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
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-md bg-[#1B4332] px-4 py-2 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50 whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{generating ? 'Compiling Report...' : 'Generate Research Report'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Saved Reports Archive */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-[#151B18]">
          Generated Research Reports Archive ({reports.length})
        </h3>
        {reports.length === 0 ? (
          <EmptyState
            title="No research reports generated yet"
            description="Click Generate Research Report above to create and persist a PDF or CSV report containing all 15 audit sections."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                  <th className="py-2 font-medium">Report ID</th>
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Format</th>
                  <th className="py-2 font-medium">Sections</th>
                  <th className="py-2 font-medium">Generated (UTC)</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2EF]">
                {reports.map((rep) => (
                  <tr key={rep.id}>
                    <td className="py-2.5 font-mono font-medium text-[#151B18]">WXR-{rep.id}</td>
                    <td className="py-2.5 font-medium text-[#151B18]">
                      <button
                        type="button"
                        onClick={() => setPreviewReport(previewReport?.id === rep.id ? null : rep)}
                        className="hover:underline text-left"
                      >
                        {rep.title}
                      </button>
                    </td>
                    <td className="py-2.5 font-mono uppercase">{rep.format}</td>
                    <td className="py-2.5 font-mono tabular-nums">{rep.summary_json?.section_count ?? 15}</td>
                    <td className="py-2.5 font-mono tabular-nums text-[#5B6861]">
                      {new Date(rep.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setPreviewReport(previewReport?.id === rep.id ? null : rep)}
                        className="rounded border border-[#C6CFC8] px-2.5 py-1 text-[11px] font-medium text-[#151B18] hover:bg-[#F5F6F3]"
                      >
                        {previewReport?.id === rep.id ? 'Hide Sections' : 'Inspect Sections'}
                      </button>
                      {rep.has_file && (
                        <a
                          href={apiClient.getReportDownloadUrl(rep.id)}
                          className="inline-flex items-center gap-1 rounded border border-[#1B4332] bg-[#1B4332] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#143326]"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download {rep.format.toUpperCase()}</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(rep)}
                        className="inline-flex items-center rounded border border-[#E7EBE6] p-1 text-[#6B7871] hover:border-[#F2B8B5] hover:text-[#B42318]"
                        title="Delete report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {previewReport?.summary_json?.sections && (
          <div className="mt-4 rounded-md border border-[#DCE2DC] bg-[#FAFBF9] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#E7EBE6] pb-2">
              <div className="text-xs font-semibold text-[#151B18]">
                WXR-{previewReport.id}: {previewReport.title} — All {previewReport.summary_json.sections.length} Sections
              </div>
              <button
                type="button"
                onClick={() => setPreviewReport(null)}
                className="text-xs text-[#5B6861] hover:text-[#151B18]"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {previewReport.summary_json.sections.map((sec) => (
                <div key={sec.number} className="rounded border border-[#E7EBE6] bg-white p-3">
                  <div className="font-semibold text-[#151B18]">
                    {sec.number}. {sec.title}
                  </div>
                  <p className="mt-1 text-[11px] text-[#4B5851] leading-relaxed">{sec.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Dataset Provenance Manifest & Raw Grid CSV Exports */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-[#151B18]">
            Dataset Provenance Manifest
          </h3>
          <p className="mt-1 text-xs text-[#5B6861]">
            Export SHA-256 checksums, source citations, CRS metadata, and validation status for all {datasets.length} imported datasets.
          </p>
        </div>
        <button
          type="button"
          onClick={exportProvenanceManifest}
          className="inline-flex items-center gap-2 rounded-md border border-[#C6CFC8] bg-white px-4 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-[#1B4332]" />
          <span>Download Provenance JSON</span>
        </button>
      </section>

      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="h-4 w-4 text-[#1B4332]" />
          <h3 className="font-display text-base font-semibold text-[#151B18]">
            Structured Cellular Grid Exports ({grids.length})
          </h3>
        </div>
        {grids.length === 0 ? (
          <p className="text-xs text-[#6B7871]">No structured grids generated yet.</p>
        ) : (
          <div className="divide-y divide-[#E7EBE6]">
            {grids.map((grid) => (
              <div key={grid.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-[#151B18]">{grid.name}</div>
                  <div className="mt-0.5 text-xs font-mono tabular-nums text-[#5B6861]">
                    {grid.rows}×{grid.cols} ({grid.valid_cell_count} valid cells) · {grid.crs} ·{' '}
                    {grid.resolution_meters}m
                  </div>
                </div>
                <button
                  type="button"
                  disabled={exportingId === grid.id}
                  onClick={() => exportGridCsv(grid)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5 text-[#1B4332]" />
                  <span>{exportingId === grid.id ? 'Exporting...' : 'Export Cells CSV'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Generated Report"
        description={
          deleteTarget
            ? `Delete report WXR-${deleteTarget.id} ("${deleteTarget.title}")? This removes both the database record and stored ${deleteTarget.format.toUpperCase()} artifact.`
            : ''
        }
        confirmLabel="Delete Report"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteReport}
      />
    </div>
  );
}
