import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRightLeft, Compass, Flame, Grid3X3, Info, Layers, Search } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type {
  CoordinateConvertResponse,
  Dataset,
  GridCell,
  GridCellsPage,
  GridNeighborhoodResponse,
  ObservationsAnalyticsResponse,
  ProcessedGrid,
  StudyArea,
} from '../types/api';
import { getLandcoverVisual } from '../utils/landcoverPalette';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

export function ForestExplorerPage() {
  const navigate = useNavigate();
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [studyArea, setStudyArea] = useState<StudyArea | null>(null);
  const [obsData, setObsData] = useState<ObservationsAnalyticsResponse | null>(null);

  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [cellsPage, setCellsPage] = useState<GridCellsPage | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [landcoverFilter, setLandcoverFilter] = useState<string>('');
  const [showNoData, setShowNoData] = useState(true);
  const [showElevationShading, setShowElevationShading] = useState(false);
  const [showObservationOverlay, setShowObservationOverlay] = useState(true);
  const [cellSearch, setCellSearch] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Neighborhood & Boundary condition inspector
  const [stencil, setStencil] = useState<'moore_8' | 'von_neumann_4'>('moore_8');
  const [boundary, setBoundary] = useState<'absorbing' | 'reflective' | 'periodic'>('absorbing');
  const [nbInspect, setNbInspect] = useState<GridNeighborhoodResponse | null>(null);

  // Coordinate converter
  const [coordMode, setCoordMode] = useState<'grid_to_geo' | 'geo_to_grid'>('grid_to_geo');
  const [convRow, setConvRow] = useState('0');
  const [convCol, setConvCol] = useState('0');
  const [convLon, setConvLon] = useState('76.12');
  const [convLat, setConvLat] = useState('12.02');
  const [convResult, setConvResult] = useState<CoordinateConvertResponse | null>(null);

  const loadGrids = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, dsRes, studyRes, obsRes] = await Promise.all([
        apiClient.listGrids(),
        apiClient.listDatasets(),
        apiClient.getActiveStudyArea().catch(() => null),
        apiClient.queryObservations({ limit: 500, exclude_duplicates: true }).catch(() => null),
      ]);
      setGrids(list);
      setDatasets(dsRes.items);
      setStudyArea(studyRes?.study_area ?? null);
      setObsData(obsRes);
      if (list.length > 0) {
        const target = list[0].id;
        setSelectedGridId(target);
        const page = await apiClient.getGridCells(target, { limit: 16000 });
        setCellsPage(page);
        const first = page.cells.find((c) => c.quality_status === 'valid') || page.cells[0] || null;
        setSelectedCell(first);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load structured grids.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGrids();
  }, []);

  useEffect(() => {
    if (!selectedGridId || !selectedCell) {
      setNbInspect(null);
      return;
    }
    setConvRow(String(selectedCell.row_idx));
    setConvCol(String(selectedCell.col_idx));
    setConvLon(selectedCell.center_lon.toFixed(6));
    setConvLat(selectedCell.center_lat.toFixed(6));
    apiClient
      .inspectGridNeighborhood({
        grid_id: selectedGridId,
        cell_uid: selectedCell.cell_uid,
        neighborhood: stencil,
        boundary_condition: boundary,
      })
      .then(setNbInspect)
      .catch(() => setNbInspect(null));
  }, [selectedGridId, selectedCell, stencil, boundary]);

  const handleSelectGrid = async (gridId: number) => {
    setSelectedGridId(gridId);
    setLandcoverFilter('');
    setSearchError(null);
    setLoading(true);
    try {
      const page = await apiClient.getGridCells(gridId, { limit: 16000 });
      setCellsPage(page);
      setSelectedCell(page.cells.find((c) => c.quality_status === 'valid') || page.cells[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grid cells.');
    } finally {
      setLoading(false);
    }
  };

  const handleCellSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cellsPage) return;
    const q = cellSearch.trim().toLowerCase();
    setSearchError(null);
    if (!q) return;

    const coordMatch = q.match(/^(\d+)\s*,\s*(\d+)$/);
    let found: GridCell | undefined;
    if (coordMatch) {
      const r = Number(coordMatch[1]);
      const c = Number(coordMatch[2]);
      found = cellsPage.cells.find((cell) => cell.row_idx === r && cell.col_idx === c);
    } else {
      found = cellsPage.cells.find((cell) => cell.cell_uid.toLowerCase() === q || cell.cell_uid.toLowerCase().includes(q));
    }

    if (found) {
      setSelectedCell(found);
    } else {
      setSearchError(`No cell matched "${cellSearch}". Enter a Cell UID or "row,col".`);
    }
  };

  const handleConvertCoords = async () => {
    if (!selectedGridId) return;
    try {
      const res = await apiClient.convertGridCoordinates({
        grid_id: selectedGridId,
        mode: coordMode,
        row_idx: Number(convRow),
        col_idx: Number(convCol),
        longitude: Number(convLon),
        latitude: Number(convLat),
      });
      setConvResult(res);
      if (res.cell_uid && cellsPage) {
        const match = cellsPage.cells.find((c) => c.cell_uid === res.cell_uid);
        if (match) setSelectedCell(match);
      }
    } catch {
      setConvResult(null);
    }
  };

  const breakdownData = useMemo(() => {
    if (!cellsPage) return [];
    return Object.entries(cellsPage.landcover_breakdown).map(([category, count]) => ({
      category,
      count,
      color: getLandcoverVisual(category).hex,
    }));
  }, [cellsPage]);

  const highlightedNeighborUids = useMemo(
    () => new Set(nbInspect?.neighbor_details.map((n) => n.cell_uid) ?? []),
    [nbInspect],
  );

  // Elevation min/max for authentic DEM shading (only if elevation_m exists)
  const elevationStats = useMemo(() => {
    if (!cellsPage) return { hasElevation: false, min: 0, max: 1 };
    const vals = cellsPage.cells.map((c) => c.elevation_m).filter((v): v is number => v !== null);
    if (vals.length === 0) return { hasElevation: false, min: 0, max: 1 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { hasElevation: true, min, max: max > min ? max : min + 1 };
  }, [cellsPage]);

  // Snap imported observations onto nearest grid cells within bounds
  const cellObservationMap = useMemo(() => {
    const map = new Map<string, { hotspots: number; confirmed: number }>();
    if (!cellsPage || !obsData || obsData.map_points.length === 0) return map;
    const cells = cellsPage.cells;
    if (cells.length === 0) return map;

    const lats = cells.map((c) => c.center_lat);
    const lons = cells.map((c) => c.center_lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const padLat = (maxLat - minLat) / Math.max(cellsPage.grid.rows, 1) + 0.005;
    const padLon = (maxLon - minLon) / Math.max(cellsPage.grid.cols, 1) + 0.005;

    obsData.map_points.forEach((pt) => {
      if (
        pt.latitude < minLat - padLat ||
        pt.latitude > maxLat + padLat ||
        pt.longitude < minLon - padLon ||
        pt.longitude > maxLon + padLon
      ) {
        return;
      }
      let bestCell: GridCell | null = null;
      let bestDist = Infinity;
      for (const c of cells) {
        const d = (c.center_lat - pt.latitude) ** 2 + (c.center_lon - pt.longitude) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestCell = c;
        }
      }
      if (bestCell) {
        const cur = map.get(bestCell.cell_uid) || { hotspots: 0, confirmed: 0 };
        if (pt.record_type === 'confirmed_incident') {
          cur.confirmed += 1;
        } else {
          cur.hotspots += 1;
        }
        map.set(bestCell.cell_uid, cur);
      }
    });
    return map;
  }, [cellsPage, obsData]);

  if (loading) return <LoadingState message="Loading structured forest grid..." />;
  if (error) return <ErrorState message={error} onRetry={loadGrids} />;

  if (grids.length === 0 || !cellsPage) {
    return (
      <EmptyState
        title="No structured forest grids generated yet"
        description="Import a geospatial dataset in the Dataset Centre and run the Structured Grid Generator inside the Geospatial Laboratory to explore individual cellular units and land-cover distributions."
        actionLabel="Open Geospatial Laboratory"
        onAction={() => navigate('/geospatial')}
      />
    );
  }

  const grid = cellsPage.grid;
  const sourceDataset = datasets.find((d) => d.id === grid.source_dataset_id) || null;
  const elevationDataset = grid.elevation_dataset_id
    ? datasets.find((d) => d.id === grid.elevation_dataset_id) || null
    : null;

  const visibleCells = cellsPage.cells.filter((cell) => {
    if (!showNoData && cell.quality_status === 'nodata') return false;
    if (landcoverFilter && cell.landcover_category !== landcoverFilter) return false;
    return true;
  });

  const cellSizePx = Math.max(5, Math.min(20, Math.floor(580 / Math.max(grid.rows, grid.cols))));
  const selectedCellObs = selectedCell ? cellObservationMap.get(selectedCell.cell_uid) : undefined;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[#2A332E]">
              <Grid3X3 className="h-4 w-4 text-[#1B4332]" />
              <span>Active Grid</span>
            </div>
            <select
              value={selectedGridId ?? ''}
              onChange={(e) => handleSelectGrid(Number(e.target.value))}
              className="rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs font-medium"
            >
              {grids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.rows}×{g.cols} · {g.resolution_meters}m)
                </option>
              ))}
            </select>

            <select
              value={landcoverFilter}
              onChange={(e) => setLandcoverFilter(e.target.value)}
              className="rounded-md border border-[#C6CFC8] bg-white px-3 py-1.5 text-xs"
            >
              <option value="">All Land-Cover Classes</option>
              {Object.keys(cellsPage.landcover_breakdown).map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({cellsPage.landcover_breakdown[cat]})
                </option>
              ))}
            </select>

            <form onSubmit={handleCellSearch} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#5B6861] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={cellSearch}
                  onChange={(e) => setCellSearch(e.target.value)}
                  placeholder="Find cell_uid or row,col"
                  className="w-44 rounded-md border border-[#C6CFC8] bg-white pl-8 pr-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="rounded-md border border-[#C6CFC8] bg-[#F5F6F3] px-2.5 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#E7EBE6]"
              >
                Find
              </button>
            </form>
          </div>

          <div className="text-xs font-mono tabular-nums text-[#5B6861]">
            {grid.crs} · {grid.valid_cell_count}/{grid.cell_count} valid · {grid.metadata_json?.graph_edges ?? 0} graph edges
          </div>
        </div>

        {/* Layer & Overlay Toggles + Dataset Attribution */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E7EBE6] pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-5 text-[#4B5851]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#151B18]">
              <Layers className="h-3.5 w-3.5 text-[#1B4332]" />
              <span>Layers:</span>
            </span>

            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showNoData}
                onChange={(e) => setShowNoData(e.target.checked)}
                className="rounded border-[#C6CFC8]"
              />
              <span>NoData Mask Cells</span>
            </label>

            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showObservationOverlay}
                onChange={(e) => setShowObservationOverlay(e.target.checked)}
                className="rounded border-[#C6CFC8]"
              />
              <span>Observation Hotspots ({cellObservationMap.size} matched cells)</span>
            </label>

            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showElevationShading}
                disabled={!elevationStats.hasElevation}
                onChange={(e) => setShowElevationShading(e.target.checked)}
                className="rounded border-[#C6CFC8] disabled:opacity-50"
              />
              <span className={!elevationStats.hasElevation ? 'text-[#8B9790]' : ''}>
                DEM Elevation Shading {!elevationStats.hasElevation && '(No SRTM attached)'}
              </span>
            </label>
          </div>

          <div className="text-[11px] text-[#5B6861]">
            Source: <span className="font-medium text-[#151B18]">{sourceDataset?.name || `Dataset #${grid.source_dataset_id}`}</span>
            {elevationDataset ? ` · DEM: ${elevationDataset.name}` : ''}
            {studyArea ? ` · Boundary: ${studyArea.verification_status.replace(/_/g, ' ')}` : ''}
          </div>
        </div>
        {searchError && <div className="text-xs font-medium text-[#B42318]">{searchError}</div>}
      </section>

      {/* Main Split: 2D Cellular Matrix + Cell Inspector & Coordinate/Neighborhood Engine */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#151B18]">
                2D Cellular Lattice ({grid.rows} rows × {grid.cols} cols)
              </h2>
              <p className="text-xs text-[#5B6861]">
                Selected cell is outlined in charcoal; active neighborhood stencil ({stencil}, {boundary}) neighbors in amber; overlaid dots show imported thermal hotspots.
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums text-[#5B6861]">
              Showing {visibleCells.length} cells
            </div>
          </div>

          <div className="overflow-auto rounded border border-[#E7EBE6] bg-[#F5F6F3] p-4 flex justify-center">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${grid.cols}, ${cellSizePx}px)`,
                gap: '1px',
              }}
            >
              {cellsPage.cells.map((cell) => {
                const isHidden =
                  (!showNoData && cell.quality_status === 'nodata') ||
                  (landcoverFilter !== '' && cell.landcover_category !== landcoverFilter);
                const visual = getLandcoverVisual(cell.landcover_category);
                const isSelected = selectedCell?.cell_uid === cell.cell_uid;
                const isNeighbor = highlightedNeighborUids.has(cell.cell_uid);
                const obsHits = showObservationOverlay ? cellObservationMap.get(cell.cell_uid) : undefined;

                let bgColor = isHidden ? '#E5E8E3' : visual.hex;
                if (!isHidden && showElevationShading && cell.elevation_m !== null) {
                  const norm = Math.max(0, Math.min(1, (cell.elevation_m - elevationStats.min) / (elevationStats.max - elevationStats.min)));
                  const shade = Math.round(45 + norm * 175);
                  bgColor = `rgb(${shade}, ${Math.min(255, shade + 10)}, ${shade})`;
                }

                return (
                  <button
                    key={cell.cell_uid}
                    type="button"
                    onClick={() => setSelectedCell(cell)}
                    title={`${cell.cell_uid} · ${cell.landcover_category}${
                      cell.elevation_m !== null ? ` · ${cell.elevation_m.toFixed(0)}m` : ''
                    }${obsHits ? ` · ${obsHits.hotspots} hotspot(s), ${obsHits.confirmed} confirmed` : ''}`}
                    style={{
                      width: `${cellSizePx}px`,
                      height: `${cellSizePx}px`,
                      backgroundColor: bgColor,
                      opacity: isHidden ? 0.25 : 1,
                    }}
                    className={`relative transition-transform ${
                      isSelected
                        ? 'ring-2 ring-[#151B18] z-10 scale-110'
                        : isNeighbor
                          ? 'ring-2 ring-[#B45309] z-10'
                          : 'hover:opacity-85'
                    }`}
                    aria-label={`Cell ${cell.cell_uid} ${cell.landcover_category}`}
                  >
                    {!isHidden && obsHits && (
                      <span
                        className={`absolute inset-0 m-auto h-1.5 w-1.5 rounded-full border border-white ${
                          obsHits.confirmed > 0 ? 'bg-[#151B18]' : 'bg-[#D97706]'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#4B5851]">
            {breakdownData.map((item) => (
              <div key={item.category} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-[2px] border border-black/10"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.category}</span>
                <span className="font-mono tabular-nums text-[#6B7871]">({item.count})</span>
              </div>
            ))}
            {showObservationOverlay && cellObservationMap.size > 0 && (
              <>
                <div className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#D97706] border border-white" />
                  <span>Satellite Hotspot (Sensor Point)</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#151B18] border border-white" />
                  <span>Confirmed Incident Record</span>
                </div>
              </>
            )}
          </div>

          {/* Coordinate Converter */}
          <div className="border-t border-[#E7EBE6] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#151B18]">
                <ArrowRightLeft className="h-3.5 w-3.5 text-[#1B4332]" />
                <span>Grid (row, col) ↔ Geographical Coordinate Converter</span>
              </div>
              <div className="flex items-center gap-1 rounded bg-[#F5F6F3] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCoordMode('grid_to_geo')}
                  className={`rounded px-2.5 py-1 font-medium ${coordMode === 'grid_to_geo' ? 'bg-white text-[#151B18] border border-[#DCE2DC]' : 'text-[#5B6861]'}`}
                >
                  Grid → Geo
                </button>
                <button
                  type="button"
                  onClick={() => setCoordMode('geo_to_grid')}
                  className={`rounded px-2.5 py-1 font-medium ${coordMode === 'geo_to_grid' ? 'bg-white text-[#151B18] border border-[#DCE2DC]' : 'text-[#5B6861]'}`}
                >
                  Geo → Grid
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 text-xs">
              {coordMode === 'grid_to_geo' ? (
                <>
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Row Index</label>
                    <input type="number" value={convRow} onChange={(e) => setConvRow(e.target.value)} className="w-24 rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Col Index</label>
                    <input type="number" value={convCol} onChange={(e) => setConvCol(e.target.value)} className="w-24 rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Longitude (WGS84)</label>
                    <input type="number" step="0.0001" value={convLon} onChange={(e) => setConvLon(e.target.value)} className="w-32 rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#5B6861] mb-1">Latitude (WGS84)</label>
                    <input type="number" step="0.0001" value={convLat} onChange={(e) => setConvLat(e.target.value)} className="w-32 rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={handleConvertCoords}
                className="rounded-md bg-[#1B4332] px-3.5 py-1.5 font-medium text-white hover:bg-[#143326]"
              >
                Convert & Locate Cell
              </button>
              {convResult && (
                <div className="font-mono text-[11px] text-[#151B18] bg-[#F5F6F3] px-3 py-1.5 rounded border border-[#E7EBE6]">
                  ({convResult.row_idx}, {convResult.col_idx}) · {convResult.center_lat.toFixed(5)}, {convResult.center_lon.toFixed(5)} ·{' '}
                  {convResult.inside_grid_bounds ? (convResult.cell_uid ?? 'Inside bounds') : 'Outside grid'}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right: Cell Data Inspector + Dynamic Neighborhood Boundary Inspector + Composition Chart */}
        <div className="xl:col-span-4 space-y-6">
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5">
            <div className="flex items-center gap-2 border-b border-[#E7EBE6] pb-3">
              <Info className="h-4 w-4 text-[#1B4332]" />
              <h3 className="font-display text-sm font-semibold text-[#151B18]">Cell Data Inspector</h3>
            </div>

            {!selectedCell ? (
              <p className="mt-4 text-xs text-[#6B7871]">Select a cell from the lattice to inspect its record.</p>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-[#6B7871]">Cell ID</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-[#151B18]">{selectedCell.cell_uid}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Grid Index (Row, Col)</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    ({selectedCell.row_idx}, {selectedCell.col_idx})
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Land-Cover Category</dt>
                  <dd className="mt-0.5 font-semibold text-[#151B18]">{selectedCell.landcover_category}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Original Source Value</dt>
                  <dd className="mt-0.5 font-mono text-[#151B18]">{selectedCell.original_source_value ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">WGS84 Centroid</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    {selectedCell.center_lat.toFixed(5)}, {selectedCell.center_lon.toFixed(5)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Metric Coords ({selectedCell.crs})</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    {selectedCell.native_x.toFixed(0)}, {selectedCell.native_y.toFixed(0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Elevation</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    {selectedCell.elevation_m !== null ? `${selectedCell.elevation_m.toFixed(1)} m` : 'Unavailable'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7871]">Graph Vertex ID</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    v_{selectedCell.graph_vertex_id}
                  </dd>
                </div>
                <div className="col-span-2 border-t border-[#F0F2EF] pt-2">
                  <dt className="text-[#6B7871] flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-[#D97706]" />
                    <span>Overlaid Observations (Nearest Cell Match)</span>
                  </dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[#151B18]">
                    {selectedCellObs
                      ? `${selectedCellObs.hotspots} satellite hotspot(s), ${selectedCellObs.confirmed} confirmed incident(s)`
                      : '0 matched observations in this cell'}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {/* Neighborhood & Boundary Condition Engine Inspector */}
          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 border-b border-[#E7EBE6] pb-2.5">
              <Compass className="h-4 w-4 text-[#1B4332]" />
              <h3 className="font-display text-sm font-semibold text-[#151B18]">
                Neighborhood & Boundary Stencil
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#5B6861] mb-1">Stencil</label>
                <select
                  value={stencil}
                  onChange={(e) => setStencil(e.target.value as 'moore_8' | 'von_neumann_4')}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2 py-1"
                >
                  <option value="moore_8">Moore (8-neighbor)</option>
                  <option value="von_neumann_4">Von Neumann (4-neighbor)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#5B6861] mb-1">Boundary</label>
                <select
                  value={boundary}
                  onChange={(e) => setBoundary(e.target.value as 'absorbing' | 'reflective' | 'periodic')}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2 py-1"
                >
                  <option value="absorbing">Absorbing (Fixed)</option>
                  <option value="reflective">Reflective</option>
                  <option value="periodic">Periodic (Toroidal)</option>
                </select>
              </div>
            </div>

            {nbInspect && (
              <div className="space-y-2 pt-1">
                <div className="font-mono text-[11px] text-[#4B5851]">
                  Degree: {nbInspect.degree} · Clipped dirs: {nbInspect.boundary_clipped_directions.join(', ') || 'None'}
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-[#F0F2EF] border border-[#E7EBE6] rounded">
                  {nbInspect.neighbor_details.map((nb) => (
                    <div key={nb.cell_uid} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-[#151B18]">
                        [{nb.direction}] {nb.cell_uid}
                      </span>
                      <span className="text-[11px] text-[#5B6861]">
                        {nb.landcover_category}{nb.wrapped_or_reflected ? ' · wrapped' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[#DCE2DC] bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-[#151B18] mb-3">
              Land-Cover Cell Composition
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdownData} layout="vertical" margin={{ top: 4, right: 12, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#4B5851' }} />
                  <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 10, fill: '#4B5851' }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {breakdownData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
