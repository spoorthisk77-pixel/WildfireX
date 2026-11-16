import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  Grid2X2,
  Info,
  RotateCcw,
  X,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { GridCell, GridCellsPage, ProcessedGrid } from '../types/api';
import { getLandcoverVisual } from '../utils/landcoverPalette';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';

type ViewMode = '3d' | '2d';
type CameraPreset = 'isometric' | 'top' | 'canopy';

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Generates an original procedural CanvasTexture for voxel block surfaces.
 * Uses seeded patterns per land-cover type with zero external/copyrighted assets.
 */
function createProceduralVoxelTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    // Subtle organic mineral/foliage micro-grid so instance colors retain crisp voxel readability
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        const hash = ((x * 73856093) ^ (y * 19349663)) & 0xff;
        const shade = 236 + (hash % 19);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
    ctx.strokeStyle = 'rgba(21, 27, 24, 0.10)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

interface VoxelSceneProps {
  grid: ProcessedGrid;
  validCells: GridCell[];
  selectedCell: GridCell | null;
  onSelectCell: (cell: GridCell) => void;
  viewMode: ViewMode;
  verticalExaggeration: number;
  showCanopyCrowns: boolean;
  elevationStats: { min: number; max: number; hasElevation: boolean };
  isSoftwareGl: boolean;
  cameraPreset: CameraPreset;
  resetCounter: number;
}

