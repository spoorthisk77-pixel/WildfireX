export interface NavItem {
  id: string;
  label: string;
  path: string;
  group: 'Core Workspace' | 'Geospatial Data' | 'Mathematical Models' | 'Analysis & System';
  phase: 'active' | 'foundation' | 'phase2';
  shortDescription: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/',
    group: 'Core Workspace',
    phase: 'active',
    shortDescription: 'Study region status, dataset readiness, and recent geospatial jobs.',
  },
  {
    id: 'forest-explorer',
    label: 'Forest Explorer',
    path: '/forest-explorer',
    group: 'Core Workspace',
    phase: 'active',
    shortDescription: '2D cellular grid inspection, overlays, cell search, land-cover legend, and neighbor topology.',
  },
  {
    id: 'landscape-3d',
    label: '3D Landscape',
    path: '/landscape-3d',
    group: 'Core Workspace',
    phase: 'active',
    shortDescription: 'Interactive voxel-block terrain and land-cover model derived from processed grids.',
  },
  {
    id: 'datasets',
    label: 'Dataset Centre',
    path: '/datasets',
    group: 'Geospatial Data',
    phase: 'active',
    shortDescription: 'Upload, validate, map CSV columns, and track provenance of geospatial files.',
  },
  {
    id: 'geospatial',
    label: 'Geospatial Laboratory',
    path: '/geospatial',
    group: 'Geospatial Data',
    phase: 'active',
    shortDescription: 'Boundary upload, CRS reprojection, clipping, geometry audits, and grid generation.',
  },
  {
    id: 'observations',
    label: 'Historical Observations',
    path: '/observations',
    group: 'Geospatial Data',
    phase: 'active',
    shortDescription: 'NASA FIRMS hotspots, duplicate/invalid audits, temporal summaries, map, and exports.',
  },
  {
    id: 'data-quality',
    label: 'Data Quality',
    path: '/data-quality',
    group: 'Geospatial Data',
    phase: 'active',
    shortDescription: 'Dataset provenance, CRS, NoData percentages, invalid/duplicate counts, and audit history.',
  },
  {
    id: 'cellular-automata',
    label: 'Cellular Automata Studio',
    path: '/cellular-automata',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'Controlled discrete-time cellular automata on real grids with step/pause/reset history.',
  },
  {
    id: 'graph-theory',
    label: 'Graph Theory Explorer',
    path: '/graph-theory',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'Adjacency graph G=(V,E), Handshaking Lemma, isomorphism, Euler/Hamiltonian, planarity & coloring.',
  },
  {
    id: 'combinatorics',
    label: 'Combinatorics Laboratory',
    path: '/combinatorics',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'Sum/product rules, permutations, combinations, pigeonhole, inclusion-exclusion, derangements & rook polynomials.',
  },
  {
    id: 'mathematical-logic',
    label: 'Mathematical Logic',
    path: '/mathematical-logic',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'Safe AST truth tables, logical equivalence, De Morgan, inference rules & finite quantifiers.',
  },
  {
    id: 'generating-functions',
    label: 'Generating Functions',
    path: '/generating-functions',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'SymPy-backed OGF, EGF, integer partitions, and classical counting sequences.',
  },
  {
    id: 'recurrence-relations',
    label: 'Recurrence Relations',
    path: '/recurrence-relations',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: '1st- and 2nd-order linear recurrence solving with symbolic closed forms and numerical verification.',
  },
  {
    id: 'trees-algorithms',
    label: 'Trees and Algorithms',
    path: '/trees-algorithms',
    group: 'Mathematical Models',
    phase: 'active',
    shortDescription: 'Kruskal/Prim MST, Dijkstra shortest paths, Huffman coding, binary tree traversals & sorting.',
  },
  {
    id: 'scenario-comparison',
    label: 'Scenario Comparison',
    path: '/scenario-comparison',
    group: 'Analysis & System',
    phase: 'active',
    shortDescription: 'Side-by-side comparison of controlled simulations, experiment configurations, and grid metrics.',
  },
  {
    id: 'reports',
    label: 'Reports and Exports',
    path: '/reports',
    group: 'Analysis & System',
    phase: 'active',
    shortDescription: '15-section academic PDF/CSV research reports, grid CSV tables, and provenance manifests.',
  },
  {
    id: 'syllabus-coverage',
    label: 'Syllabus Coverage',
    path: '/syllabus-coverage',
    group: 'Analysis & System',
    phase: 'active',
    shortDescription: 'Audited verification matrix across Discrete Mathematics Modules I through V.',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    group: 'Analysis & System',
    phase: 'active',
    shortDescription: 'Study area verification controls, CRS defaults, and backend API diagnostics.',
  },
];

export const NAV_GROUPS: NavItem['group'][] = [
  'Core Workspace',
  'Geospatial Data',
  'Mathematical Models',
  'Analysis & System',
];
