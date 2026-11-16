import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../services/apiClient';
import type { MathTopicResponse, ProcessedGrid } from '../types/api';
import { MathLabSection } from '../components/MathLabSection';

type TreeTab = 'weighted_graph' | 'huffman' | 'binary_traversal' | 'tree_properties' | 'sorting';

export function TreesAlgorithmsPage() {
  const [tab, setTab] = useState<TreeTab>('weighted_graph');
  const [grids, setGrids] = useState<ProcessedGrid[]>([]);
  const [selectedGridId, setSelectedGridId] = useState<string>('');

  // Weighted graph algo
  const [algo, setAlgo] = useState<'kruskal' | 'prim' | 'dijkstra' | 'bfs_spanning_tree'>('kruskal');
  const [wgVerts, setWgVerts] = useState('A, B, C, D, E');
  const [wgEdges, setWgEdges] = useState('A B 2\nA C 5\nB C 1\nB D 4\nC D 2\nC E 6\nD E 3');
  const [srcV, setSrcV] = useState('A');
  const [dstV, setDstV] = useState('E');

  // Huffman
  const [huffText, setHuffText] = useState('A:45, B:13, C:12, D:16, E:9, F:5');
  const [huffSample, setHuffSample] = useState('ABACADEF');

  // Binary Tree
  const [btRoot, setBtRoot] = useState('N1');
  const [btLines, setBtLines] = useState('N1 N2 N3\nN2 N4 N5\nN3 - N6\nN4 - -\nN5 - -\nN6 - -');

  // Tree Properties
  const [treeVerts, setTreeVerts] = useState('R, A, B, C, D, E');
  const [treeEdges, setTreeEdges] = useState('R A 2\nR B 4\nA C 1\nA D 3\nB E 5');

  // Sorting
  const [sortAlgo, setSortAlgo] = useState<'merge_sort' | 'quick_sort' | 'insertion_sort'>('merge_sort');
  const [sortValues, setSortValues] = useState('8, 3, 5, 1, 9, 2, 7, 4');

  const [response, setResponse] = useState<MathTopicResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.listGrids().then(setGrids).catch(() => {});
  }, []);

  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      let res: MathTopicResponse;
      if (tab === 'weighted_graph') {
        if (selectedGridId) {
          res = await apiClient.runTreesAlgorithms('weighted-graph', {
            algorithm: algo,
            grid_id: Number(selectedGridId),
            patch_size: 4,
          });
        } else {
          const vertices = wgVerts.split(',').map((s) => s.trim()).filter(Boolean);
          const edges = wgEdges
            .split('\n')
            .map((l) => l.trim().split(/[\s,]+/))
            .filter((p) => p.length >= 2)
            .map((p) => ({ u: p[0], v: p[1], weight: p[2] ? Number(p[2]) : 1 }));
          res = await apiClient.runTreesAlgorithms('weighted-graph', {
            algorithm: algo,
            vertices,
            edges,
            source_vertex: srcV.trim(),
            target_vertex: dstV.trim(),
          });
        }
      } else if (tab === 'huffman') {
        const symbols = huffText
          .split(',')
          .map((item) => {
            const [sym, f] = item.split(':').map((s) => s.trim());
            return { symbol: sym, frequency: Number(f) };
          })
          .filter((x) => x.symbol && !Number.isNaN(x.frequency) && x.frequency > 0);
        res = await apiClient.runTreesAlgorithms('huffman', {
          symbols,
          sample_text: huffSample.trim() || undefined,
        });
      } else if (tab === 'binary_traversal') {
        const nodes = btLines
          .split('\n')
          .map((l) => l.trim().split(/\s+/))
          .filter((p) => p.length >= 3)
          .map((p) => ({
            label: p[0],
            left: p[1] === '-' ? null : p[1],
            right: p[2] === '-' ? null : p[2],
          }));
        res = await apiClient.runTreesAlgorithms('binary-traversal', { root: btRoot.trim(), nodes });
      } else if (tab === 'tree_properties') {
        const vertices = treeVerts.split(',').map((s) => s.trim()).filter(Boolean);
        const edges = treeEdges
          .split('\n')
          .map((l) => l.trim().split(/[\s,]+/))
          .filter((p) => p.length >= 2)
          .map((p) => ({ u: p[0], v: p[1], weight: p[2] ? Number(p[2]) : 1 }));
        res = await apiClient.runTreesAlgorithms('tree-properties', { vertices, edges, root: vertices[0] });
      } else {
        const values = sortValues
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n));
        res = await apiClient.runTreesAlgorithms('sorting', { algorithm: sortAlgo, values });
      }
      setResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algorithm execution failed.');
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    void execute();
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-lg border border-[#DCE2DC] bg-white p-2 text-xs">
        {(
          [
            ['weighted_graph', 'Kruskal / Prim / Dijkstra / BFS'],
            ['huffman', 'Huffman Optimal Prefix Codes'],
            ['binary_traversal', 'Binary Tree Traversals'],
            ['tree_properties', 'Tree & Rooted Properties'],
            ['sorting', 'Sorting Trace'],
          ] as Array<[TreeTab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === k ? 'bg-[#1B4332] text-white' : 'text-[#4B5851] hover:bg-[#F5F6F3]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <MathLabSection
        title="Trees & Graph Algorithms Laboratory"
        introduction="Step-by-step execution of Minimum Spanning Trees (Kruskal, Prim), Dijkstra shortest paths, optimal Huffman prefix coding, binary tree traversals, and sorting algorithms."
        definition="Evaluated using NetworkX and deterministic algorithm traces over custom weighted graphs or bounded landscape subgrid patches."
        formulaLatex={String.raw`w(T^*) = \min_{T} \sum_{e \in T} w(e), \qquad |E(T)| = |V| - 1`}
        executing={executing}
        error={error}
        response={response}
        onExecute={execute}
        inputPanel={
          <div className="text-xs space-y-3">
            {tab === 'weighted_graph' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4 space-y-2">
                  <div>
                    <label className="block text-[#5B6861] mb-1">Algorithm</label>
                    <select value={algo} onChange={(e) => setAlgo(e.target.value as typeof algo)} className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5">
                      <option value="kruskal">Kruskal MST</option>
                      <option value="prim">Prim MST</option>
                      <option value="dijkstra">Dijkstra Shortest Path</option>
                      <option value="bfs_spanning_tree">BFS Spanning Tree</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#5B6861] mb-1">Source Graph</label>
                    <select value={selectedGridId} onChange={(e) => setSelectedGridId(e.target.value)} className="w-full rounded border border-[#C6CFC8] bg-white px-2.5 py-1.5">
                      <option value="">Custom Weighted Graph</option>
                      {grids.map((g) => (
                        <option key={g.id} value={g.id}>
                          Grid Patch: {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!selectedGridId && algo === 'dijkstra' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[#5B6861] mb-1">Source</label>
                        <input type="text" value={srcV} onChange={(e) => setSrcV(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono" />
                      </div>
                      <div>
                        <label className="block text-[#5B6861] mb-1">Target</label>
                        <input type="text" value={dstV} onChange={(e) => setDstV(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2 py-1 font-mono" />
                      </div>
                    </div>
                  )}
                </div>
                {!selectedGridId && (
                  <div className="md:col-span-8 space-y-2">
                    <input type="text" value={wgVerts} onChange={(e) => setWgVerts(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                    <textarea rows={4} value={wgEdges} onChange={(e) => setWgEdges(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-2.5 py-1.5 font-mono" />
                  </div>
                )}
              </div>
            )}

            {tab === 'huffman' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#5B6861] mb-1">Symbol:Frequency Pairs</label>
                  <input type="text" value={huffText} onChange={(e) => setHuffText(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Sample String to Encode</label>
                  <input type="text" value={huffSample} onChange={(e) => setHuffSample(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {tab === 'binary_traversal' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[#5B6861] mb-1">Root Label</label>
                  <input type="text" value={btRoot} onChange={(e) => setBtRoot(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[#5B6861] mb-1">Node Definitions (`Node Left Right`, `-` for null)</label>
                  <textarea rows={4} value={btLines} onChange={(e) => setBtLines(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {tab === 'tree_properties' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#5B6861] mb-1">Vertices (first = root)</label>
                  <input type="text" value={treeVerts} onChange={(e) => setTreeVerts(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Weighted Edges (`u v w`)</label>
                  <textarea rows={3} value={treeEdges} onChange={(e) => setTreeEdges(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}

            {tab === 'sorting' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-[#5B6861] mb-1">Algorithm</label>
                  <select value={sortAlgo} onChange={(e) => setSortAlgo(e.target.value as typeof sortAlgo)} className="w-full rounded border border-[#C6CFC8] bg-white px-3 py-1.5">
                    <option value="merge_sort">Merge Sort Θ(n log n)</option>
                    <option value="quick_sort">Quick Sort</option>
                    <option value="insertion_sort">Insertion Sort O(n²)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5B6861] mb-1">Input Array (max 16 values)</label>
                  <input type="text" value={sortValues} onChange={(e) => setSortValues(e.target.value)} className="w-full rounded border border-[#C6CFC8] px-3 py-1.5 font-mono" />
                </div>
              </div>
            )}
          </div>
        }
        renderVisualization={(res) => {
          const vis = res.visualization as Record<string, unknown>;
          if (tab === 'huffman') {
            const table = (vis.code_table as Array<{ symbol: string; frequency: number; codeword: string; length: number }>) || [];
            return (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#E7EBE6] text-[#5B6861]">
                    <th className="py-1.5">Symbol</th>
                    <th className="py-1.5 text-right">Freq</th>
                    <th className="py-1.5 text-right">Codeword</th>
                    <th className="py-1.5 text-right">Bits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F2EF]">
                  {table.map((row) => (
                    <tr key={row.symbol}>
                      <td className="py-1.5 font-semibold">{row.symbol}</td>
                      <td className="py-1.5 text-right">{row.frequency}</td>
                      <td className="py-1.5 text-right text-[#1B4332] font-semibold">{row.codeword}</td>
                      <td className="py-1.5 text-right">{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }

          if (tab === 'sorting') {
            const series = (vis.series as Array<{ index: number; value: number }>) || [];
            return (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE6" />
                    <XAxis dataKey="index" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#1B4332" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          }

          if (tab === 'weighted_graph') {
            const nodes = (vis.nodes as Array<{ id: string }>) || [];
            const allEdges = (vis.all_edges as Array<[string, string, number]>) || [];
            const selectedEdges = (vis.selected_edges as Array<[string, string]>) || [];
            const n = nodes.length;
            const pos: Record<string, { x: number; y: number }> = {};
            nodes.forEach((nd, i) => {
              const ang = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
              pos[nd.id] = { x: 160 + 82 * Math.cos(ang), y: 115 + 82 * Math.sin(ang) };
            });
            const isSel = (u: string, v: string) =>
              selectedEdges.some(([a, b]) => (a === u && b === v) || (a === v && b === u));
            return (
              <div className="rounded border border-[#E7EBE6] bg-[#F5F6F3] p-3">
                <svg viewBox="0 0 320 230" className="w-full h-56">
                  {allEdges.map(([u, v, w], idx) => {
                    const p1 = pos[u];
                    const p2 = pos[v];
                    if (!p1 || !p2) return null;
                    const sel = isSel(u, v);
                    return (
                      <g key={idx}>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={sel ? '#B42318' : '#AAB4AD'} strokeWidth={sel ? 2.8 : 1.2} />
                        <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 3} fontSize="8.5" fill="#151B18" textAnchor="middle">
                          {w}
                        </text>
                      </g>
                    );
                  })}
                  {nodes.map((nd) => {
                    const p = pos[nd.id];
                    return (
                      <g key={nd.id}>
                        <circle cx={p.x} cy={p.y} r={12} fill="#1B4332" stroke="#FFFFFF" strokeWidth={1.5} />
                        <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="9.5" fill="#FFFFFF" fontFamily="IBM Plex Mono, monospace">
                          {nd.id.length > 5 ? nd.id.slice(-4) : nd.id}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          }

          return null;
        }}
      />
    </div>
  );
}
