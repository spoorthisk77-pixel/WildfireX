import type { SimulationConfig, SimulationTelemetryPoint, VoxelCell } from '../types/engine';

const MOORE_OFFSETS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const VON_NEUMANN_OFFSETS = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
];

function resolveNeighborCoord(
  nr: number,
  nc: number,
  rows: number,
  cols: number,
  boundary: SimulationConfig['boundaryCondition'],
): { r: number; c: number } | null {
  if (boundary === 'absorbing') {
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
    return { r: nr, c: nc };
  }
  if (boundary === 'reflective') {
    const rr = nr < 0 ? 0 : nr >= rows ? rows - 1 : nr;
    const cc = nc < 0 ? 0 : nc >= cols ? cols - 1 : nc;
    return { r: rr, c: cc };
  }
  return {
    r: ((nr % rows) + rows) % rows,
    c: ((nc % cols) + cols) % cols,
  };
}

export function computeTelemetryPoint(
  cells: VoxelCell[],
  generation: number,
  prevAffected: number,
): SimulationTelemetryPoint {
  let unburned = 0;
  let ignited = 0;
  let burning = 0;
  let extinguished = 0;
  let firebreak = 0;
  let tempSum = 0;
  let activeTempCount = 0;

  for (const cell of cells) {
    if (cell.state === 'unburned') unburned += 1;
    else if (cell.state === 'ignited') {
      ignited += 1;
      if (cell.temperature !== null) {
        tempSum += cell.temperature + 180;
        activeTempCount += 1;
      }
    } else if (cell.state === 'burning') {
      burning += 1;
      if (cell.temperature !== null) {
        tempSum += cell.temperature + 420;
        activeTempCount += 1;
      }
    } else if (cell.state === 'extinguished') extinguished += 1;
    else if (cell.state === 'firebreak') firebreak += 1;
  }

  const affectedTotal = ignited + burning + extinguished;
  return {
    generation,
    unburned,
    ignited,
    burning,
    extinguished,
    firebreak,
    affectedTotal,
    spreadRateCellsPerTick: Math.max(0, affectedTotal - prevAffected),
    meanActiveTempC: activeTempCount > 0 ? Number((tempSum / activeTempCount).toFixed(1)) : 0,
  };
}

export function stepCellularAutomata(
  cells: VoxelCell[],
  rows: number,
  cols: number,
  config: SimulationConfig,
  nextGeneration: number,
): VoxelCell[] {
  const offsets = config.neighborhood === 'moore_8' ? MOORE_OFFSETS : VON_NEUMANN_OFFSETS;
  const windRad = (config.windAngleDeg * Math.PI) / 180;
  // Wind vector in grid (dr, dc) coordinates: 0 deg = North (-row), 90 deg = East (+col)
  const windDr = -Math.cos(windRad);
  const windDc = Math.sin(windRad);
  const windNorm = Math.min(1.5, config.windSpeedKmh / 40);
  const humidityDamp = 1 - (config.humidityPct / 100) * 0.55;
  const tempBoost = 1 + Math.max(-0.2, (config.ambientTempC - 22) * 0.015);

  const nextCells: VoxelCell[] = new Array(cells.length);

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (
      cell.state === 'dormant' ||
      cell.state === 'water' ||
      cell.state === 'barren' ||
      cell.state === 'firebreak' ||
      cell.state === 'extinguished'
    ) {
      nextCells[i] = cell;
      continue;
    }

    if (cell.state === 'ignited') {
      nextCells[i] = {
        ...cell,
        state: 'burning',
        burnTicksRemaining: Math.max(1, config.burnDurationTicks),
      };
      continue;
    }

    if (cell.state === 'burning') {
      const rem = cell.burnTicksRemaining - 1;
      nextCells[i] =
        rem <= 0
          ? { ...cell, state: 'extinguished', burnTicksRemaining: 0 }
          : { ...cell, burnTicksRemaining: rem };
      continue;
    }

    // State === 'unburned': evaluate heat flux from burning/ignited neighbors
    let heatFlux = 0;
    const cellElev = cell.elevation ?? 0;

    for (const [dr, dc] of offsets) {
      const coord = resolveNeighborCoord(cell.row + dr, cell.col + dc, rows, cols, config.boundaryCondition);
      if (!coord) continue;
      const nb = cells[coord.r * cols + coord.c];
      if (!nb || (nb.state !== 'burning' && nb.state !== 'ignited')) continue;

      const dist = Math.hypot(dr, dc);
      // Direction from neighbor -> target cell is (-dr, -dc)
      const vecR = -dr / dist;
      const vecC = -dc / dist;
      const windDot = vecR * windDr + vecC * windDc;
      const windAlignment = Math.max(0.32, 1 + windDot * windNorm * 0.95);

      const elevDiff = cellElev - (nb.elevation ?? cellElev);
      const slopeFactor = Math.max(0.65, Math.min(1.65, 1 + elevDiff * 0.006));
      const nbIntensity = nb.state === 'burning' ? 1.0 : 0.45;
      heatFlux += (nbIntensity * windAlignment * slopeFactor) / dist;
    }

    if (heatFlux <= 0) {
      nextCells[i] = cell;
      continue;
    }

    const fuel = cell.fuelDensity ?? 0.55;
    const moisture = cell.moistureIndex ?? 0.35;
    const moistureResist = 1 - moisture * 0.62;
    const susceptibility = Math.max(0.05, fuel * moistureResist * humidityDamp * tempBoost);
    const ignitionScore = heatFlux * susceptibility * config.baseSpreadCoeff;

    // Deterministic threshold with subtle topological hash jitter for realistic organic wave fronts
    const microHash = (((cell.row * 73856093) ^ (cell.col * 19349663) ^ (nextGeneration * 83492791)) & 0xff) / 255;
    const threshold = 0.34 + microHash * 0.14;

    if (ignitionScore >= threshold) {
      nextCells[i] = {
        ...cell,
        state: 'ignited',
        burnTicksRemaining: config.burnDurationTicks,
        ignitionGeneration: nextGeneration,
      };
    } else {
      nextCells[i] = cell;
    }
  }

  return nextCells;
}