function VoxelScene({
  grid,
  validCells,
  selectedCell,
  onSelectCell,
  viewMode,
  verticalExaggeration,
  showCanopyCrowns,
  elevationStats,
  isSoftwareGl,
  cameraPreset,
  resetCounter,
}: VoxelSceneProps) {
  const voxelMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const crownMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const voxelTexture = useMemo(() => createProceduralVoxelTexture(), []);
  useEffect(() => () => voxelTexture.dispose(), [voxelTexture]);

  const span = Math.max(grid.rows, grid.cols);
  const halfCols = grid.cols / 2;
  const halfRows = grid.rows / 2;
  const elevSpan = Math.max(1, elevationStats.max - elevationStats.min);

  const treeCells = useMemo(
    () => validCells.filter((c) => c.landcover_category.toLowerCase().includes('tree')),
    [validCells],
  );

  // Compute position & height lookup for selection highlight
  const cellHeightMap = useMemo(() => {
    const map = new Map<string, { x: number; z: number; h: number }>();
    validCells.forEach((cell) => {
      const visual = getLandcoverVisual(cell.landcover_category);
      const x = cell.col_idx - halfCols + 0.5;
      const z = cell.row_idx - halfRows + 0.5;
      if (viewMode === '2d') {
        map.set(cell.cell_uid, { x, z, h: 0.25 });
      } else {
        const normElev =
          elevationStats.hasElevation && cell.elevation_m !== null
            ? ((cell.elevation_m - elevationStats.min) / elevSpan) * 4.5 * verticalExaggeration
            : 0;
        const h = Math.max(0.25, visual.canopyHeight * verticalExaggeration + normElev);
        map.set(cell.cell_uid, { x, z, h });
      }
    });
    return map;
  }, [validCells, halfCols, halfRows, viewMode, elevationStats, elevSpan, verticalExaggeration]);

  // Populate voxel InstancedMesh matrices & colors
  useEffect(() => {
    const mesh = voxelMeshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    validCells.forEach((cell, idx) => {
      const visual = getLandcoverVisual(cell.landcover_category);
      const geomInfo = cellHeightMap.get(cell.cell_uid);
      if (!geomInfo) return;
      dummy.position.set(geomInfo.x, geomInfo.h / 2, geomInfo.z);
      dummy.scale.set(1, geomInfo.h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      tmpColor.set(visual.hex);
      const shadeJitter = (((cell.row_idx * 31 + cell.col_idx * 17) % 9) - 4) * 0.008;
      tmpColor.offsetHSL(0, 0, shadeJitter);
      mesh.setColorAt(idx, tmpColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [validCells, cellHeightMap]);

  // Populate tree canopy crown InstancedMesh
  useEffect(() => {
    const mesh = crownMeshRef.current;
    if (!mesh || viewMode === '2d' || !showCanopyCrowns || treeCells.length === 0) return;
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    treeCells.forEach((cell, idx) => {
      const geomInfo = cellHeightMap.get(cell.cell_uid);
      if (!geomInfo) return;
      dummy.position.set(geomInfo.x, geomInfo.h + 0.3, geomInfo.z);
      const s = 0.88 + ((cell.row_idx + cell.col_idx) % 5) * 0.04;
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const shadeJitter = (((cell.row_idx * 31 + cell.col_idx * 17) % 9) - 4) * 0.01;
      tmpColor.set('#2A6342').offsetHSL(0, 0, shadeJitter);
      mesh.setColorAt(idx, tmpColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [treeCells, cellHeightMap, viewMode, showCanopyCrowns]);

  // Reset / preset camera orientation
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    if (viewMode === '2d') {
      cam.position.set(0, span * 1.4, 0.001);
      controls.target.set(0, 0, 0);
      controls.enableRotate = false;
    } else {
      controls.enableRotate = true;
      if (cameraPreset === 'isometric') {
        cam.position.set(span * 0.78, span * 0.62, span * 0.85);
        controls.target.set(0, 1.0, 0);
      } else if (cameraPreset === 'top') {
        cam.position.set(0, span * 1.35, 0.01);
        controls.target.set(0, 0, 0);
      } else {
        cam.position.set(span * 0.48, span * 0.22, span * 0.52);
        controls.target.set(0, 1.5, 0);
      }
    }
    cam.updateProjectionMatrix();
    controls.update();
  }, [viewMode, cameraPreset, span, resetCounter]);

  const handleVoxelClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined && validCells[e.instanceId]) {
        onSelectCell(validCells[e.instanceId]);
      }
    },
    [validCells, onSelectCell],
  );

  const selectedInfo = selectedCell ? cellHeightMap.get(selectedCell.cell_uid) : null;

  return (
    <>
      <color attach="background" args={['#E9EDE7']} />
      {viewMode === '3d' && <fogExp2 attach="fog" args={['#E9EDE7', 0.0075]} />}

      {viewMode === '3d' ? (
        <PerspectiveCamera
          makeDefault
          fov={42}
          near={0.1}
          far={800}
          position={[span * 0.78, span * 0.62, span * 0.85]}
        />
      ) : (
        <OrthographicCamera
          makeDefault
          zoom={Math.max(8, Math.min(36, 460 / span))}
          near={0.1}
          far={800}
          position={[0, span * 1.4, 0.001]}
        />
      )}

      <hemisphereLight args={['#d9e8f5', '#3b493c', 0.85]} position={[0, 60, 0]} />
      <directionalLight
        color="#fff5e4"
        intensity={1.45}
        position={[span * 0.9, span * 1.15, span * 0.65]}
        castShadow={!isSoftwareGl && viewMode === '3d'}
      />
      <directionalLight color="#c4d8d0" intensity={0.45} position={[-span * 0.8, span * 0.45, -span * 0.7]} />

      {/* Ground Plinth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[span * 5, span * 5]} />
        <meshStandardMaterial color="#D9DFD7" roughness={0.95} metalness={0.0} />
      </mesh>

      {/* Main Voxel Grid */}
      <instancedMesh
        ref={voxelMeshRef}
        args={[undefined, undefined, validCells.length]}
        castShadow={!isSoftwareGl && viewMode === '3d'}
        receiveShadow
        onClick={handleVoxelClick}
      >
        <boxGeometry args={[0.92, 1, 0.92]} />
        <meshStandardMaterial map={voxelTexture} roughness={0.82} metalness={0.04} />
      </instancedMesh>

      {/* Tree Canopy Crowns (3D mode only) */}
      {viewMode === '3d' && showCanopyCrowns && treeCells.length > 0 && (
        <instancedMesh
          ref={crownMeshRef}
          args={[undefined, undefined, treeCells.length]}
          castShadow={!isSoftwareGl}
          receiveShadow
        >
          <boxGeometry args={[0.76, 0.65, 0.76]} />
          <meshStandardMaterial map={voxelTexture} roughness={0.9} metalness={0.02} />
        </instancedMesh>
      )}

      {/* Selected Cell Highlight Frame */}
      {selectedInfo && (
        <mesh position={[selectedInfo.x, selectedInfo.h / 2 + 0.02, selectedInfo.z]}>
          <boxGeometry args={[1.02, selectedInfo.h + 0.12, 1.02]} />
          <meshBasicMaterial color="#151B18" wireframe />
        </mesh>
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!isSoftwareGl}
        dampingFactor={0.06}
        enableRotate={viewMode === '3d'}
        maxPolarAngle={Math.PI / 2.04}
        minDistance={3}
        maxDistance={span * 3.2}
      />
    </>
  );
}

export function Landscape3DPage() {
  const navigate = useNavigate();
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [cellsPage, setCellsPage] = useState<GridCellsPage | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport Controls
  const [dockOpen, setDockOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [verticalExaggeration, setVerticalExaggeration] = useState(1.2);
  const [showCanopyCrowns, setShowCanopyCrowns] = useState(true);
  const [resetCounter, setResetCounter] = useState(0);

  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await apiClient.listGrids();
        setGrids(list);
        if (list.length > 0) {
          setSelectedGridId(list[0].id);
          const page = await apiClient.getGridCells(list[0].id, { limit: 16000 });
          setCellsPage(page);
          setSelectedCell(page.cells.find((c) => c.quality_status === 'valid') || null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load 3D landscape data.');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const handleGridChange = async (gridId: number) => {
    setSelectedGridId(gridId);
    setLoading(true);
    try {
      const page = await apiClient.getGridCells(gridId, { limit: 16000 });
      setCellsPage(page);
      setSelectedCell(page.cells.find((c) => c.quality_status === 'valid') || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grid cells.');
    } finally {
      setLoading(false);
    }
  };

  const validCells = useMemo(
    () => (cellsPage ? cellsPage.cells.filter((c) => c.quality_status === 'valid') : []),
    [cellsPage],
  );

  const cellByUid = useMemo(() => {
    const m = new Map<string, GridCell>();
    cellsPage?.cells.forEach((c) => m.set(c.cell_uid, c));
    return m;
  }, [cellsPage]);

  const elevationStats = useMemo(() => {
    if (!cellsPage) return { min: 0, max: 0, hasElevation: false };
    const elevs = cellsPage.cells.map((c) => c.elevation_m).filter((e): e is number => e !== null);
    if (elevs.length === 0) return { min: 0, max: 0, hasElevation: false };
    return { min: Math.min(...elevs), max: Math.max(...elevs), hasElevation: true };
  }, [cellsPage]);

  if (loading) return <LoadingState message="Initializing React Three Fiber voxel terrain scene..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  if (grids.length === 0 || !cellsPage) {
    return (
      <EmptyState
        title="No processed terrain grid available for 3D rendering"
        description="Every voxel block in the 3D Landscape viewport is generated dynamically from processed geographical grid cells stored in SQLite. Import a dataset in the Dataset Centre and generate a grid in the Geospatial Laboratory to render Nagarhole's voxel terrain."
        actionLabel="Go to Geospatial Laboratory"
        onAction={() => navigate('/geospatial')}
      />
    );
  }

  return (
    <div className="relative h-[calc(100vh-8.5rem)] min-h-[560px] w-full overflow-hidden rounded-lg border border-[#DCE2DC] bg-[#E9EDE7]">
      {/* React Three Fiber Canvas */}
      <Canvas
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? [1, 1] : [1, 2]}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
      >
        <VoxelScene
          grid={cellsPage.grid}
          validCells={validCells}
          selectedCell={selectedCell}
          onSelectCell={(cell) => {
            setSelectedCell(cell);
            setInspectorOpen(true);
          }}
          viewMode={viewMode}
          verticalExaggeration={verticalExaggeration}
          showCanopyCrowns={showCanopyCrowns}
          elevationStats={elevationStats}
          isSoftwareGl={isSoftwareGl}
          cameraPreset={cameraPreset}
          resetCounter={resetCounter}
        />
      </Canvas>

      {/* Top-Left Compact Telemetry Bar */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-md border border-[#DCE2DC] bg-white/95 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-[#151B18]">
          <Compass className="h-3.5 w-3.5 text-[#1B4332]" />
          <span>{cellsPage.grid.name}</span>
        </div>
        <span className="text-[#B4BEB7]" aria-hidden="true">·</span>
        <span className="font-mono tabular-nums text-[#4B5851]">
          {cellsPage.grid.rows}×{cellsPage.grid.cols} ({validCells.length} voxels)
        </span>
        <span className="text-[#B4BEB7]" aria-hidden="true">·</span>
        <span className="font-mono text-[#1B4332] uppercase">{viewMode}</span>
        {!inspectorOpen && (
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="ml-1 inline-flex items-center gap-1 rounded border border-[#DCE2DC] px-2 py-0.5 text-[11px] font-medium text-[#151B18] hover:bg-[#F5F6F3]"
          >
            <Info className="h-3 w-3" />
            <span>Inspector</span>
          </button>
        )}
      </div>

      {/* Right Cell Inspector Drawer */}
      {inspectorOpen && (
        <aside className="absolute top-4 right-4 z-10 w-80 max-h-[calc(100%-7rem)] overflow-y-auto rounded-md border border-[#DCE2DC] bg-white p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E7EBE6] pb-2.5">
            <div className="flex items-center gap-1.5 font-display text-sm font-semibold text-[#151B18]">
              <Info className="h-4 w-4 text-[#1B4332]" />
              <span>Cell Inspector</span>
            </div>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="rounded p-1 text-[#6B7871] hover:bg-[#F5F6F3]"
              aria-label="Close cell inspector"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!selectedCell ? (
            <p className="mt-3 text-[#5B6861]">Click any voxel block in the scene to inspect its geographical & graph attributes.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <div>
                <dt className="text-[11px] text-[#6B7871]">Cell ID</dt>
                <dd className="font-mono font-semibold text-[#151B18]">{selectedCell.cell_uid}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Grid Index (r, c)</dt>
                <dd className="font-mono tabular-nums text-[#151B18]">
                  ({selectedCell.row_idx}, {selectedCell.col_idx})
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-[#6B7871]">Land-Cover Category</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold text-[#151B18]">
                  <span
                    className="inline-block h-3 w-3 rounded-[2px] border border-black/10"
                    style={{ backgroundColor: getLandcoverVisual(selectedCell.landcover_category).hex }}
                  />
                  <span>{selectedCell.landcover_category}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">WGS84 Coordinates</dt>
                <dd className="font-mono tabular-nums text-[11px] text-[#151B18]">
                  {selectedCell.center_lat.toFixed(5)}, {selectedCell.center_lon.toFixed(5)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Source Dataset</dt>
                <dd className="font-mono tabular-nums text-[#151B18]">Dataset #{selectedCell.source_dataset_id}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Spatial Resolution</dt>
                <dd className="font-mono tabular-nums text-[#151B18]">{selectedCell.spatial_resolution} m</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Data Quality</dt>
                <dd className="font-medium text-[#1E6B45]">{selectedCell.quality_status}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Elevation / NDVI</dt>
                <dd className="font-mono tabular-nums text-[#151B18]">
                  {selectedCell.elevation_m !== null ? `${selectedCell.elevation_m.toFixed(1)}m` : '—'} ·{' '}
                  {selectedCell.vegetation_index !== null ? selectedCell.vegetation_index.toFixed(2) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6B7871]">Graph Vertex ID</dt>
                <dd className="font-mono font-semibold text-[#1B4332]">v_{selectedCell.graph_vertex_id}</dd>
              </div>
              <div className="col-span-2 border-t border-[#F0F2EF] pt-2">
                <dt className="text-[11px] text-[#6B7871] mb-1">
                  Adjacent Graph Neighbors ({selectedCell.neighbors_json.length})
                </dt>
                <dd className="flex flex-wrap gap-1.5">
                  {selectedCell.neighbors_json.length === 0 ? (
                    <span className="text-[#6B7871]">Isolated / boundary</span>
                  ) : (
                    selectedCell.neighbors_json.map((uid) => {
                      const nb = cellByUid.get(uid);
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => nb && setSelectedCell(nb)}
                          className="rounded border border-[#DCE2DC] bg-[#F5F6F3] px-1.5 py-0.5 font-mono text-[10px] text-[#151B18] hover:border-[#1B4332]"
                        >
                          {uid}
                        </button>
                      );
                    })
                  )}
                </dd>
              </div>
            </dl>
          )}
        </aside>
      )}

      {/* Collapsible Bottom Control Dock */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 w-[min(980px,95%)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-t-md border border-b-0 border-[#DCE2DC] bg-white px-3 py-1 text-[11px] font-medium text-[#2A332E] hover:bg-[#F5F6F3]"
        >
          {dockOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{dockOpen ? 'Hide Controls' : 'Show Controls'}</span>
        </button>

        {dockOpen && (
          <div className="w-full rounded-md border border-[#DCE2DC] bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <label className="text-[#5B6861] font-medium">Grid</label>
              <select
                value={selectedGridId ?? ''}
                onChange={(e) => handleGridChange(Number(e.target.value))}
                className="rounded border border-[#C6CFC8] bg-white px-2.5 py-1 text-xs"
              >
                {grids.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2D / 3D Toggle */}
            <div className="flex items-center gap-1 rounded bg-[#F5F6F3] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === '3d' ? 'bg-white text-[#151B18] border border-[#DCE2DC]' : 'text-[#5B6861]'
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span>3D</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === '2d' ? 'bg-white text-[#151B18] border border-[#DCE2DC]' : 'text-[#5B6861]'
                }`}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
                <span>2D</span>
              </button>
            </div>

            {viewMode === '3d' && (
              <div className="flex items-center gap-1 rounded bg-[#F5F6F3] p-0.5">
                {(['isometric', 'top', 'canopy'] as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCameraPreset(preset);
                      setResetCounter((c) => c + 1);
                    }}
                    className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      cameraPreset === preset
                        ? 'bg-white text-[#151B18] border border-[#DCE2DC]'
                        : 'text-[#5B6861] hover:text-[#151B18]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}

            {viewMode === '3d' && (
              <div className="flex items-center gap-2">
                <label className="text-[#5B6861]" htmlFor="exag-slider">
                  Height
                </label>
                <input
                  id="exag-slider"
                  type="range"
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  value={verticalExaggeration}
                  onChange={(e) => setVerticalExaggeration(Number(e.target.value))}
                  className="w-20 accent-[#1B4332]"
                />
                <span className="font-mono tabular-nums w-8">{verticalExaggeration.toFixed(1)}×</span>
              </div>
            )}

            {viewMode === '3d' && (
              <label className="inline-flex items-center gap-1.5 text-[#2A332E]">
                <input
                  type="checkbox"
                  checked={showCanopyCrowns}
                  onChange={(e) => setShowCanopyCrowns(e.target.checked)}
                  className="rounded border-[#C6CFC8]"
                />
                <span>Crowns</span>
              </label>
            )}

            <button
              type="button"
              onClick={() => setResetCounter((c) => c + 1)}
              className="inline-flex items-center gap-1 rounded border border-[#DCE2DC] px-2.5 py-1 text-xs font-medium text-[#2A332E] hover:bg-[#F5F6F3]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Camera</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
