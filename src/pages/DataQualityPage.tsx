import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileWarning, Grid3X3, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { DataQualityReport } from '../types/api';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

export function DataQualityPage() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getDataQuality();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data quality audit.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  if (loading) return <LoadingState message="Auditing dataset provenance, CRS, NoData ratios, and validation records..." />;
  if (error || !report) return <ErrorState message={error || 'Data quality audit unavailable.'} onRetry={loadReport} />;

  return (
    <div className="space-y-6">
      {/* No-Imputation Transparency Banner */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1B4332]">
          <ShieldCheck className="h-4 w-4" />
          <span>Data Quality & Transparency Audit</span>
        </div>
        <h2 className="font-display text-lg font-semibold text-[#151B18]">
          Provenance, Validation & Missing-Value Policy
        </h2>
        <p className="text-xs leading-relaxed text-[#4B5851] max-w-4xl">
          {report.imputation_policy}
        </p>
      </section>

      {report.datasets.length === 0 && report.grids.length === 0 ? (
        <EmptyState
          title="No datasets or grids recorded for quality auditing"
          description="Upload geospatial files in the Dataset Centre and generate grids in the Geospatial Laboratory to inspect CRS accuracy, NoData percentages, duplicate counts, and processing history."
        />
      ) : (
        <>
          {/* Dataset Audit Table */}
          <section className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
            <div className="border-b border-[#DCE2DC] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[#1B4332]" />
                <h3 className="font-display text-sm font-semibold text-[#151B18]">
                  Source Dataset Quality Audit ({report.datasets.length})
                </h3>
              </div>
            </div>

            {report.datasets.length === 0 ? (
              <p className="p-6 text-xs text-[#6B7871]">No datasets uploaded.</p>
            ) : (
              <div className="divide-y divide-[#E7EBE6]">
                {report.datasets.map((ds) => (
                  <div key={ds.dataset_id} className="p-6 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[#151B18]">
                          #{ds.dataset_id} · {ds.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5B6861] font-mono tabular-nums">
                          <span>{ds.original_filename}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ds.file_format.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>Source: {ds.data_source}</span>
                          <span aria-hidden="true">·</span>
                          <span>SHA-256: {ds.sha256_hash.slice(0, 12)}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs font-mono tabular-nums text-[#5B6861]">
                        <div>Status: {ds.processing_status}</div>
                        <div>Processed {new Date(ds.processing_date).toLocaleString()}</div>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 rounded-md bg-[#F5F6F3] p-3.5 text-xs">
                      <div>
                        <dt className="text-[#6B7871]">Acquisition Date</dt>
                        <dd className="mt-0.5 font-mono text-[#151B18]">{ds.acquisition_date}</dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">CRS</dt>
                        <dd className="mt-0.5 font-mono text-[#151B18]">{ds.crs || 'Undefined'}</dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Native Resolution</dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                          {ds.spatial_resolution || 'N/A'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">NoData %</dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                          {ds.nodata_percentage !== null ? `${ds.nodata_percentage.toFixed(2)}%` : 'N/A'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Invalid Records</dt>
                        <dd
                          className={`mt-0.5 font-mono tabular-nums font-semibold ${
                            ds.invalid_record_count > 0 ? 'text-[#B42318]' : 'text-[#1E6B45]'
                          }`}
                        >
                          {ds.invalid_record_count}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#6B7871]">Duplicates Flagged</dt>
                        <dd
                          className={`mt-0.5 font-mono tabular-nums font-semibold ${
                            ds.duplicate_record_count > 0 ? 'text-[#9A5B13]' : 'text-[#1E6B45]'
                          }`}
                        >
                          {ds.duplicate_record_count}
                        </dd>
                      </div>
                    </dl>

                    {ds.missing_attributes.length > 0 && (
                      <div className="text-xs text-[#5B6861]">
                        <span className="font-medium text-[#151B18]">Missing Metadata Fields: </span>
                        <span className="font-mono">{ds.missing_attributes.join(', ')}</span>
                      </div>
                    )}

                    {ds.validation_warnings.length > 0 ? (
                      <ul className="space-y-1 text-xs text-[#9A5B13]">
                        {ds.validation_warnings.map((w, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <FileWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[#1E6B45]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>No validation warnings detected.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Grid Quality Audit */}
          <section className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
            <div className="border-b border-[#DCE2DC] px-6 py-4 flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-[#1B4332]" />
              <h3 className="font-display text-sm font-semibold text-[#151B18]">
                Processed Cellular Grid Quality ({report.grids.length})
              </h3>
            </div>
            {report.grids.length === 0 ? (
              <p className="p-6 text-xs text-[#6B7871]">No processed cellular grids available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F6F3] border-b border-[#DCE2DC] text-[#4B5851]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Grid</th>
                      <th className="px-4 py-2.5 font-medium">Source Dataset</th>
                      <th className="px-4 py-2.5 font-medium">CRS</th>
                      <th className="px-4 py-2.5 font-medium text-right">Res (m)</th>
                      <th className="px-4 py-2.5 font-medium text-right">Valid / Total</th>
                      <th className="px-4 py-2.5 font-medium text-right">NoData %</th>
                      <th className="px-4 py-2.5 font-medium">Transparency Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2EF]">
                    {report.grids.map((g) => (
                      <tr key={g.grid_id}>
                        <td className="px-4 py-2.5 font-medium text-[#151B18]">{g.name}</td>
                        <td className="px-4 py-2.5 text-[#4B5851]">{g.source_dataset_name}</td>
                        <td className="px-4 py-2.5 font-mono">{g.crs}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{g.resolution_meters.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.valid_cell_count}/{g.cell_count}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{g.nodata_percentage.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-[#5B6861] space-y-0.5">
                          {g.missing_attributes.map((a, idx) => (
                            <div key={idx}>{a}</div>
                          ))}
                          {g.warnings.map((w, idx) => (
                            <div key={`w-${idx}`} className="text-[#9A5B13] inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Processing History */}
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-3">
            <h3 className="font-display text-sm font-semibold text-[#151B18]">
              Processing Pipeline History ({report.processing_history.length} Jobs)
            </h3>
            {report.processing_history.length === 0 ? (
              <p className="text-xs text-[#6B7871]">No processing jobs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E7EBE6] text-[#5B6861]">
                    <tr>
                      <th className="py-2 font-medium">Job ID</th>
                      <th className="py-2 font-medium">Operation</th>
                      <th className="py-2 font-medium">Dataset ID</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                    {report.processing_history.map((job) => (
                      <tr key={job.id}>
                        <td className="py-2">#{job.id}</td>
                        <td className="py-2 font-sans font-medium text-[#151B18]">{job.job_type}</td>
                        <td className="py-2">{job.dataset_id ? `#${job.dataset_id}` : '—'}</td>
                        <td
                          className={`py-2 font-sans font-medium ${
                            job.status === 'completed'
                              ? 'text-[#1E6B45]'
                              : job.status === 'failed'
                                ? 'text-[#B42318]'
                                : 'text-[#9A5B13]'
                          }`}
                        >
                          {job.status}
                        </td>
                        <td className="py-2 text-right text-[#5B6861]">
                          {new Date(job.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