/**
 * Safe recursive-descent Propositional Logic AST Evaluator (Zero eval/exec).
 * Supports !, ~, NOT, &, &&, AND, |, ||, OR, ->, =>, <->, <=>, and parentheses.
 */
export function evaluatePropositionalExpression(
  expr: string,
): {
  variables: string[];
  rows: Array<{ assignment: Record<string, boolean>; result: boolean }>;
  tautology: boolean;
  contradiction: boolean;
  satisfiable: boolean;
  error?: string;
} {
  const tokenRegex = /(<->|<=>|->|=>|&&|\|\||[()!&|~^]|[A-Za-z_][A-Za-z0-9_]*)/g;
  const rawTokens = expr.match(tokenRegex);
  if (!rawTokens || rawTokens.length === 0) {
    return { variables: [], rows: [], tautology: false, contradiction: false, satisfiable: false, error: 'Empty logical expression.' };
  }

  const tokens = rawTokens.map((t) => {
    const u = t.toUpperCase();
    if (u === 'AND' || t === '&&') return '&';
    if (u === 'OR' || t === '||') return '|';
    if (u === 'NOT' || t === '~') return '!';
    if (t === '=>') return '->';
    if (t === '<=>') return '<->';
    return t;
  });

  const RESERVED = new Set(['(', ')', '!', '&', '|', '^', '->', '<->']);
  const varSet = new Set<string>();
  tokens.forEach((t) => {
    if (!RESERVED.has(t)) varSet.add(t);
  });
  const variables = Array.from(varSet).slice(0, 6);
  if (variables.length === 0) {
    return { variables: [], rows: [], tautology: false, contradiction: false, satisfiable: false, error: 'Include at least one propositional variable.' };
  }

  function evalWithEnv(env: Record<string, boolean>): boolean {
    let idx = 0;
    const peek = () => tokens[idx];
    const consume = () => tokens[idx++];

    function parseBicond(): boolean {
      let left = parseImplies();
      while (peek() === '<->') {
        consume();
        const right = parseImplies();
        left = left === right;
      }
      return left;
    }
    function parseImplies(): boolean {
      const left = parseOr();
      if (peek() === '->') {
        consume();
        const right = parseImplies();
        return !left || right;
      }
      return left;
    }
    function parseOr(): boolean {
      let left = parseAnd();
      while (peek() === '|' || peek() === '^') {
        const op = consume();
        const right = parseAnd();
        left = op === '^' ? left !== right : left || right;
      }
      return left;
    }
    function parseAnd(): boolean {
      let left = parseNot();
      while (peek() === '&') {
        consume();
        const right = parseNot();
        left = left && right;
      }
      return left;
    }
    function parseNot(): boolean {
      if (peek() === '!') {
        consume();
        return !parseNot();
      }
      return parsePrimary();
    }
    function parsePrimary(): boolean {
      const t = peek();
      if (!t) throw new Error('Unexpected end of expression.');
      if (t === '(') {
        consume();
        const val = parseBicond();
        if (peek() !== ')') throw new Error('Missing closing parenthesis.');
        consume();
        return val;
      }
      if (RESERVED.has(t)) throw new Error(`Unexpected operator "${t}".`);
      consume();
      if (t.toUpperCase() === 'TRUE') return true;
      if (t.toUpperCase() === 'FALSE') return false;
      return Boolean(env[t]);
    }

    const res = parseBicond();
    if (idx < tokens.length) throw new Error(`Unexpected token "${tokens[idx]}".`);
    return res;
  }

  try {
    const total = 1 << variables.length;
    const rows: Array<{ assignment: Record<string, boolean>; result: boolean }> = [];
    let trueCount = 0;
    for (let mask = 0; mask < total; mask += 1) {
      const assignment: Record<string, boolean> = {};
      variables.forEach((v, i) => {
        assignment[v] = Boolean((mask >> (variables.length - 1 - i)) & 1);
      });
      const result = evalWithEnv(assignment);
      if (result) trueCount += 1;
      rows.push({ assignment, result });
    }
    return {
      variables,
      rows,
      tautology: trueCount === total,
      contradiction: trueCount === 0,
      satisfiable: trueCount > 0,
    };
  } catch (err) {
    return {
      variables,
      rows: [],
      tautology: false,
      contradiction: false,
      satisfiable: false,
      error: err instanceof Error ? err.message : 'Invalid logical expression.',
    };
  }
}

