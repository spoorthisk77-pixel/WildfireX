import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SimulationConfig, VoxelCell } from '../types/engine';

// Module-scope reusable math objects (Zero-GC render loop)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

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

function createSubtleTerrainTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        const hash = ((x * 73856093) ^ (y * 19349663)) & 0xff;
        const shade = 242 + (hash % 13);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function computeTerrainBaseColor(cell: VoxelCell, target: THREE.Color): void {
  if (cell.state === 'dormant') {
    target.setHex(0xe2e8f0);
    return;
  }
  if (cell.state === 'water') {
    target.setHex(0x0284c7); // Ocean Blue firebreak/channel
    return;
  }
  if (cell.state === 'barren') {
    target.setHex(0x94a3b8); // Natural granite/rock
    return;
  }
  if (cell.state === 'firebreak') {
    target.setHex(0x0ea5e9); // Engineered containment barrier
    return;
  }
  if (cell.state === 'ignited') {
    target.setHex(0xd97706); // Warm amber ignition edge
    return;
  }
  if (cell.state === 'burning') {
    target.setHex(0xdc2626); // Crimson active fire
    return;
  }
  if (cell.state === 'extinguished') {
    target.setHex(0x475569); // Charred slate
    return;
  }

  // Unburned natural terrain + earth tones
  const fuel = cell.fuelDensity ?? 0.5;
  if (cell.biome === 'Tropical Rainforest') {
    target.setRGB(0.08, 0.45 + fuel * 0.18, 0.22);
  } else if (cell.biome === 'Moist Deciduous') {
    target.setRGB(0.11, 0.51 + fuel * 0.16, 0.25);
  } else if (cell.biome === 'Boreal Conifer') {
    target.setRGB(0.1, 0.41 + fuel * 0.15, 0.27);
  } else if (cell.biome === 'Peatland / Bog') {
    target.setRGB(0.36, 0.45, 0.26);
  } else if (cell.biome === 'Dry Scrubland') {
    target.setRGB(0.56 - fuel * 0.1, 0.54 + fuel * 0.08, 0.24); // Natural earth/ochre tone
  } else {
    target.setHex(0x16a34a);
  }
}

interface VoxelViewport3DProps {
  cells: VoxelCell[];
  rows: number;
  cols: number;
  isInitialized: boolean;
  config: SimulationConfig;
  selectedCellId: string | null;
  hoveredCellId: string | null;
  highlightedCellIds: Set<string>;
  projection: 'isometric' | 'perspective';
  resetCamCounter: number;
  onSelectCell: (cellId: string) => void;
  onHoverCell: (cellId: string | null) => void;
  onRegisterCapture?: (fn: (() => string | null) | null) => void;
  onCacheFrame?: (dataUrl: string | null) => void;
}

