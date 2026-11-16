import type {
  CsvMappingPayload,
  DashboardStats,
  DataQualityReport,
  Dataset,
  DatasetPreview,
  Experiment,
  GeometryAuditResult,
  GridCellsPage,
  HealthStatus,
  HistoricalObservation,
  ObservationsAnalyticsResponse,
  ProcessedGrid,
  ProcessingJob,
  ProcessingLog,
  ReportRecord,
  ScenarioComparisonResponse,
  StudyArea,
  StudyAreaDetail,
  SyllabusCoverageResponse,
} from '../types/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') {
        detail = data.detail;
      } else if (Array.isArray(data?.detail)) {
        detail = data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ');
      }
    } catch {
      const txt = await res.text().catch(() => '');
      if (txt) detail = txt;
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  getHealth: () => request<HealthStatus>('/api/health'),

  getDashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),

  getHistoricalObservations: (limit = 500) =>
    request<{ total: number; items: HistoricalObservation[] }>(`/api/dashboard/observations?limit=${limit}`),

  listDatasets: () => request<{ items: Dataset[]; total: number }>('/api/datasets'),

  uploadDataset: (formData: FormData) =>
    request<Dataset>('/api/datasets/upload', {
      method: 'POST',
      body: formData,
    }),

  getDatasetPreview: (datasetId: number) =>
    request<DatasetPreview>(`/api/datasets/${datasetId}/preview`),

  applyCsvMapping: (datasetId: number, payload: CsvMappingPayload) =>
    request<Dataset>(`/api/datasets/${datasetId}/csv-mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  deleteDataset: (datasetId: number) =>
    request<{ deleted: boolean; id: number; name: string }>(`/api/datasets/${datasetId}`, {
      method: 'DELETE',
    }),

  getActiveStudyArea: () => request<StudyAreaDetail>('/api/study-areas/active'),

  uploadStudyBoundary: (formData: FormData) =>
    request<StudyAreaDetail>('/api/study-areas/boundary-upload', {
      method: 'POST',
      body: formData,
    }),

  updateStudyAreaVerification: (
    studyAreaId: number,
    payload: { verification_status: string; notes?: string },
  ) =>
    request<StudyArea>(`/api/study-areas/${studyAreaId}/verification`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  reprojectDataset: (datasetId: number, targetCrs: string) =>
    request<Dataset>('/api/geospatial/reproject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, target_crs: targetCrs }),
    }),

  clipDataset: (datasetId: number, studyAreaId?: number) =>
    request<Dataset>('/api/geospatial/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, study_area_id: studyAreaId ?? null }),
    }),

  auditGeometry: (datasetId: number) =>
    request<GeometryAuditResult>(`/api/geospatial/audit/${datasetId}`),

  listJobs: (limit = 30) => request<ProcessingJob[]>(`/api/geospatial/jobs?limit=${limit}`),

  listLogs: (limit = 50) => request<ProcessingLog[]>(`/api/geospatial/logs?limit=${limit}`),

  listGrids: () => request<ProcessedGrid[]>('/api/grids'),

  generateGrid: (payload: {
    name: string;
    source_dataset_id: number;
    elevation_dataset_id?: number | null;
    study_area_id?: number | null;
    clip_to_boundary: boolean;
    target_resolution_meters: number;
    max_dimension: number;
    connectivity: number;
  }) =>
    request<ProcessedGrid>('/api/grids/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getGridCells: (
    gridId: number,
    params?: { limit?: number; offset?: number; landcover_filter?: string; include_nodata?: boolean },
  ) => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.landcover_filter) qs.set('landcover_filter', params.landcover_filter);
    if (params?.include_nodata !== undefined) qs.set('include_nodata', String(params.include_nodata));
    return request<GridCellsPage>(`/api/grids/${gridId}/cells?${qs.toString()}`);
  },

  deleteGrid: (gridId: number) =>
    request<{ deleted: boolean; id: number; name: string }>(`/api/grids/${gridId}`, {
      method: 'DELETE',
    }),

  listExperiments: () => request<Experiment[]>('/api/experiments'),

  createExperiment: (payload: {
    name: string;
    module_type: string;
    description?: string;
    grid_id?: number | null;
    study_area_id?: number | null;
    dataset_id?: number | null;
    parameters?: Record<string, unknown>;
    notes?: string;
  }) =>
    request<Experiment>('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  executeExperiment: (experimentId: number) =>
    request<Experiment>(`/api/experiments/${experimentId}/execute`, {
      method: 'POST',
    }),

  getExperimentExportUrl: (experimentId: number, format: 'json' | 'csv' = 'json') =>
    `/api/experiments/${experimentId}/export?format=${format}`,

  getScenarioComparison: () => request<ScenarioComparisonResponse>('/api/experiments/compare/summary'),

  deleteExperiment: (experimentId: number) =>
    request<{ deleted: boolean; id: number }>(`/api/experiments/${experimentId}`, {
      method: 'DELETE',
    }),

  queryObservations: (params?: {
    limit?: number;
    offset?: number;
    dataset_id?: number;
    year?: number;
    month?: number;
    satellite?: string;
    confidence?: string;
    record_type?: string;
    exclude_duplicates?: boolean;
    min_lat?: number;
    max_lat?: number;
    min_lon?: number;
    max_lon?: number;
    clip_to_study_area?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, String(v));
        }
      });
    }
    return request<ObservationsAnalyticsResponse>(`/api/observations?${qs.toString()}`);
  },

  getObservationsExportUrl: (
    format: 'csv' | 'json',
    params?: Record<string, string | number | boolean | undefined>,
  ) => {
    const qs = new URLSearchParams({ format });
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, String(v));
        }
      });
    }
    return `/api/observations/export?${qs.toString()}`;
  },

  getDataQuality: () => request<DataQualityReport>('/api/data-quality'),

  listReports: () => request<ReportRecord[]>('/api/reports'),

  generateReport: (payload: {
    title: string;
    format: 'pdf' | 'csv';
    report_type?: string;
    grid_id?: number | null;
    simulation_id?: number | null;
    experiment_id?: number | null;
  }) =>
    request<ReportRecord>('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getReportDownloadUrl: (reportId: number) => `/api/reports/${reportId}/download`,

  deleteReport: (reportId: number) =>
    request<{ deleted: boolean; id: number }>(`/api/reports/${reportId}`, {
      method: 'DELETE',
    }),

  getSyllabusCoverage: () => request<SyllabusCoverageResponse>('/api/syllabus'),

  // Grid Coordinate & Neighborhood Engine
  convertGridCoordinates: (payload: {
    grid_id: number;
    mode: 'grid_to_geo' | 'geo_to_grid';
    row_idx?: number;
    col_idx?: number;
    longitude?: number;
    latitude?: number;
  }) =>
    request<import('../types/api').CoordinateConvertResponse>('/api/cellular-automata/coords/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  inspectGridNeighborhood: (payload: {
    grid_id: number;
    cell_uid: string;
    neighborhood: 'moore_8' | 'von_neumann_4';
    boundary_condition: 'absorbing' | 'reflective' | 'periodic';
  }) =>
    request<import('../types/api').GridNeighborhoodResponse>('/api/cellular-automata/neighborhood/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Controlled Cellular Automata Laboratory
  listSimulations: (gridId?: number) =>
    request<import('../types/api').SimulationRun[]>(
      gridId !== undefined ? `/api/cellular-automata/simulations?grid_id=${gridId}` : '/api/cellular-automata/simulations',
    ),

  createSimulation: (payload: Record<string, unknown>) =>
    request<import('../types/api').SimulationDetail>('/api/cellular-automata/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getSimulationDetail: (simulationId: number) =>
    request<import('../types/api').SimulationDetail>(`/api/cellular-automata/simulations/${simulationId}`),

  stepSimulation: (simulationId: number, steps = 1) =>
    request<import('../types/api').SimulationDetail>(`/api/cellular-automata/simulations/${simulationId}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps }),
    }),

  updateSimulationStatus: (simulationId: number, status: 'initialized' | 'running' | 'paused' | 'completed') =>
    request<import('../types/api').SimulationRun>(`/api/cellular-automata/simulations/${simulationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),

  resetSimulation: (simulationId: number) =>
    request<import('../types/api').SimulationDetail>(`/api/cellular-automata/simulations/${simulationId}/reset`, {
      method: 'POST',
    }),

  deleteSimulation: (simulationId: number) =>
    request<{ deleted: boolean; id: number; name: string }>(`/api/cellular-automata/simulations/${simulationId}`, {
      method: 'DELETE',
    }),

  // Module IV: Graph Theory
  inspectGridGraph: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/graph-theory/grid-inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  checkGraphIsomorphism: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/graph-theory/isomorphism', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  analyzeWalksPaths: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/graph-theory/walks-paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  analyzeEulerHamiltonian: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/graph-theory/euler-hamiltonian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  analyzePlanarityColoring: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/graph-theory/planarity-coloring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Module I: Combinatorics
  solveCombinatorics: (payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>('/api/math/combinatorics/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Module II: Mathematical Logic
  evaluateLogic: (endpoint: 'propositional' | 'equivalence' | 'demorgan' | 'inference' | 'predicate-quantifier', payload: Record<string, unknown>) =>
    request<import('../types/api').MathTopicResponse>(`/api/math/logic/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Module III: Generating Functions & Recurrence Relations
  solveGeneratingOrRecurrence: (
    endpoint: 'ogf' | 'egf' | 'partitions' | 'sequences' | 'recurrence',
    payload: Record<string, unknown>,
  ) =>
    request<import('../types/api').MathTopicResponse>(`/api/math/generating-recurrence/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // Module V: Trees & Algorithms
  runTreesAlgorithms: (
    endpoint: 'tree-properties' | 'binary-traversal' | 'huffman' | 'weighted-graph' | 'sorting',
    payload: Record<string, unknown>,
  ) =>
    request<import('../types/api').MathTopicResponse>(`/api/math/trees-algorithms/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};