export interface GridPatchGraph {
  nodeIds: string[];
  nodeCells: VoxelCell[];
  edges: Array<{ uIdx: number; vIdx: number; weight: number }>;
  adjacencyMatrix: number[][];
  degrees: number[];
  chromaticColors: number[];
  chromaticNumberUsed: number;
  handshakingSum: number;
  edgeCount: number;
}

export function buildPatchTopologyGraph(
  cells: VoxelCell[],
  rows: number,
  cols: number,
  patchSize = 6,
  startRow = 6,
  startCol = 6,
): GridPatchGraph {
  const sr = Math.max(0, Math.min(rows - patchSize, startRow));
  const sc = Math.max(0, Math.min(cols - patchSize, startCol));
  const nodeCells: VoxelCell[] = [];
  const coordToNode = new Map<string, number>();

  for (let r = sr; r < Math.min(rows, sr + patchSize); r += 1) {
    for (let c = sc; c < Math.min(cols, sc + patchSize); c += 1) {
      const cell = cells[r * cols + c];
      if (!cell) continue;
      coordToNode.set(`${r}:${c}`, nodeCells.length);
      nodeCells.push(cell);
    }
  }

  const n = nodeCells.length;
  const adjacencyMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const edges: Array<{ uIdx: number; vIdx: number; weight: number }> = [];

  for (let i = 0; i < n; i += 1) {
    const u = nodeCells[i];
    if (u.state === 'dormant' || u.state === 'water') continue;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      const j = coordToNode.get(`${u.row + dr}:${u.col + dc}`);
      if (j === undefined) continue;
      const v = nodeCells[j];
      if (v.state === 'dormant' || v.state === 'water') continue;

      const fuelAvg = ((u.fuelDensity ?? 0.5) + (v.fuelDensity ?? 0.5)) / 2;
      const elevDelta = Math.abs((u.elevation ?? 100) - (v.elevation ?? 100));
      const weight = Number((1 + fuelAvg * 4 + elevDelta * 0.03).toFixed(2));
      adjacencyMatrix[i][j] = 1;
      adjacencyMatrix[j][i] = 1;
      edges.push({ uIdx: i, vIdx: j, weight });
    }
  }

  const degrees = adjacencyMatrix.map((row) => row.reduce((a, b) => a + b, 0));
  const handshakingSum = degrees.reduce((a, b) => a + b, 0);

  // Greedy Welsh-Powell chromatic hazard zoning
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => degrees[b] - degrees[a]);
  const chromaticColors = new Array(n).fill(-1);
  for (const idx of order) {
    const used = new Set<number>();
    for (let nb = 0; nb < n; nb += 1) {
      if (adjacencyMatrix[idx][nb] === 1 && chromaticColors[nb] !== -1) {
        used.add(chromaticColors[nb]);
      }
    }
    let color = 0;
    while (used.has(color)) color += 1;
    chromaticColors[idx] = color;
  }

  return {
    nodeIds: nodeCells.map((c) => c.id),
    nodeCells,
    edges,
    adjacencyMatrix,
    degrees,
    chromaticColors,
    chromaticNumberUsed: chromaticColors.length ? Math.max(...chromaticColors) + 1 : 0,
    handshakingSum,
    edgeCount: edges.length,
  };
}