export function VoxelViewport3D({
  cells,
  rows,
  cols,
  isInitialized,
  config,
  selectedCellId,
  hoveredCellId,
  highlightedCellIds,
  projection,
  resetCamCounter,
  onSelectCell,
  onHoverCell,
  onRegisterCapture,
  onCacheFrame,
}: VoxelViewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const callbacksRef = useRef({ onSelectCell, onHoverCell, onRegisterCapture, onCacheFrame });
  callbacksRef.current = { onSelectCell, onHoverCell, onRegisterCapture, onCacheFrame };

  const sceneStateRef = useRef({
    cells,
    rows,
    cols,
    isInitialized,
    config,
    selectedCellId,
    hoveredCellId,
    highlightedCellIds,
    projection,
  });
  sceneStateRef.current = {
    cells,
    rows,
    cols,
    isInitialized,
    config,
    selectedCellId,
    hoveredCellId,
    highlightedCellIds,
    projection,
  };

  const apiRef = useRef<{
    rebuildGeometry: () => void;
    syncVisuals: () => void;
    switchCamera: (proj: 'isometric' | 'perspective') => void;
    resetCamera: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('3D WebGL2 rendering context is unavailable in this browser.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    renderer.setSize(width, height, false);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context was interrupted. Reload view to restore.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // Clean bright daylight SaaS studio atmosphere
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.0082);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    envScene.dispose();
    pmrem.dispose();

    const aspect = width / height;
    const frustum = 27;
    const orthoCam = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      250,
    );
    const perspCam = new THREE.PerspectiveCamera(40, aspect, 0.1, 250);

    const setIsometricPose = (cam: THREE.Camera) => {
      cam.position.set(25, 22, 25);
      cam.lookAt(0, 0, 0);
    };
    setIsometricPose(orthoCam);
    setIsometricPose(perspCam);

    let activeCamera: THREE.Camera = sceneStateRef.current.projection === 'isometric' ? orthoCam : perspCam;

    const controls = new OrbitControls(activeCamera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minZoom = 0.55;
    controls.maxZoom = 3.0;
    controls.minDistance = 10;
    controls.maxDistance = 75;
    controls.target.set(0, 0.5, 0);
    controls.update();

    // Daylight studio 3-point lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    keyLight.position.set(22, 34, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
    rimLight.position.set(-18, 16, -20);
    scene.add(rimLight);

    // Subtle crisp studio base plate & coordinate grid
    const floorGeo = new THREE.PlaneGeometry(140, 140);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.94,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(36, 36, 0xcbd5e1, 0xdbe3ed);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const albedoTex = createSubtleTerrainTexture();
    const boxGeo = new THREE.BoxGeometry(0.92, 1.0, 0.92);
    const canopyGeo = new THREE.BoxGeometry(0.76, 0.44, 0.76);
    const edgeSrcGeo = new THREE.BoxGeometry(0.95, 1.0, 0.95);
    const edgesGeo = new THREE.EdgesGeometry(edgeSrcGeo);
    edgeSrcGeo.dispose();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: albedoTex,
      roughness: 0.78,
      metalness: 0.04,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      map: albedoTex,
      roughness: 0.68,
      metalness: 0.02,
    });

    let dormantWireframe: THREE.LineSegments | null = null;
    let terrainMesh: THREE.InstancedMesh | null = null;
    let canopyMesh: THREE.InstancedMesh | null = null;
    let currentCapacity = 0;

    const selectWireMat = new THREE.LineBasicMaterial({ color: 0x0284c7 });
    const selectWire = new THREE.LineSegments(edgesGeo, selectWireMat);
    selectWire.visible = false;
    scene.add(selectWire);

    const hoverWireMat = new THREE.LineBasicMaterial({ color: 0x16a34a });
    const hoverWire = new THREE.LineSegments(edgesGeo, hoverWireMat);
    hoverWire.visible = false;
    scene.add(hoverWire);

    // Clean Ocean-Blue Wind Vector Indicator
    const windGroup = new THREE.Group();
    const windArrowMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.2,
    });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.2), windArrowMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 4), windArrowMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0, 1.35);
    windGroup.add(shaft, head);
    windGroup.position.set(-14.2, 2.2, 0);
    scene.add(windGroup);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, activeCamera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    const computeVoxelHeight = (cell: VoxelCell, minElev: number, elevSpan: number, initialized: boolean): number => {
      if (!initialized || cell.state === 'dormant') return 0.18;
      if (cell.state === 'water') return 0.25;
      if (cell.elevation === null) return 0.7;
      const norm = (cell.elevation - minElev) / elevSpan;
      const quantized = Math.round(norm * 10) / 10;
      return 0.4 + quantized * 3.1;
    };

    const rebuildGeometry = () => {
      const { cells: curCells, rows: r, cols: c, isInitialized: init } = sceneStateRef.current;
      const count = curCells.length;

      if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.dispose();
        terrainMesh = null;
      }
      if (canopyMesh) {
        scene.remove(canopyMesh);
        canopyMesh.dispose();
        canopyMesh = null;
      }
      if (dormantWireframe) {
        scene.remove(dormantWireframe);
        dormantWireframe.geometry.dispose();
        (dormantWireframe.material as THREE.Material).dispose();
        dormantWireframe = null;
      }

      terrainMesh = new THREE.InstancedMesh(boxGeo, terrainMat, Math.max(1, count));
      terrainMesh.castShadow = !isSoftwareGl;
      terrainMesh.receiveShadow = !isSoftwareGl;
      terrainMesh.frustumCulled = false;
      terrainMesh.layers.enable(1);
      scene.add(terrainMesh);

      canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, Math.max(1, count));
      canopyMesh.castShadow = !isSoftwareGl;
      canopyMesh.frustumCulled = false;
      scene.add(canopyMesh);

      currentCapacity = count;

      if (!init) {
        const linePositions: number[] = [];
        const halfR = r / 2;
        const halfC = c / 2;
        for (let rr = 0; rr <= r; rr += 1) {
          const z = rr - halfR - 0.5;
          linePositions.push(-halfC - 0.5, 0.2, z, c - halfC - 0.5, 0.2, z);
        }
        for (let cc = 0; cc <= c; cc += 1) {
          const x = cc - halfC - 0.5;
          linePositions.push(x, 0.2, -halfR - 0.5, x, 0.2, r - halfR - 0.5);
        }
        const wfGeo = new THREE.BufferGeometry();
        wfGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const wfMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.72 });
        dormantWireframe = new THREE.LineSegments(wfGeo, wfMat);
        scene.add(dormantWireframe);
      }
    };

    const syncVisuals = () => {
      const {
        cells: curCells,
        rows: r,
        cols: c,
        isInitialized: init,
        config: cfg,
        selectedCellId: selId,
        hoveredCellId: hovId,
        highlightedCellIds: hiIds,
      } = sceneStateRef.current;

      if (!terrainMesh || !canopyMesh || currentCapacity !== curCells.length) {
        rebuildGeometry();
      }
      if (!terrainMesh || !canopyMesh) return;

      const elevs = curCells.map((x) => x.elevation).filter((v): v is number => v !== null);
      const minElev = elevs.length ? Math.min(...elevs) : 0;
      const maxElev = elevs.length ? Math.max(...elevs) : 1;
      const elevSpan = Math.max(1, maxElev - minElev);

      const halfR = r / 2;
      const halfC = c / 2;
      let canopyIdx = 0;

      selectWire.visible = false;
      hoverWire.visible = false;

      for (let i = 0; i < curCells.length; i += 1) {
        const cell = curCells[i];
        const x = cell.col - halfC;
        const z = cell.row - halfR;
        const h = computeVoxelHeight(cell, minElev, elevSpan, init);

        _pos.set(x, h / 2, z);
        _scale.set(1, h, 1);
        _mat4.compose(_pos, _quat, _scale);
        terrainMesh.setMatrixAt(i, _mat4);

        computeTerrainBaseColor(cell, _color);
        if (hiIds.has(cell.id) && init && cell.state === 'unburned') {
          _color.lerp(new THREE.Color(0x0284c7), 0.58);
        }
        terrainMesh.setColorAt(i, _color);

        // Canopy / Flame tier
        const hasCanopy =
          init &&
          cell.state !== 'dormant' &&
          cell.state !== 'water' &&
          cell.state !== 'barren' &&
          ((cell.fuelDensity ?? 0) > 0.34 || cell.state === 'burning' || cell.state === 'ignited');

        if (hasCanopy) {
          const crownH =
            cell.state === 'burning'
              ? 0.85
              : cell.state === 'ignited'
                ? 0.58
                : 0.34 + (cell.fuelDensity ?? 0.5) * 0.42;
          _pos.set(x, h + crownH / 2, z);
          _scale.set(1, crownH / 0.44, 1);
          _mat4.compose(_pos, _quat, _scale);
          canopyMesh.setMatrixAt(canopyIdx, _mat4);

          if (cell.state === 'burning') _color.setHex(0xef4444);
          else if (cell.state === 'ignited') _color.setHex(0xf59e0b);
          else if (cell.state === 'extinguished') _color.setHex(0x334155);
          else if (cell.state === 'firebreak') _color.setHex(0x38bdf8);
          else {
            const fuel = cell.fuelDensity ?? 0.5;
            _color.setRGB(0.08, 0.54 + fuel * 0.18, 0.26);
            if (hiIds.has(cell.id)) _color.lerp(new THREE.Color(0x0284c7), 0.5);
          }
          canopyMesh.setColorAt(canopyIdx, _color);
          canopyIdx += 1;
        }

        if (selId === cell.id) {
          selectWire.visible = true;
          selectWire.position.set(x, h / 2, z);
          selectWire.scale.set(1.04, h + 0.08, 1.04);
        }
        if (hovId === cell.id) {
          hoverWire.visible = true;
          hoverWire.position.set(x, h / 2, z);
          hoverWire.scale.set(1.06, h + 0.12, 1.06);
        }
      }

      terrainMesh.count = curCells.length;
      terrainMesh.instanceMatrix.needsUpdate = true;
      if (terrainMesh.instanceColor) terrainMesh.instanceColor.needsUpdate = true;
      terrainMesh.computeBoundingSphere();

      canopyMesh.count = canopyIdx;
      canopyMesh.instanceMatrix.needsUpdate = true;
      if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
      canopyMesh.computeBoundingSphere();

      windGroup.visible = init;
      const windRad = (cfg.windAngleDeg * Math.PI) / 180;
      windGroup.rotation.y = -windRad + Math.PI;
      const speedScale = 0.6 + Math.min(1.6, cfg.windSpeedKmh / 35);
      windGroup.scale.set(1, 1, speedScale);

      requestRender();
    };

    const switchCamera = (proj: 'isometric' | 'perspective') => {
      const prevCam = activeCamera;
      activeCamera = proj === 'isometric' ? orthoCam : perspCam;
      activeCamera.position.copy(prevCam.position);
      controls.object = activeCamera;
      controls.update();
      requestRender();
    };

    const resetCamera = () => {
      setIsometricPose(orthoCam);
      setIsometricPose(perspCam);
      orthoCam.zoom = 1;
      orthoCam.updateProjectionMatrix();
      controls.target.set(0, 0.5, 0);
      controls.update();
      requestRender();
    };

    apiRef.current = { rebuildGeometry, syncVisuals, switchCamera, resetCamera };

    const captureCanvasSnapshot = (): string | null => {
      if (disposed) return null;
      try {
        controls.update();
        renderer.render(scene, activeCamera);
        return renderer.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    };
    callbacksRef.current.onRegisterCapture?.(captureCanvasSnapshot);

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let lastHoverTs = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const getHitCellId = (ev: PointerEvent): string | null => {
      if (!terrainMesh) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const hits = raycaster.intersectObject(terrainMesh, false);
      if (hits.length > 0 && hits[0].instanceId !== undefined) {
        const hitCell = sceneStateRef.current.cells[hits[0].instanceId];
        return hitCell ? hitCell.id : null;
      }
      return null;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 45) return;
      lastHoverTs = now;
      const hitId = getHitCellId(ev);
      if (hitId !== sceneStateRef.current.hoveredCellId) {
        callbacksRef.current.onHoverCell(hitId);
      }
      renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
      if (moved > 5) return;
      const hitId = getHitCellId(ev);
      if (hitId) {
        callbacksRef.current.onSelectCell(hitId);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let resizeRafId = 0;
    let lastObservedW = width;
    let lastObservedH = height;

    const applyResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 320);
      if (w === lastObservedW && h === lastObservedH) return;
      lastObservedW = w;
      lastObservedH = h;
      const asp = w / h;
      orthoCam.left = (-frustum * asp) / 2;
      orthoCam.right = (frustum * asp) / 2;
      orthoCam.top = frustum / 2;
      orthoCam.bottom = -frustum / 2;
      orthoCam.updateProjectionMatrix();
      perspCam.aspect = asp;
      perspCam.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      requestRender();
    };

    const resizeObs = new ResizeObserver(() => {
      if (disposed) return;
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(applyResize);
    });
    resizeObs.observe(container);

    rebuildGeometry();
    syncVisuals();
    if (!isSoftwareGl) {
      renderer.compile(scene, activeCamera);
    }

    return () => {
      if (sceneStateRef.current.isInitialized) {
        const lastFrame = captureCanvasSnapshot();
        if (lastFrame) callbacksRef.current.onCacheFrame?.(lastFrame);
      }
      callbacksRef.current.onRegisterCapture?.(null);
      disposed = true;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(resizeRafId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      boxGeo.dispose();
      canopyGeo.dispose();
      edgesGeo.dispose();
      envTarget.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      terrainMat.dispose();
      canopyMat.dispose();
      albedoTex.dispose();
      selectWireMat.dispose();
      hoverWireMat.dispose();
      windArrowMat.dispose();
      if (terrainMesh) terrainMesh.dispose();
      if (canopyMesh) canopyMesh.dispose();
      if (dormantWireframe) {
        dormantWireframe.geometry.dispose();
        (dormantWireframe.material as THREE.Material).dispose();
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuildGeometry();
    apiRef.current?.syncVisuals();
  }, [isInitialized, rows, cols]);

  useEffect(() => {
    apiRef.current?.syncVisuals();
  }, [cells, config, selectedCellId, hoveredCellId, highlightedCellIds]);

  useEffect(() => {
    apiRef.current?.switchCamera(projection);
  }, [projection]);

  useEffect(() => {
    if (resetCamCounter > 0) {
      apiRef.current?.resetCamera();
    }
  }, [resetCamCounter]);

  if (webglError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 p-8 text-center">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-600 shadow-sm">
          <div className="font-semibold text-slate-900">3D Simulation Viewport Unavailable</div>
          <p className="mt-2">{webglError}</p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}
