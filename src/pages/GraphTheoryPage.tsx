import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../services/apiClient';
import type { MathTopicResponse, ProcessedGrid } from '../types/api';
import { MathLabSection } from '../components/MathLabSection';
import { LatexFormula } from '../components/LatexFormula';

type GraphTab = 'grid_graph' | 'isomorphism' | 'walks_paths' | 'euler_hamiltonian' | 'planarity_coloring';

function parseEdgeLines(verticesText: string, edgesText: string) {
  const vertices = verticesText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const edges = edgesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\s,->]+/).filter(Boolean);
      return { u: parts[0], v: parts[1], weight: parts[2] ? Number(parts[2]) : 1 };
    })
    .filter((e) => e.u && e.v);
  return { vertices, edges };
}

function SimpleSvgGraph({
  nodes,
  edges,
  highlightEdges = [],
  coloring = {},
  title,
}: {
  nodes: string[];
  edges: Array<[string, string]>;
  highlightEdges?: Array<[string, string]>;
  coloring?: Record<string, number>;
  title?: string;
}) {
  const palette = ['#1B4332', '#B45309', '#1D4ED8', '#9D174D', '#4338CA', '#047857'];
  const n = nodes.length;
  const cx = 160;
  const cy = 115;
  const r = 82;
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(1, n) - Math.PI / 2;
    pos[node] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const isHighlighted = (u: string, v: string) =>
    highlightEdges.some(([a, b]) => (a === u && b === v) || (a === v && b === u));

  return (
    <div className="rounded border border-[#E7EBE6] bg-[#F5F6F3] p-3">
      {title && <div className="text-[11px] font-semibold text-[#2A332E] mb-1">{title}</div>}
      <svg viewBox="0 0 320 230" className="w-full h-52">
        {edges.map(([u, v], idx) => {
          const p1 = pos[u];
          const p2 = pos[v];
          if (!p1 || !p2) return null;
          const hl = isHighlighted(u, v);
          return (
            <line
              key={idx}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={hl ? '#B42318' : '#9AA69E'}
              strokeWidth={hl ? 2.6 : 1.4}
            />
          );
        })}
        {nodes.map((node) => {
          const p = pos[node];
          const colorIdx = coloring[node];
          const fill = colorIdx !== undefined ? palette[colorIdx % palette.length] : '#1B4332';
          return (
            <g key={node}>
              <circle cx={p.x} cy={p.y} r={13} fill={fill} stroke="#FFFFFF" strokeWidth={1.5} />
              <text
                x={p.x}
                y={p.y + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                fill="#FFFFFF"
              >
                {node.length > 5 ? node.slice(-4) : node}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraphTheoryPage() {
  const [tab, setTab] = useState<GraphTab>('grid_graph');
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [selectedGridId, setSelectedGridId] = useState<number | null>(null);
  const [neighborhood, setNeighborhood] = useState<'von_neumann_4' | 'moore_8'>('von_neumann_4');
  const [boundary, setBoundary] = useState<'absorbing' | 'reflective' | 'periodic'>('absorbing');
  const [patchSize, setPatchSize] = useState(4);

  // Isomorphism inputs
  const [isoVertsA, setIsoVertsA] = useState('A, B, C, D');
  const [isoEdgesA, setIsoEdgesA] = useState('A B\nB C\nC D\nD A\nA C');
  const [isoVertsB, setIsoVertsB] = useState('1, 2, 3, 4');
  const [isoEdgesB, setIsoEdgesB] = useState('1 2\n2 3\n3 4\n4 1\n2 4');

  // Shared custom graph inputs for Walks/Euler/Planarity
  const [customVerts, setCustomVerts] = useState('A, B, C, D, E');
  const [customEdges, setCustomEdges] = useState('A B\nB C\nC D\nD E\nE A\nA C\nB D');
  const [walkSource, setWalkSource] = useState('A');
  const [walkTarget, setWalkTarget] = useState('D');
  const [walkLen, setWalkLen] = useState(4);

  const [response, setResponse] = useState<MathTopicResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.listGrids().then((list) => {
      setGrids(list);
      if (list.length > 0) setSelectedGridId(list[0].id);
    });
  }, []);

  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      let res: MathTopicResponse;
      if (tab === 'grid_graph') {
        if (!selectedGridId) throw new Error('Generate a processed grid in Geospatial Laboratory first.');
        res = await apiClient.inspectGridGraph({
          grid_id: selectedGridId,
          neighborhood,
          boundary_condition: boundary,
          patch_rows: patchSize,
          patch_cols: patchSize,
        });
      } else if (tab === 'isomorphism') {
        res = await apiClient.checkGraphIsomorphism({
          graph_a: parseEdgeLines(isoVertsA, isoEdgesA),
          graph_b: parseEdgeLines(isoVertsB, isoEdgesB),
        });
      } else if (tab === 'walks_paths') {
        res = await apiClient.analyzeWalksPaths({
          graph: parseEdgeLines(customVerts, customEdges),
          source: walkSource.trim(),
          target: walkTarget.trim(),
          max_length: walkLen,
        });
      } else if (tab === 'euler_hamiltonian') {
        res = await apiClient.analyzeEulerHamiltonian({
          graph: parseEdgeLines(customVerts, customEdges),
          mode: 'both',
        });
      } else {
        res = await apiClient.analyzePlanarityColoring({
          graph: parseEdgeLines(customVerts, customEdges),
          compute_chromatic_polynomial: true,
          compute_dual: true,
        });
      }
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Graph theory computation failed.');
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    setResponse(null);
    setError(null);
    if (tab !== 'grid_graph') {
      void execute();
    } else if (selectedGridId) {
      void execute();
    }
  }, [tab, selectedGridId]);

  const tabMeta: Record<GraphTab, { title: string; intro: string; def: string; latex: string }> = {
    grid_graph: {
      title: 'Landscape Cellular Graph G = (V, E) & Handshaking Lemma',
      intro: 'Models every processed grid cell as a graph vertex and spatial adjacency as edges.',
      def: 'Undirected graph G = (V, E) with degree sequence, adjacency matrix, complement graph, and connected components.',
      latex: String.raw`\sum_{v \in V} \deg(v) = 2|E|`,
    },
    isomorphism: {
      title: 'Graph Isomorphism (NetworkX VF2)',
      intro: 'Determines whether two graphs are structurally identical under vertex relabeling.',
      def: 'G₁ ≅ G₂ iff a bijection φ: V₁ → V₂ preserves adjacency.',
      latex: String.raw`(u, v) \in E_1 \iff (\varphi(u), \varphi(v)) \in E_2`,
    },
    walks_paths: {
      title: 'Walks, Trails, Simple Paths & Connectedness',
      intro: 'Counts exact length-k walks via powers of the adjacency matrix A^k and enumerates simple paths.',
      def: '(A^k)_{u,v} equals the exact number of walks of length k between u and v.',
      latex: String.raw`\text{Walks}_k(u, v) = (A^k)_{u,v}`,
    },
    euler_hamiltonian: {
      title: 'Euler Circuits/Trails & Hamiltonian Paths/Cycles',
      intro: 'Contrasts edge-covering Eulerian traversals (degree parity) with vertex-covering Hamiltonian searches.',
      def: 'Connected graph G has an Euler circuit iff every vertex has even degree.',
      latex: String.raw`\forall v \in V,\; \deg(v) \equiv 0 \pmod{2}`,
    },
    planarity_coloring: {
      title: 'Planarity, Euler Formula, Dual Graph & Chromatic Polynomial',
      intro: 'Tests planar embeddability, computes faces F and dual G*, DSATUR coloring, and chromatic polynomial.',
      def: 'For a connected planar graph, V − E + F = 2.',
      latex: String.raw`V - E + F = 2`,
    },
  };

  const activeMeta = tabMeta[tab];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-lg border border-[#DCE2DC] bg-white p-2 text-xs">
        {(
          [
            ['grid_graph', 'Grid Graph G=(V,E)'],
            ['isomorphism', 'Isomorphism (VF2)'],
            ['walks_paths', 'Walks & Paths'],
            ['euler_hamiltonian', 'Euler & Hamiltonian'],
            ['planarity_coloring', 'Planarity, Dual & Coloring'],
          ] as Array<[GraphTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === key ? 'bg-[#1B4332] text-white' : 'text-[#4B5851] hover:bg-[#F5F6F3]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <MathLabSection
        title={activeMeta.title}
        introduction={activeMeta.intro}
        definition={activeMeta.def}
        formulaLatex={activeMeta.latex}
        executing={executing}
        error={error}
        response={response}
        onExecute={execute}
        inputPanel={
          tab === 'grid_graph' ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-[#5B6861] mb-1">Processed Grid</label>
                <select
                  value={selectedGridId ?? ''}
                  onChange={(e) => setSelectedGridId(Number(e.target.value))}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                >
                  {grids.length === 0 && <option value="">No grids available</option>}
                  {grids.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.rows}×{g.cols})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#5B6861] mb-1">Neighborhood</label>
                <select
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value as 'von_neumann_4' | 'moore_8')}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                >
                  <option value="von_neumann_4">Von Neumann (4-neighbor)</option>
                  <option value="moore_8">Moore (8-neighbor)</option>
                </select>
              </div>
              <div>
                <label className="block text-[#5B6861] mb-1">Boundary Condition</label>
                <select
                  value={boundary}
                  onChange={(e) => setBoundary(e.target.value as 'absorbing' | 'reflective' | 'periodic')}
                  className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5"
                >
                  <option value="absorbing">Absorbing</option>
                  <option value="reflective">Reflective</option>
                  <option value="periodic">Periodic</option>
                </select>
              </div>
              <div>
                <label className="block text-[#5B6861] mb-1">Patch Matrix Size ({patchSize}×{patchSize})</label>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={patchSize}
                  onChange={(e) => setPatchSize(Number(e.target.value))}
                  className="w-full accent-[#1B4332]"
                />
              </div>
            </div>
          ) : tab === 'isomorphism' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <label className="block font-semibold text-[#151B18]">Graph G₁</label>
                <input
                  type="text"
                  value={isoVertsA}
                  onChange={(e) => setIsoVertsA(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                  placeholder="Vertices comma-separated"
                />
                <textarea
                  rows={4}
                  value={isoEdgesA}
                  onChange={(e) => setIsoEdgesA(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-semibold text-[#151B18]">Graph G₂</label>
                <input
                  type="text"
                  value={isoVertsB}
                  onChange={(e) => setIsoVertsB(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                  placeholder="Vertices comma-separated"
                />
                <textarea
                  rows={4}
                  value={isoEdgesB}
                  onChange={(e) => setIsoEdgesB(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
              <div className="md:col-span-5">
                <label className="block text-[#5B6861] mb-1">Vertices (comma-separated, max 25)</label>
                <input
                  type="text"
                  value={customVerts}
                  onChange={(e) => setCustomVerts(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                />
                {tab === 'walks_paths' && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[#5B6861] mb-1">Source</label>
                      <input type="text" value={walkSource} onChange={(e) => setWalkSource(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono" />
                    </div>
                    <div>
                      <label className="block text-[#5B6861] mb-1">Target</label>
                      <input type="text" value={walkTarget} onChange={(e) => setWalkTarget(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono" />
                    </div>
                    <div>
                      <label className="block text-[#5B6861] mb-1">Max Len k</label>
                      <input type="number" min={1} max={8} value={walkLen} onChange={(e) => setWalkLen(Number(e.target.value))} className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono" />
                    </div>
                  </div>
                )}
              </div>
              <div className="md:col-span-7">
                <label className="block text-[#5B6861] mb-1">Edges (one pair `u v` per line)</label>
                <textarea
                  rows={4}
                  value={customEdges}
                  onChange={(e) => setCustomEdges(e.target.value)}
                  className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
          )
        }
        renderResultSummary={(res) => {
          const r = res.result as Record<string, unknown>;
          if (tab === 'planarity_coloring' && r.chromatic_polynomial_latex) {
            return (
              <div className="space-y-3 text-xs">
                <div className="rounded bg-[#F5F6F3] p-3">
                  <div className="text-[11px] font-semibold text-[#5B6861] mb-1">Chromatic Polynomial P(G, k)</div>
                  <LatexFormula latex={`P(G, k) = ${String(r.chromatic_polynomial_latex)}`} displayMode={false} />
                </div>
                <pre className="overflow-x-auto rounded bg-[#F5F6F3] p-3 font-mono text-xs text-[#151B18]">
                  {JSON.stringify(r, null, 2)}
                </pre>
              </div>
            );
          }
          return (
            <pre className="overflow-x-auto rounded bg-[#F5F6F3] p-3 font-mono text-xs text-[#151B18]">
              {JSON.stringify(r, null, 2)}
            </pre>
          );
        }}
        renderVisualization={(res) => {
          const vis = res.visualization as Record<string, unknown>;
          if (tab === 'grid_graph') {
            const degDist = (vis.degree_distribution as Array<{ degree: number; count: number }>) || [];
            const patchNodes = (vis.patch_nodes as Array<{ id: string }>) || [];
            const patchEdges = (vis.patch_edges as Array<[string, string]>) || [];
            const adjMatrix = (vis.adjacency_matrix as number[][]) || [];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-52">
                    <div className="text-[11px] font-semibold text-[#5B6861] mb-1">Vertex Degree Distribution</div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={degDist}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                        <XAxis dataKey="degree" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#1B4332" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <SimpleSvgGraph nodes={patchNodes.map((n) => n.id)} edges={patchEdges} title="Subgrid Patch Topology" />
                </div>
                {adjMatrix.length > 0 && (
                  <div className="overflow-x-auto">
                    <div className="text-[11px] font-semibold text-[#5B6861] mb-1">
                      Patch Adjacency Matrix ({adjMatrix.length}×{adjMatrix.length})
                    </div>
                    <pre className="font-mono text-[10px] leading-tight bg-[#F5F6F3] p-2.5 rounded">
                      {adjMatrix.map((row) => row.join(' ')).join('\n')}
                    </pre>
                  </div>
                )}
              </div>
            );
          }

          if (tab === 'isomorphism') {
            const ga = vis.graph_a as { nodes: string[]; edges: Array<[string, string]> };
            const gb = vis.graph_b as { nodes: string[]; edges: Array<[string, string]> };
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleSvgGraph nodes={ga?.nodes || []} edges={ga?.edges || []} title="Graph G₁" />
                <SimpleSvgGraph nodes={gb?.nodes || []} edges={gb?.edges || []} title="Graph G₂" />
              </div>
            );
          }

          if (tab === 'planarity_coloring') {
            const nodes = (vis.nodes as string[]) || [];
            const edges = (vis.edges as Array<[string, string]>) || [];
            const coloring = (vis.coloring as Record<string, number>) || {};
            const dualNodes = (vis.dual_nodes as string[]) || [];
            const dualEdges = (vis.dual_edges as Array<[string, string]>) || [];
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleSvgGraph nodes={nodes} edges={edges} coloring={coloring} title="Primal Graph G (Vertex Colored)" />
                {dualNodes.length > 0 && (
                  <SimpleSvgGraph nodes={dualNodes} edges={dualEdges} title="Dual Graph G* (Faces as Vertices)" />
                )}
              </div>
            );
          }

          const nodes = (vis.nodes as string[]) || [];
          const edges = (vis.edges as Array<[string, string]>) || [];
          const shortest = (vis.shortest_path as string[]) || (vis.hamiltonian_cycle as string[]) || (vis.euler_sequence as string[]) || [];
          const hl: Array<[string, string]> = [];
          for (let i = 0; i < shortest.length - 1; i += 1) {
            hl.push([shortest[i], shortest[i + 1]]);
          }
          return <SimpleSvgGraph nodes={nodes} edges={edges} highlightEdges={hl} title="Graph Topology & Highlighted Traversal" />;
        }}
      />
    </div>
  );
}
