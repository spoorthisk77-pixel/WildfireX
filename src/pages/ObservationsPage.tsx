import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Filter, Flame, Info, MapPin, ShieldAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../services/apiClient';
import type { GeoJsonFeatureCollection, ObservationsAnalyticsResponse } from '../types/api';
import { HOTSPOT_DISTINCTION_NOTE } from '../utils/disclaimer';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

function buildBoundaryPaths(
  geojson: GeoJsonFeatureCollection | null,
  project: (lon: number, lat: number) => [number, number],
): string[] {
  if (!geojson) return [];
  const paths: string[] = [];
  for (const feat of geojson.features) {
    if (!feat.geometry) continue;
    const g = feat.geometry;
    const rings: number[][][] =
      g.type === 'Polygon'
        ? (g.coordinates as number[][][])
        : g.type === 'MultiPolygon'
          ? (g.coordinates as number[][][][]).flat()
          : [];
    for (const ring of rings) {
      if (!ring.length) continue;
      const pts = ring.map(([lon, lat]) => project(lon, lat));
      const d =
        pts.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
      paths.push(d);
    }
  }
  return paths;
}

export function ObservationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ObservationsAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & pagination
  const [datasetId, setDatasetId] = useState<string>('');
  const [year, setYear] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [satellite, setSatellite] = useState<string>('');
  const [confidence, setConfidence] = useState<string>('');
  const [recordType, setRecordType] = useState<string>('');
  const [excludeDuplicates, setExcludeDuplicates] = useState(false);
  const [clipToBoundary, setClipToBoundary] = useState(false);
  const [minLat, setMinLat] = useState<string>('');
  const [maxLat, setMaxLat] = useState<string>('');
  const [minLon, setMinLon] = useState<string>('');
  const [maxLon, setMaxLon] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const [selectedPoint, setSelectedPoint] = useState<ObservationsAnalyticsResponse['map_points'][number] | null>(null);

  const buildFilterParams = (customOffset = offset) => ({
    limit,
    offset: customOffset,
    dataset_id: datasetId ? Number(datasetId) : undefined,
    year: year ? Number(year) : undefined,
    month: month ? Number(month) : undefined,
    satellite: satellite || undefined,
    confidence: confidence || undefined,
    record_type: recordType || undefined,
    exclude_duplicates: excludeDuplicates,
    clip_to_study_area: clipToBoundary,
    min_lat: minLat ? Number(minLat) : undefined,
    max_lat: maxLat ? Number(maxLat) : undefined,
    min_lon: minLon ? Number(minLon) : undefined,
    max_lon: maxLon ? Number(maxLon) : undefined,
  });

  const loadObservations = async (customOffset = offset) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.queryObservations(buildFilterParams(customOffset));
      setData(res);
      if (res.map_points.length > 0 && !selectedPoint) {
        setSelectedPoint(res.map_points[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load historical observations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadObservations(0);
  }, []);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSelectedPoint(null);
    void loadObservations(0);
  };

  const handleResetFilters = () => {
    setDatasetId('');
    setYear('');
    setMonth('');
    setSatellite('');
    setConfidence('');
    setRecordType('');
    setExcludeDuplicates(false);
    setClipToBoundary(false);
    setMinLat('');
    setMaxLat('');
    setMinLon('');
    setMaxLon('');
    setOffset(0);
    setSelectedPoint(null);
    void apiClient.queryObservations({ limit, offset: 0 }).then(setData);
  };

  const mapGraphics = useMemo(() => {
    if (!data || !data.bounds) return null;
    const w = 640;
    const h = 340;
    const pad = 28;
    const spanLon = Math.max(0.01, data.bounds.max_lon - data.bounds.min_lon);
    const spanLat = Math.max(0.01, data.bounds.max_lat - data.bounds.min_lat);

    const project = (lon: number, lat: number): [number, number] => {
      const x = pad + ((lon - data.bounds!.min_lon) / spanLon) * (w - pad * 2);
      const y = h - pad - ((lat - data.bounds!.min_lat) / spanLat) * (h - pad * 2);
      return [x, y];
    };

    const boundaryPaths = buildBoundaryPaths(data.study_area_geojson, project);
    return { w, h, pad, project, boundaryPaths };
  }, [data]);

  if (loading && !data) return <LoadingState message="Loading NASA FIRMS historical wildfire observations..." />;
  if (error) return <ErrorState message={error} onRetry={() => loadObservations(offset)} />;

  if (!data || (data.total === 0 && !datasetId && !year && !month && !satellite && !minLat && !clipToBoundary)) {
    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 text-xs text-[#4B5851] flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-[#9A5B13] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#151B18]">Satellite Hotspots vs. Confirmed Fire Perimeters:</strong>{' '}
            {HOTSPOT_DISTINCTION_NOTE}
          </div>
        </section>
        <EmptyState
          title="No NASA FIRMS or historical fire observation datasets ingested"
          description="Download an authentic MODIS/VIIRS CSV from NASA FIRMS (firms.modaps.eosdis.nasa.gov/download/), upload it in the Dataset Centre, and apply Column Mapping with Interpretation Mode set to Historical Wildfire Observations."
          actionLabel="Import & Map CSV in Dataset Centre"
          onAction={() => navigate('/datasets')}
        />
      </div>
    );
  }

  const exportCsvUrl = apiClient.getObservationsExportUrl('csv', buildFilterParams(0));
  const exportJsonUrl = apiClient.getObservationsExportUrl('json', buildFilterParams(0));
  const hasBoundary = Boolean(data.study_area_geojson && data.study_area_geojson.features.length > 0);

  return (
    <div className="space-y-6">
      {/* Hotspot vs Confirmed Incident Distinction Banner */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-2.5 text-xs text-[#4B5851] max-w-4xl">
          <Info className="h-4 w-4 text-[#1B4332] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#151B18]">Provenance & Scientific Distinction:</strong> {data.hotspot_distinction_note}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={exportCsvUrl}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-[#1B4332]" />
            <span>Export CSV</span>
          </a>
          <a
            href={exportJsonUrl}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-[#1B4332]" />
            <span>Export JSON</span>
          </a>
        </div>
      </section>

      {/* Summary KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-4">
          <div className="text-xs text-[#5B6861]">Matching Detections</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">{data.total}</div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-[#6B7871]">
            {data.unique_count} unique records
          </div>
        </div>
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-4">
          <div className="text-xs text-[#5B6861]">Satellite Hotspots</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#9A5B13]">
            {data.record_type_breakdown.satellite_hotspot}
          </div>
          <div className="mt-1 text-[11px] text-[#6B7871]">MODIS/VIIRS thermal points</div>
        </div>
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-4">
          <div className="text-xs text-[#5B6861]">Confirmed Incidents</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#1E6B45]">
            {data.record_type_breakdown.confirmed_incident}
          </div>
          <div className="mt-1 text-[11px] text-[#6B7871]">Separately supplied field records</div>
        </div>
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-4">
          <div className="text-xs text-[#5B6861]">Duplicates Flagged</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#151B18]">
            {data.duplicate_count}
          </div>
          <div className="mt-1 text-[11px] text-[#6B7871]">Matched (lat, lon, date, sensor)</div>
        </div>
        <div className="rounded-lg border border-[#DCE2DC] bg-white p-4">
          <div className="text-xs text-[#5B6861]">Invalid Rows Skipped</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#B42318]">
            {data.invalid_rows_skipped}
          </div>
          <div className="mt-1 text-[11px] text-[#6B7871]">Out-of-range or NaN coords</div>
        </div>
      </section>

      {/* Geographic & Temporal Filters */}
      <form onSubmit={handleApplyFilters} className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[#E7EBE6] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#151B18]">
            <Filter className="h-3.5 w-3.5 text-[#1B4332]" />
            <span>Temporal & Geographic Observation Filters</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/datasets')}
            className="text-xs font-medium text-[#1B4332] hover:underline"
          >
            Remap CSV Columns in Dataset Centre →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Source Dataset</label>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">All Datasets</option>
              {data.filter_options.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5 font-mono"
            >
              <option value="">All Years</option>
              {data.filter_options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">All Months</option>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                (label, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Satellite</label>
            <select
              value={satellite}
              onChange={(e) => setSatellite(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">All Satellites</option>
              {data.filter_options.satellites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Confidence</label>
            <select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">All</option>
              {data.filter_options.confidences.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Record Type</label>
            <select
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
              className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
            >
              <option value="">All Types</option>
              <option value="satellite_hotspot">Satellite Hotspot</option>
              <option value="confirmed_incident">Confirmed Incident</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs items-end">
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Min Lat</label>
            <input
              type="number"
              step="0.001"
              value={minLat}
              onChange={(e) => setMinLat(e.target.value)}
              placeholder="e.g. 11.80"
              className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Max Lat</label>
            <input
              type="number"
              step="0.001"
              value={maxLat}
              onChange={(e) => setMaxLat(e.target.value)}
              placeholder="e.g. 12.25"
              className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Min Lon</label>
            <input
              type="number"
              step="0.001"
              value={minLon}
              onChange={(e) => setMinLon(e.target.value)}
              placeholder="e.g. 76.00"
              className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#5B6861] mb-1">Max Lon</label>
            <input
              type="number"
              step="0.001"
              value={maxLon}
              onChange={(e) => setMaxLon(e.target.value)}
              placeholder="e.g. 76.50"
              className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-xs text-[#4B5851]">
              <input
                type="checkbox"
                checked={excludeDuplicates}
                onChange={(e) => setExcludeDuplicates(e.target.checked)}
                className="rounded border-[#C6CFC8]"
              />
              <span>Exclude flagged duplicates</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-[#4B5851]">
              <input
                type="checkbox"
                checked={clipToBoundary}
                disabled={!hasBoundary}
                onChange={(e) => setClipToBoundary(e.target.checked)}
                className="rounded border-[#C6CFC8]"
              />
              <span>Inside active boundary {hasBoundary ? '' : '(none)'}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="rounded-md bg-[#1B4332] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#143326]"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-md border border-[#C6CFC8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3]"
          >
            Reset
          </button>
        </div>
      </form>

      {/* Spatial Observation Map + Temporal Year & Month Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-7 rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#151B18] flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#9A5B13]" />
                <span>Spatial Observation Distribution Map ({data.map_points.length} plotted)</span>
              </h2>
              <p className="text-[11px] text-[#5B6861]">
                WGS84 coordinate plot · Amber: satellite hotspot · Green: confirmed incident · Click marker to inspect
              </p>
            </div>
            {data.bounds && (
              <span className="font-mono text-[11px] tabular-nums text-[#5B6861]">
                [{data.bounds.min_lon.toFixed(3)}, {data.bounds.min_lat.toFixed(3)}] to [
                {data.bounds.max_lon.toFixed(3)}, {data.bounds.max_lat.toFixed(3)}]
              </span>
            )}
          </div>

          {mapGraphics ? (
            <div className="rounded border border-[#E7EBE6] bg-[#F5F6F3] p-2">
              <svg viewBox={`0 0 ${mapGraphics.w} ${mapGraphics.h}`} className="w-full h-72">
                {/* Study-area polygon overlay if imported */}
                {mapGraphics.boundaryPaths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="#1B4332"
                    fillOpacity={0.12}
                    stroke="#1B4332"
                    strokeWidth={1.4}
                  />
                ))}
                {/* Observation markers */}
                {data.map_points.map((pt) => {
                  const [x, y] = mapGraphics.project(pt.longitude, pt.latitude);
                  const isSelected = selectedPoint?.id === pt.id;
                  const fill = pt.is_duplicate
                    ? '#8A968F'
                    : pt.record_type === 'confirmed_incident'
                      ? '#1E6B45'
                      : '#B45309';
                  const r = pt.frp ? Math.max(3.5, Math.min(9, 2.5 + Math.sqrt(pt.frp) * 0.5)) : 4;
                  return (
                    <circle
                      key={pt.id}
                      cx={x}
                      cy={y}
                      r={isSelected ? r + 2 : r}
                      fill={fill}
                      fillOpacity={pt.is_duplicate ? 0.5 : 0.82}
                      stroke={isSelected ? '#151B18' : '#FFFFFF'}
                      strokeWidth={isSelected ? 2 : 0.8}
                      className="cursor-pointer"
                      onClick={() => setSelectedPoint(pt)}
                    >
                      <title>{`${pt.observation_date || 'Undated'} · (${pt.latitude.toFixed(4)}, ${pt.longitude.toFixed(4)})`}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          ) : (
            <p className="text-xs text-[#6B7871]">No observation coordinates match current filter.</p>
          )}

          {selectedPoint && (
            <div className="rounded-md bg-[#F5F6F3] p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
              <div>
                <div className="font-sans text-[11px] text-[#6B7871]">Coords (Lat, Lon)</div>
                <div className="text-[#151B18]">
                  {selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[#6B7871]">Date / Type</div>
                <div className="text-[#151B18]">
                  {selectedPoint.observation_date || 'Undated'} · {selectedPoint.record_type}
                </div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[#6B7871]">Sensor / Satellite</div>
                <div className="text-[#151B18]">
                  {selectedPoint.instrument || '—'} ({selectedPoint.satellite || '—'})
                </div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[#6B7871]">FRP / Confidence</div>
                <div className="text-[#151B18]">
                  {selectedPoint.frp !== null ? `${selectedPoint.frp.toFixed(1)} MW` : '—'} ·{' '}
                  {selectedPoint.confidence || '—'}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Temporal Charts: Year-wise & Monthly */}
        <div className="xl:col-span-5 space-y-6">
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-[#151B18] mb-3 flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#9A5B13]" />
              <span>Year-Wise Detection Summary</span>
            </h3>
            {data.yearly_summary.length === 0 ? (
              <p className="text-xs text-[#6B7871]">No dated records available for yearly aggregation.</p>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.yearly_summary} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#4B5851' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#4B5851' }} />
                    <Tooltip />
                    <Bar dataKey="unique_count" name="Unique Hotspots" fill="#1B4332" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="count" name="Total Records" fill="#9A5B13" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-[#151B18] mb-3">
              Monthly Summary Series
            </h3>
            {data.monthly_summary.length === 0 ? (
              <p className="text-xs text-[#6B7871]">No dated records available for monthly aggregation.</p>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly_summary.slice(-18)} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                    <XAxis dataKey="month_label" tick={{ fontSize: 9, fill: '#4B5851' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#4B5851' }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Detections" fill="#B45309" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Dataset Provenance & Limitations */}
      {data.provenance_summary.length > 0 && (
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-[#151B18]">
            Observation Dataset Provenance & Quality Notes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E7EBE6] text-[#5B6861]">
                <tr>
                  <th className="py-2 font-medium">Dataset</th>
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium">Acquisition Period</th>
                  <th className="py-2 font-medium">Citation / License</th>
                  <th className="py-2 font-medium text-right">Duplicates / Invalid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2EF]">
                {data.provenance_summary.map((p) => (
                  <tr key={p.dataset_id}>
                    <td className="py-2 font-medium text-[#151B18]">{p.name}</td>
                    <td className="py-2 font-mono">{p.data_source}</td>
                    <td className="py-2 font-mono">{p.acquisition_date || 'Not specified'}</td>
                    <td className="py-2 text-[#4B5851]">{p.license_or_citation || '—'}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {p.duplicate_rows_detected} dup · {p.invalid_rows_skipped} inv
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Paginated Observation Listing */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
        <div className="border-b border-[#DCE2DC] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-[#151B18]">
            Observation Records (Showing {data.items.length} of {data.total})
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => {
                const next = Math.max(0, offset - limit);
                setOffset(next);
                void loadObservations(next);
              }}
              className="rounded border border-[#C6CFC8] bg-white px-2.5 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums text-[#5B6861]">
              Offset {offset}
            </span>
            <button
              type="button"
              disabled={offset + limit >= data.total}
              onClick={() => {
                const next = offset + limit;
                setOffset(next);
                void loadObservations(next);
              }}
              className="rounded border border-[#C6CFC8] bg-white px-2.5 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F3] border-b border-[#DCE2DC] text-[#4B5851]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date / Time</th>
                <th className="px-4 py-2.5 font-medium">Classification</th>
                <th className="px-4 py-2.5 font-medium text-right">Latitude</th>
                <th className="px-4 py-2.5 font-medium text-right">Longitude</th>
                <th className="px-4 py-2.5 font-medium text-right">FRP (MW)</th>
                <th className="px-4 py-2.5 font-medium text-right">Brightness</th>
                <th className="px-4 py-2.5 font-medium">Confidence</th>
                <th className="px-4 py-2.5 font-medium">Satellite / Sensor</th>
                <th className="px-4 py-2.5 font-medium">Duplicate Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
              {data.items.map((obs) => (
                <tr key={obs.id} className="hover:bg-[#FAFBF9]">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {obs.observation_date || '—'} {obs.observation_time || ''}
                  </td>
                  <td className="px-4 py-2 font-sans">
                    <span
                      className={`font-medium ${
                        obs.record_type === 'confirmed_incident' ? 'text-[#1E6B45]' : 'text-[#9A5B13]'
                      }`}
                    >
                      {obs.record_type === 'confirmed_incident' ? 'Confirmed Incident' : 'Satellite Hotspot'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{obs.latitude.toFixed(4)}</td>
                  <td className="px-4 py-2 text-right">{obs.longitude.toFixed(4)}</td>
                  <td className="px-4 py-2 text-right">{obs.frp !== null ? obs.frp.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2 text-right">{obs.brightness !== null ? obs.brightness.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2 font-sans">{obs.confidence || '—'}</td>
                  <td className="px-4 py-2 font-sans">
                    {[obs.satellite, obs.instrument].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="px-4 py-2 font-sans">
                    {obs.is_duplicate ? (
                      <span className="text-[#9A5B13] font-medium">Duplicate</span>
                    ) : (
                      <span className="text-[#5B6861]">Unique</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