export interface DijkstraTraceStep {
  step: number;
  currentNode: string;
  currentDist: number;
  relaxedNeighbor: string;
  newDist: number;
  action: string;
}

export function traceDijkstraRouting(
  graph: GridPatchGraph,
  sourceIdx: number,
  targetIdx: number,
): {
  pathIndices: number[];
  pathLabels: string[];
  totalCost: number | null;
  steps: DijkstraTraceStep[];
} {
  const n = graph.nodeCells.length;
  if (n === 0 || sourceIdx < 0 || sourceIdx >= n || targetIdx < 0 || targetIdx >= n) {
    return { pathIndices: [], pathLabels: [], totalCost: null, steps: [] };
  }

  const adj: Array<Array<{ to: number; w: number }>> = Array.from({ length: n }, () => []);
  for (const e of graph.edges) {
    adj[e.uIdx].push({ to: e.vIdx, w: e.weight });
    adj[e.vIdx].push({ to: e.uIdx, w: e.weight });
  }

  const dist = new Array(n).fill(Infinity);
  const prev = new Array<number | null>(n).fill(null);
  const visited = new Array(n).fill(false);
  dist[sourceIdx] = 0;

  const steps: DijkstraTraceStep[] = [];
  let stepCounter = 1;

  for (let iter = 0; iter < n; iter += 1) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    visited[u] = true;
    if (u === targetIdx) {
      steps.push({
        step: stepCounter++,
        currentNode: graph.nodeIds[u],
        currentDist: Number(dist[u].toFixed(2)),
        relaxedNeighbor: '—',
        newDist: Number(dist[u].toFixed(2)),
        action: 'Target waypoint settled',
      });
      break;
    }

    for (const edge of adj[u]) {
      if (visited[edge.to]) continue;
      const alt = dist[u] + edge.w;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
        steps.push({
          step: stepCounter++,
          currentNode: graph.nodeIds[u],
          currentDist: Number(dist[u].toFixed(2)),
          relaxedNeighbor: graph.nodeIds[edge.to],
          newDist: Number(alt.toFixed(2)),
          action: `Relaxed edge (${graph.nodeIds[u]} -> ${graph.nodeIds[edge.to]}, w=${edge.w})`,
        });
      }
    }
  }

  const pathIndices: number[] = [];
  if (Number.isFinite(dist[targetIdx])) {
    let cur: number | null = targetIdx;
    while (cur !== null) {
      pathIndices.unshift(cur);
      cur = prev[cur];
    }
  }

  return {
    pathIndices,
    pathLabels: pathIndices.map((idx) => graph.nodeIds[idx]),
    totalCost: Number.isFinite(dist[targetIdx]) ? Number(dist[targetIdx].toFixed(2)) : null,
    steps: steps.slice(0, 32),
  };
}

export interface KruskalTraceStep {
  step: number;
  edgeLabel: string;
  weight: number;
  decision: 'ACCEPTED' | 'REJECTED_CYCLE';
  cumulativeCost: number;
}

export function traceKruskalFirebreakMst(graph: GridPatchGraph): {
  mstEdges: Array<{ uIdx: number; vIdx: number; weight: number }>;
  totalWeight: number;
  steps: KruskalTraceStep[];
} {
  const n = graph.nodeCells.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const sorted = [...graph.edges].sort((a, b) => a.weight - b.weight);

  const mstEdges: Array<{ uIdx: number; vIdx: number; weight: number }> = [];
  const steps: KruskalTraceStep[] = [];
  let totalWeight = 0;

  sorted.forEach((e, idx) => {
    const ru = find(e.uIdx);
    const rv = find(e.vIdx);
    const label = `${graph.nodeIds[e.uIdx]} — ${graph.nodeIds[e.vIdx]}`;
    if (ru !== rv) {
      parent[ru] = rv;
      mstEdges.push(e);
      totalWeight = Number((totalWeight + e.weight).toFixed(2));
      steps.push({
        step: idx + 1,
        edgeLabel: label,
        weight: e.weight,
        decision: 'ACCEPTED',
        cumulativeCost: totalWeight,
      });
    } else if (steps.length < 36) {
      steps.push({
        step: idx + 1,
        edgeLabel: label,
        weight: e.weight,
        decision: 'REJECTED_CYCLE',
        cumulativeCost: totalWeight,
      });
    }
  });

  return { mstEdges, totalWeight, steps: steps.slice(0, 36) };
}
