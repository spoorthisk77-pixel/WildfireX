import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Grid3X3,
  Layers,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type {
  Dataset,
  GeoJsonFeatureCollection,
  GeometryAuditResult,
  ProcessedGrid,
  ProcessingJob,
  ProcessingLog,
  StudyAreaDetail,
} from '../types/api';
import { ErrorState, LoadingState } from '../components/StateViews';

function renderBoundarySvgPath(geojson: GeoJsonFeatureCollection | null, bounds: Record<string, number> | null) {
  if (!geojson || !bounds || geojson.features.length === 0) return null;
  const { minx, miny, maxx, maxy } = bounds;
  const spanX = Math.max(1e-6, maxx - minx);
  const spanY = Math.max(1e-6, maxy - miny);
  const w = 360;
  const h = 200;
  const pad = 16;

  const project = (lon: number, lat: number): [number, number] => {
    const x = pad + ((lon - minx) / spanX) * (w - pad * 2);
    const y = h - pad - ((lat - miny) / spanY) * (h - pad * 2);
    return [x, y];
  };

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
      const d = pts.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
      paths.push(d);
    }
  }
  return { w, h, paths };
}

export function GeospatialLabPage() {
  const navigate = useNavigate();
  const [studyAreaDetail, setStudyAreaDetail] = useState<StudyAreaDetail | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Boundary Upload Form
  const [boundaryFile, setBoundaryFile] = useState<File | null>(null);
  const [boundaryName, setBoundaryName] = useState('Nagarhole National Park Boundary');
  const [markVerified, setMarkVerified] = useState(false);
  const [boundaryMsg, setBoundaryMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [boundaryBusy, setBoundaryBusy] = useState(false);

  // Geospatial Transform Tools
  const [opDatasetId, setOpDatasetId] = useState<string>('');
  const [targetCrs, setTargetCrs] = useState('EPSG:32643');
  const [opBusy, setOpBusy] = useState(false);
  const [opMsg, setOpMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [auditResult, setAuditResult] = useState<GeometryAuditResult | null>(null);

  // Structured Grid Generator Form
  const [gridName, setGridName] = useState('Nagarhole Cellular Grid');
  const [gridSourceId, setGridSourceId] = useState<string>('');
  const [gridElevId, setGridElevId] = useState<string>('');
  const [gridResMeters, setGridResMeters] = useState('250');
  const [gridMaxDim, setGridMaxDim] = useState('48');
  const [gridConnectivity, setGridConnectivity] = useState('4');
  const [clipToBoundary, setClipToBoundary] = useState(true);
  const [gridBusy, setGridBusy] = useState(false);
  const [gridMsg, setGridMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [areaRes, dsRes, gridRes, jobsRes, logsRes] = await Promise.all([
        apiClient.getActiveStudyArea(),
        apiClient.listDatasets(),
        apiClient.listGrids(),
        apiClient.listJobs(20),
        apiClient.listLogs(25),
      ]);
      setStudyAreaDetail(areaRes);
      setDatasets(dsRes.items);
      setGrids(gridRes);
      setJobs(jobsRes);
      setLogs(logsRes);
      if (dsRes.items.length > 0) {
        if (!opDatasetId) setOpDatasetId(String(dsRes.items[0].id));
        if (!gridSourceId) setGridSourceId(String(dsRes.items[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Geospatial Laboratory data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const boundarySvg = useMemo(
    () =>
      renderBoundarySvgPath(
        studyAreaDetail?.geojson || null,
        studyAreaDetail?.study_area.bounds_json || null,
      ),
    [studyAreaDetail],
  );

  const handleBoundaryUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boundaryFile) {
      setBoundaryMsg({ type: 'error', text: 'Select a GeoJSON or Shapefile ZIP boundary file.' });
      return;
    }
    setBoundaryBusy(true);
    setBoundaryMsg(null);
    const fd = new FormData();
    fd.append('file', boundaryFile);
    fd.append('name', boundaryName.trim() || 'Nagarhole National Park Boundary');
    fd.append('region_label', 'Nagarhole National Park, Karnataka, India');
    fd.append('mark_verified', String(markVerified));
    try {
      const updated = await apiClient.uploadStudyBoundary(fd);
      setStudyAreaDetail(updated);
      setBoundaryFile(null);
      setBoundaryMsg({
        type: 'success',
        text: `Boundary imported (${updated.study_area.area_sq_km?.toFixed(2) ?? '—'} km², ${updated.study_area.vertex_count ?? 0} vertices).`,
      });
      await loadAll();
    } catch (err) {
      setBoundaryMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Boundary import failed.',
      });
    } finally {
      setBoundaryBusy(false);
    }
  };

  const handleReproject = async () => {
    if (!opDatasetId) return;
    setOpBusy(true);
    setOpMsg(null);
    try {
      const derived = await apiClient.reprojectDataset(Number(opDatasetId), targetCrs);
      setOpMsg({
        type: 'success',
        text: `Created reprojected dataset "${derived.name}" in ${targetCrs}.`,
      });
      await loadAll();
    } catch (err) {
      setOpMsg({ type: 'error', text: err instanceof Error ? err.message : 'CRS reprojection failed.' });
    } finally {
      setOpBusy(false);
    }
  };

  const handleClip = async () => {
    if (!opDatasetId) return;
    setOpBusy(true);
    setOpMsg(null);
    try {
      const derived = await apiClient.clipDataset(Number(opDatasetId), studyAreaDetail?.study_area.id);
      setOpMsg({
        type: 'success',
        text: `Clipped layer saved as "${derived.name}".`,
      });
      await loadAll();
    } catch (err) {
      setOpMsg({ type: 'error', text: err instanceof Error ? err.message : 'Boundary clipping failed.' });
    } finally {
      setOpBusy(false);
    }
  };

  const handleAudit = async () => {
    if (!opDatasetId) return;
    setOpBusy(true);
    setOpMsg(null);
    setAuditResult(null);
    try {
      const res = await apiClient.auditGeometry(Number(opDatasetId));
      setAuditResult(res);
      setOpMsg({
        type: 'success',
        text: `Geometry audit complete: ${res.valid_geometry_count}/${res.feature_count} valid features.`,
      });
    } catch (err) {
      setOpMsg({ type: 'error', text: err instanceof Error ? err.message : 'Geometry audit failed.' });
    } finally {
      setOpBusy(false);
    }
  };

  const handleGenerateGrid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gridSourceId) {
      setGridMsg({ type: 'error', text: 'Select a source dataset first.' });
      return;
    }
    setGridBusy(true);
    setGridMsg(null);
    try {
      const created = await apiClient.generateGrid({
        name: gridName.trim() || 'Nagarhole Cellular Grid',
        source_dataset_id: Number(gridSourceId),
        elevation_dataset_id: gridElevId ? Number(gridElevId) : null,
        study_area_id: studyAreaDetail?.study_area.id ?? null,
        clip_to_boundary: clipToBoundary && Boolean(studyAreaDetail?.study_area.has_boundary_geometry),
        target_resolution_meters: Number(gridResMeters) || 250,
        max_dimension: Number(gridMaxDim) || 48,
        connectivity: Number(gridConnectivity) || 4,
      });
      setGridMsg({
        type: 'success',
        text: `Generated ${created.rows}×${created.cols} grid "${created.name}" (${created.valid_cell_count} valid cells, ${created.metadata_json?.graph_edges ?? 0} graph edges).`,
      });
      await loadAll();
    } catch (err) {
      setGridMsg({ type: 'error', text: err instanceof Error ? err.message : 'Grid generation failed.' });
    } finally {
      setGridBusy(false);
    }
  };

  if (loading) return <LoadingState message="Loading Geospatial Laboratory..." />;
  if (error || !studyAreaDetail) {
    return <ErrorState message={error || 'Unable to load study area.'} onRetry={loadAll} />;
  }

  const area = studyAreaDetail.study_area;
  const hasBoundary = Boolean(area.has_boundary_geometry);
  const geotiffDatasets = datasets.filter((d) => d.file_format === 'geotiff');

  return (
    <div className="space-y-8">
      {/* 1. Study Area Boundary Upload & Verification */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#5B6861]">
              <Compass className="h-4 w-4 text-[#1B4332]" />
              <span>Study-Area Boundary Management</span>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  area.verification_status === 'verified_boundary' ? 'text-[#1E6B45]' : 'text-[#9A5B13]'
                }`}
              >
                {area.verification_status === 'verified_boundary' ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                <span>
                  {area.verification_status === 'verified_boundary'
                    ? 'Verified Boundary'
                    : area.verification_status === 'boundary_imported_unverified'
                      ? 'Boundary Imported (Unverified)'
                      : 'Awaiting Boundary Verification'}
                </span>
              </span>
            </div>

            <h2 className="font-display text-lg font-semibold text-[#151B18]">{area.region_label}</h2>
            <p className="text-xs leading-relaxed text-[#4B5851] max-w-2xl">
              WildfireX never fabricates protected-area polygons. Upload an official GeoJSON or Shapefile ZIP boundary
              for Nagarhole National Park to enable boundary clipping during raster/vector processing.
            </p>

            {hasBoundary && (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-md bg-[#F5F6F3] p-3.5 text-xs">
                <div>
                  <dt className="text-[#6B7871]">Boundary Area</dt>
                  <dd className="mt-0.5 font-mono tabular-nums font-semibold text-[#151B18]">
                    {area.area_sq_km?.toFixed(2) ?? '—'} km²
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Source CRS</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-[#151B18]">{area.crs || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Vertices</dt>
                  <dd className="mt-0.5 font-mono tabular-nums font-semibold text-[#151B18]">
                    {area.vertex_count ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">WGS84 Bounds</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[11px] text-[#151B18]">
                    {area.bounds_json
                      ? `${area.bounds_json.minx.toFixed(3)}, ${area.bounds_json.miny.toFixed(3)}`
                      : '—'}
                  </dd>
                </div>
              </dl>
            )}

            <form onSubmit={handleBoundaryUpload} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-[#2A332E] mb-1">
                  Boundary File (GeoJSON / Shapefile ZIP)
                </label>
                <input
                  type="file"
                  accept=".geojson,.json,.zip"
                  onChange={(e) => setBoundaryFile(e.target.files?.[0] || null)}
                  className="block w-full rounded-md border border-[#C6CFC8] bg-[#FAFBF9] px-2.5 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1B4332] file:px-2 file:py-1 file:text-xs file:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2A332E] mb-1">Boundary Name</label>
                <input
                  type="text"
                  value={boundaryName}
                  onChange={(e) => setBoundaryName(e.target.value)}
                  className="w-full rounded-md border border-[#C6CFC8] bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-[#4B5851]">
                  <input
                    type="checkbox"
                    checked={markVerified}
                    onChange={(e) => setMarkVerified(e.target.checked)}
                    className="rounded border-[#C6CFC8]"
                  />
                  <span>Mark as verified official boundary</span>
                </label>
                <button
                  type="submit"
                  disabled={boundaryBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1B4332] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{boundaryBusy ? 'Importing...' : 'Upload Boundary'}</span>
                </button>
              </div>
            </form>
            {boundaryMsg && (
              <div
                className={`text-xs font-medium flex items-center gap-1.5 ${
                  boundaryMsg.type === 'success' ? 'text-[#1E6B45]' : 'text-[#B42318]'
                }`}
              >
                {boundaryMsg.type === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                <span>{boundaryMsg.text}</span>
              </div>
            )}
          </div>

          {/* Boundary Polygon Footprint Preview */}
          <div className="w-full lg:w-[360px] shrink-0 rounded-md border border-[#DCE2DC] bg-[#F5F6F3] p-3 flex flex-col items-center justify-center min-h-[210px]">
            {boundarySvg ? (
              <>
                <svg viewBox={`0 0 ${boundarySvg.w} ${boundarySvg.h}`} className="w-full h-44">
                  {boundarySvg.paths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill="#1B4332"
                      fillOpacity={0.18}
                      stroke="#1B4332"
                      strokeWidth={1.75}
                    />
                  ))}
                </svg>
                <div className="text-[11px] font-mono text-[#5B6861] mt-1">
                  Imported Polygon Footprint (WGS84)
                </div>
              </>
            ) : (
              <div className="text-center px-4 py-8">
                <p className="text-xs font-medium text-[#2A332E]">No boundary geometry uploaded</p>
                <p className="mt-1 text-[11px] text-[#6B7871]">
                  Upload a GeoJSON or Shapefile ZIP on the left to visualize and clip against the Nagarhole perimeter.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Two-Column Pipeline: CRS/Clip/Audit + Structured Grid Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Geospatial Operations */}
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-5">
          <div className="border-b border-[#E7EBE6] pb-3">
            <h3 className="font-display text-base font-semibold text-[#151B18] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#1B4332]" />
              <span>CRS Transformation, Clipping & Geometry Audit</span>
            </h3>
            <p className="mt-1 text-xs text-[#5B6861]">
              Transform coordinate reference systems, clip layers to the active boundary, and inspect invalid vector geometries.
            </p>
          </div>

          {datasets.length === 0 ? (
            <p className="text-xs text-[#6B7871]">
              Import at least one dataset in the Dataset Centre to run geospatial transformations.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2A332E] mb-1">Source Dataset</label>
                <select
                  value={opDatasetId}
                  onChange={(e) => setOpDatasetId(e.target.value)}
                  className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} · {d.name} ({d.file_format} · {d.metadata_record?.crs || 'No CRS'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A332E] mb-1">Target CRS</label>
                  <select
                    value={targetCrs}
                    onChange={(e) => setTargetCrs(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs font-mono"
                  >
                    <option value="EPSG:32643">EPSG:32643 (WGS 84 / UTM 43N)</option>
                    <option value="EPSG:4326">EPSG:4326 (WGS 84 Geographic)</option>
                    <option value="EPSG:3857">EPSG:3857 (Web Mercator)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={opBusy}
                    onClick={handleReproject}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] disabled:opacity-50"
                  >
                    Reproject Layer
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={opBusy || !hasBoundary}
                  onClick={handleClip}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] disabled:opacity-50"
                >
                  <Scissors className="h-3.5 w-3.5 text-[#1B4332]" />
                  <span>Clip to Active Boundary</span>
                </button>
                <button
                  type="button"
                  disabled={opBusy}
                  onClick={handleAudit}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-[#1B4332]" />
                  <span>Audit Vector Geometries</span>
                </button>
              </div>

              {opMsg && (
                <div
                  className={`text-xs font-medium ${
                    opMsg.type === 'success' ? 'text-[#1E6B45]' : 'text-[#B42318]'
                  }`}
                >
                  {opMsg.text}
                </div>
              )}

              {auditResult && (
                <div className="rounded-md bg-[#F5F6F3] p-3.5 text-xs space-y-1 font-mono tabular-nums">
                  <div>Dataset #{auditResult.dataset_id} · CRS: {auditResult.crs || 'Undefined'}</div>
                  <div>
                    Valid: {auditResult.valid_geometry_count} / {auditResult.feature_count} · Invalid:{' '}
                    {auditResult.invalid_geometry_count}
                  </div>
                  <div>Types: {auditResult.geometry_types.join(', ') || '—'}</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Structured Cellular Grid Generation */}
        <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-5">
          <div className="border-b border-[#E7EBE6] pb-3">
            <h3 className="font-display text-base font-semibold text-[#151B18] flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-[#1B4332]" />
              <span>Structured Cellular Grid Generator</span>
            </h3>
            <p className="mt-1 text-xs text-[#5B6861]">
              Convert a GeoTIFF raster, vector layer, or mapped CSV into an indexed cellular lattice with NetworkX neighbor topology.
            </p>
          </div>

          {datasets.length === 0 ? (
            <p className="text-xs text-[#6B7871]">
              Import a land-cover GeoTIFF, GeoJSON, or mapped CSV dataset first to generate a structured grid.
            </p>
          ) : (
            <form onSubmit={handleGenerateGrid} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Grid Name *</label>
                  <input
                    type="text"
                    value={gridName}
                    onChange={(e) => setGridName(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Primary Land-Cover / Spatial Source *</label>
                  <select
                    value={gridSourceId}
                    onChange={(e) => setGridSourceId(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        #{d.id} · {d.name} ({d.file_format})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Optional Elevation Raster (SRTM)</label>
                  <select
                    value={gridElevId}
                    onChange={(e) => setGridElevId(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
                  >
                    <option value="">None</option>
                    {geotiffDatasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        #{d.id} · {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Target Cell Resolution (meters)</label>
                  <input
                    type="number"
                    min={10}
                    max={10000}
                    value={gridResMeters}
                    onChange={(e) => setGridResMeters(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Max Grid Axis Cells (4–120)</label>
                  <input
                    type="number"
                    min={4}
                    max={120}
                    value={gridMaxDim}
                    onChange={(e) => setGridMaxDim(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#2A332E] mb-1">Neighborhood Connectivity</label>
                  <select
                    value={gridConnectivity}
                    onChange={(e) => setGridConnectivity(e.target.value)}
                    className="w-full rounded-md border border-[#C6CFC8] bg-white px-3 py-2"
                  >
                    <option value="4">4-Neighbor (von Neumann)</option>
                    <option value="8">8-Neighbor (Moore)</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[#4B5851]">
                <input
                  type="checkbox"
                  checked={clipToBoundary}
                  disabled={!hasBoundary}
                  onChange={(e) => setClipToBoundary(e.target.checked)}
                  className="rounded border-[#C6CFC8]"
                />
                <span>
                  Clip to active study-area boundary {hasBoundary ? '(Ready)' : '(Upload boundary above to enable)'}
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  disabled={gridBusy}
                  className="rounded-md bg-[#1B4332] px-4 py-2 font-medium text-white hover:bg-[#143326] disabled:opacity-50"
                >
                  {gridBusy ? 'Building Grid & Graph...' : 'Generate Structured Grid'}
                </button>
                {grids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/forest-explorer')}
                    className="text-xs font-medium text-[#1B4332] hover:underline"
                  >
                    Inspect Grids in Forest Explorer →
                  </button>
                )}
              </div>

              {gridMsg && (
                <div
                  className={`font-medium ${
                    gridMsg.type === 'success' ? 'text-[#1E6B45]' : 'text-[#B42318]'
                  }`}
                >
                  {gridMsg.text}
                </div>
              )}
            </form>
          )}
        </section>
      </div>

      {/* 3. Processed Grids & Pipeline Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
          <div className="border-b border-[#DCE2DC] px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-[#151B18]">
              Generated Cellular Grids ({grids.length})
            </h3>
          </div>
          <div className="p-5">
            {grids.length === 0 ? (
              <p className="text-xs text-[#6B7871]">No grids generated yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium text-right">Shape</th>
                      <th className="pb-2 font-medium text-right">Valid Cells</th>
                      <th className="pb-2 font-medium text-right">Res (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2EF] font-mono tabular-nums">
                    {grids.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2 font-sans font-medium text-[#151B18]">{g.name}</td>
                        <td className="py-2 text-right">
                          {g.rows}×{g.cols}
                        </td>
                        <td className="py-2 text-right">{g.valid_cell_count}</td>
                        <td className="py-2 text-right">{g.resolution_meters.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
          <div className="border-b border-[#DCE2DC] px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-[#151B18]">
              Processing Audit Log ({logs.length})
            </h3>
          </div>
          <div className="p-5 max-h-72 overflow-y-auto space-y-2.5 text-xs">
            {logs.length === 0 && jobs.length === 0 ? (
              <p className="text-[#6B7871]">No geospatial processing logs recorded yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="border-b border-[#F0F2EF] pb-2 last:border-0">
                  <div className="flex items-center justify-between text-[11px] text-[#6B7871] font-mono">
                    <span>
                      {log.level} · {log.stage}
                    </span>
                    <span className="tabular-nums">{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-0.5 text-[#151B18]">{log.message}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
