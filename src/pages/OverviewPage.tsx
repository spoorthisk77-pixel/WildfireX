import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database, FileCheck2, Flame, Grid3X3, Layers, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { DashboardStats } from '../types/api';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

function formatStatusLabel(status: string): { label: string; toneClass: string } {
  switch (status) {
    case 'verified_boundary':
      return { label: 'Verified Boundary', toneClass: 'text-[#1E6B45]' };
    case 'boundary_imported_unverified':
      return { label: 'Boundary Imported (Unverified)', toneClass: 'text-[#9A5B13]' };
    case 'awaiting_boundary_verification':
    default:
      return { label: 'Awaiting Boundary Verification', toneClass: 'text-[#9A5B13]' };
  }
}

export function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading) {
    return <LoadingState message="Querying study region status and dataset metrics..." />;
  }

  if (error || !stats) {
    return (
      <ErrorState
        title="Backend telemetry unavailable"
        message={error || 'Unable to reach the WildfireX FastAPI service.'}
        onRetry={loadStats}
      />
    );
  }

  const areaStatus = formatStatusLabel(stats.study_area_status);

  return (
    <div className="space-y-8">
      {/* Study Region Hero Summary */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5B6861]">
              <span>Active Study Region</span>
              <span aria-hidden="true">·</span>
              <span className={`font-medium ${areaStatus.toneClass}`}>{areaStatus.label}</span>
              {stats.study_area_sq_km !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{stats.study_area_sq_km.toFixed(2)} km²</span>
                </>
              )}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#151B18] text-balance">
              {stats.study_region}
            </h2>
            <p className="text-sm leading-relaxed text-[#4B5851]">
              WildfireX geospatial workspace for ingesting real satellite land-cover rasters, historical active-fire
              observations, and verified protected-area boundaries to construct structured cellular and graph datasets.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/geospatial')}
              className="inline-flex items-center gap-2 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] transition-colors whitespace-nowrap shrink-0"
            >
              <Layers className="h-3.5 w-3.5 text-[#1B4332]" />
              <span>Geospatial Laboratory</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/datasets')}
              className="inline-flex items-center gap-2 rounded-md bg-[#1B4332] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Open Dataset Centre</span>
            </button>
          </div>
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section aria-label="Operational Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Imported Datasets</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">
            {stats.dataset_count}
          </div>
          <div className="mt-1.5 text-xs text-[#6B7871]">
            {stats.dataset_count === 0 ? 'Awaiting dataset upload' : 'Registered in SQLite provenance store'}
          </div>
        </div>

        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Processed Geographical Cells</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">
            {stats.processed_cell_count.toLocaleString()}
          </div>
          <div className="mt-1.5 text-xs text-[#6B7871] font-mono tabular-nums">
            {stats.processed_grid_count} structured grid{stats.processed_grid_count === 1 ? '' : 's'} ·{' '}
            {stats.valid_cell_count.toLocaleString()} valid
          </div>
        </div>

        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Historical Wildfire Observations</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">
            {stats.historical_observation_count.toLocaleString()}
          </div>
          <div className="mt-1.5 text-xs text-[#6B7871]">
            {stats.historical_observation_count === 0
              ? 'No MODIS/VIIRS records imported'
              : 'Ingested from mapped FIRMS datasets'}
          </div>
        </div>

        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Data Quality Status</div>
          <div className="mt-2 text-base font-semibold text-[#151B18]">{stats.data_quality_status}</div>
          <div className="mt-1.5 text-xs text-[#6B7871]">CRS & NoData validation pipeline</div>
        </div>

        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Last Processing Activity</div>
          <div className="mt-2 text-base font-semibold text-[#151B18]">
            {stats.last_processing_activity
              ? `${stats.last_processing_activity.job_type.replace('_', ' ')} (${stats.last_processing_activity.status})`
              : 'No jobs executed yet'}
          </div>
          <div className="mt-1.5 text-xs text-[#6B7871] font-mono tabular-nums">
            {stats.last_processing_activity
              ? new Date(stats.last_processing_activity.created_at).toLocaleString()
              : 'Ready for first ingestion'}
          </div>
        </div>

        <div className="rounded-lg border border-[#DCE2DC] bg-white p-5">
          <div className="text-xs font-medium text-[#5B6861]">Registered Experiments</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">
            {stats.experiment_count}
          </div>
          <div className="mt-1.5 text-xs text-[#6B7871]">Saved across mathematical lab modules</div>
        </div>
      </section>

      {/* Empty Dataset Onboarding Banner when 0 datasets */}
      {stats.dataset_count === 0 && (
        <EmptyState
          title="No geospatial datasets have been imported yet"
          description="WildfireX does not populate synthetic metrics. Begin by uploading a real ESA WorldCover GeoTIFF, NASA FIRMS CSV, Copernicus Sentinel-2 raster, SRTM elevation tile, or Nagarhole boundary GeoJSON/Shapefile in the Dataset Centre."
          actionLabel="Import First Dataset"
          onAction={() => navigate('/datasets')}
        />
      )}

      {/* Real Data Source Availability Matrix */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white">
        <div className="border-b border-[#DCE2DC] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-[#151B18]">
              Priority Environmental Data Sources
            </h3>
            <p className="text-xs text-[#5B6861]">
              Authentic availability status for Nagarhole National Park research inputs
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/datasets')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Manage Datasets</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="divide-y divide-[#E7EBE6]">
          {stats.source_availability.map((src) => {
            const isImported = src.status === 'imported';
            return (
              <div key={src.source_key} className="px-6 py-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-[#151B18]">{src.label}</span>
                    <span className="text-[#B4BEB7]" aria-hidden="true">·</span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        isImported ? 'text-[#1E6B45]' : 'text-[#6B7871]'
                      }`}
                    >
                      {isImported ? <FileCheck2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                      <span>
                        {isImported
                          ? `Imported (${src.dataset_count} dataset${src.dataset_count === 1 ? '' : 's'})`
                          : 'Unavailable (Not Imported)'}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-[#4B5851]">{src.description}</p>
                  <p className="text-xs text-[#6B7871]">{src.how_to_obtain}</p>
                </div>
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate('/datasets')}
                    className="rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] transition-colors whitespace-nowrap"
                  >
                    {isImported ? 'View / Add More' : 'Import Source'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two-Column Activity & Quick Module Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <section className="rounded-lg border border-[#DCE2DC] bg-white flex flex-col">
          <div className="border-b border-[#DCE2DC] px-6 py-4">
            <h3 className="font-display text-base font-semibold text-[#151B18]">Recent Processing Activity</h3>
          </div>
          <div className="p-6 flex-1">
            {stats.recent_activities.length === 0 ? (
              <p className="text-sm text-[#6B7871]">
                No processing jobs recorded yet. Upload a dataset or run a geospatial operation to inspect pipeline logs.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                      <th className="pb-2 font-medium">Job</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2EF]">
                    {stats.recent_activities.map((job) => (
                      <tr key={job.id}>
                        <td className="py-2.5 font-medium text-[#151B18]">{job.job_type}</td>
                        <td
                          className={`py-2.5 font-medium ${
                            job.status === 'completed'
                              ? 'text-[#1E6B45]'
                              : job.status === 'failed'
                                ? 'text-[#B42318]'
                                : 'text-[#9A5B13]'
                          }`}
                        >
                          {job.status}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-[#5B6861]">
                          {new Date(job.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[#DCE2DC] bg-white flex flex-col">
          <div className="border-b border-[#DCE2DC] px-6 py-4">
            <h3 className="font-display text-base font-semibold text-[#151B18]">
              System Status & Quick Navigation
            </h3>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-between gap-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-[#6B7871]">FastAPI Service</dt>
                <dd className="mt-1 font-medium text-[#1E6B45] inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{stats.system_status.api_online ? 'Operational' : 'Offline'}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7871]">Database Engine</dt>
                <dd className="mt-1 font-mono text-[#151B18]">{stats.system_status.database_engine}</dd>
              </div>
              <div>
                <dt className="text-[#6B7871]">Geospatial Stack</dt>
                <dd className="mt-1 font-mono text-[#151B18]">{stats.system_status.geospatial_engine}</dd>
              </div>
              <div>
                <dt className="text-[#6B7871]">Target Metric CRS</dt>
                <dd className="mt-1 font-mono text-[#151B18]">{stats.system_status.target_metric_crs}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E7EBE6]">
              <button
                type="button"
                onClick={() => navigate('/forest-explorer')}
                className="flex items-center justify-between rounded-md border border-[#DCE2DC] px-3.5 py-2.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Grid3X3 className="h-3.5 w-3.5 text-[#1B4332]" />
                  <span>Forest Explorer</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[#6B7871]" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/observations')}
                className="flex items-center justify-between rounded-md border border-[#DCE2DC] px-3.5 py-2.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-[#9A5B13]" />
                  <span>Observations</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[#6B7871]" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
