export interface DatasetMetadata {
  id: number;
  dataset_id: number;
  crs: string | null;
  epsg_code: number | null;
  bounds_json: Record<string, number> | null;
  wgs84_bounds_json: Record<string, number> | null;
  width: number | null;
  height: number | null;
  band_count: number | null;
  resolution_x: number | null;
  resolution_y: number | null;
  nodata_value: string | null;
  driver: string | null;
  dtype: string | null;
  geometry_types_json: string[] | null;
  feature_count: number | null;
  invalid_geometry_count: number | null;
  column_schema_json: Array<{
    name: string;
    dtype: string;
    non_null_count?: number;
    sample_values?: string[];
  }> | null;
  csv_mapping_json: Record<string, string | null> | null;
  preview_rows_json: Array<Record<string, unknown>> | null;
  landcover_summary_json: Record<string, number> | null;
  extra_json: Record<string, unknown> | null;
  updated_at: string;
}

export interface Dataset {
  id: number;
  name: string;
  description: string | null;
  file_format: 'csv' | 'geotiff' | 'geojson' | 'shapefile_zip' | string;
  original_filename: string;
  file_size_bytes: number;
  sha256_hash: string;
  data_source: string;
  provenance_notes: string | null;
  license_or_citation: string | null;
  acquisition_date: string | null;
  processing_status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  metadata_record: DatasetMetadata | null;
}

export interface DatasetPreview {
  dataset_id: number;
  file_format: string;
  columns: Array<{
    name: string;
    dtype: string;
    non_null_count?: number;
    sample_values?: string[];
  }>;
  rows: Array<Record<string, unknown>>;
  raster_summary: {
    crs: string | null;
    epsg_code: number | null;
    width: number | null;
    height: number | null;
    band_count: number | null;
    resolution_x: number | null;
    resolution_y: number | null;
    nodata_value: string | null;
    driver: string | null;
    dtype: string | null;
    bounds: Record<string, number> | null;
    wgs84_bounds: Record<string, number> | null;
    landcover_summary: Record<string, number> | null;
    band_stats: Array<{
      band: number;
      dtype: string;
      min: number | null;
      max: number | null;
      mean: number | null;
      valid_sample_ratio: number;
    }>;
  } | null;
  vector_summary: {
    crs: string | null;
    epsg_code: number | null;
    geometry_types: string[];
    feature_count: number | null;
    invalid_geometry_count: number | null;
    bounds: Record<string, number> | null;
    wgs84_bounds: Record<string, number> | null;
  } | null;
  csv_mapping: Record<string, string | null> | null;
}

export interface CsvMappingPayload {
  latitude_column: string;
  longitude_column: string;
  cell_id_column?: string | null;
  landcover_column?: string | null;
  elevation_column?: string | null;
  date_column?: string | null;
  time_column?: string | null;
  brightness_column?: string | null;
  frp_column?: string | null;
  confidence_column?: string | null;
  satellite_column?: string | null;
  instrument_column?: string | null;
  record_type_column?: string | null;
  crs: string;
  interpret_as: 'points' | 'grid_cells' | 'historical_observations';
}

export interface StudyArea {
  id: number;
  name: string;
  region_label: string;
  verification_status: 'awaiting_boundary_verification' | 'boundary_imported_unverified' | 'verified_boundary' | string;
  source_dataset_id: number | null;
  crs: string | null;
  area_sq_km: number | null;
  bounds_json: Record<string, number> | null;
  has_boundary_geometry: boolean;
  vertex_count: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties?: Record<string, unknown> | null;
    geometry: {
      type: string;
      coordinates: unknown;
    } | null;
  }>;
}

export interface StudyAreaDetail {
  study_area: StudyArea;
  geojson: GeoJsonFeatureCollection | null;
}

export interface ProcessedGrid {
  id: number;
  name: string;
  source_dataset_id: number;
  elevation_dataset_id: number | null;
  study_area_id: number | null;
  processing_job_id: number | null;
  crs: string;
  resolution_meters: number;
  source_resolution_native: string | null;
  rows: number;
  cols: number;
  cell_count: number;
  valid_cell_count: number;
  nodata_cell_count: number;
  bounds_json: Record<string, number>;
  clipped_to_boundary: boolean;
  status: string;
  metadata_json: {
    connectivity?: number;
    graph_nodes?: number;
    graph_edges?: number;
    connected_components?: number;
  } | null;
  created_at: string;
}

export interface GridCell {
  id: number;
  grid_id: number;
  cell_uid: string;
  row_idx: number;
  col_idx: number;
  center_lon: number;
  center_lat: number;
  native_x: number;
  native_y: number;
  geometry_wkt: string | null;
  landcover_code: number | null;
  landcover_category: string;
  original_source_value: string | null;
  source_dataset_id: number;
  spatial_resolution: number;
  crs: string;
  quality_status: string;
  elevation_m: number | null;
  vegetation_index: number | null;
  graph_vertex_id: number;
  neighbors_json: string[];
  metadata_json: Record<string, unknown> | null;
}

export interface GridCellsPage {
  grid: ProcessedGrid;
  cells: GridCell[];
  total_cells: number;
  landcover_breakdown: Record<string, number>;
}

export interface SourceAvailabilityItem {
  source_key: string;
  label: string;
  description: string;
  status: 'imported' | 'unavailable';
  dataset_count: number;
  latest_dataset_name: string | null;
  how_to_obtain: string;
}

export interface RecentActivityItem {
  id: number;
  job_type: string;
  status: string;
  dataset_id: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface DashboardStats {
  project_title: string;
  study_region: string;
  study_area_status: string;
  study_area_sq_km: number | null;
  dataset_count: number;
  processed_grid_count: number;
  processed_cell_count: number;
  valid_cell_count: number;
  historical_observation_count: number;
  experiment_count: number;
  data_quality_status: string;
  last_processing_activity: RecentActivityItem | null;
  recent_activities: RecentActivityItem[];
  recent_experiments: Array<{
    id: number;
    name: string;
    module_type: string;
    status: string;
    grid_id: number | null;
    created_at: string;
  }>;
  source_availability: SourceAvailabilityItem[];
  system_status: {
    api_online: boolean;
    database_engine: string;
    geospatial_engine: string;
    target_metric_crs: string;
  };
}

export interface ProcessingJob {
  id: number;
  job_type: string;
  dataset_id: number | null;
  study_area_id: number | null;
  status: string;
  parameters_json: Record<string, unknown> | null;
  result_summary_json: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ProcessingLog {
  id: number;
  job_id: number | null;
  dataset_id: number | null;
  level: string;
  stage: string;
  message: string;
  details_json: Record<string, unknown> | null;
  created_at: string;
}

export interface GeometryAuditResult {
  dataset_id: number;
  crs: string | null;
  feature_count: number;
  valid_geometry_count: number;
  invalid_geometry_count: number;
  invalid_feature_indices: number[];
  geometry_types: string[];
  bounds_wgs84: Record<string, number> | null;
}

export interface Experiment {
  id: number;
  name: string;
  module_type: string;
  description: string | null;
  grid_id: number | null;
  study_area_id: number | null;
  dataset_id: number | null;
  dataset_version_hash: string | null;
  status: string;
  results_json: Record<string, unknown> | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
  configurations: Array<{
    id: number;
    experiment_id: number;
    parameters_json: Record<string, unknown>;
    notes: string | null;
    created_at: string;
  }>;
}

export interface HistoricalObservation {
  id: number;
  source_dataset_id: number;
  source_dataset_name?: string | null;
  observation_date: string | null;
  observation_time?: string | null;
  observation_year?: number | null;
  observation_month?: number | null;
  record_type?: 'satellite_hotspot' | 'confirmed_incident' | string;
  is_duplicate?: boolean;
  latitude: number;
  longitude: number;
  brightness: number | null;
  frp: number | null;
  confidence: string | null;
  satellite: string | null;
  instrument: string | null;
  daynight: string | null;
}

export interface ObservationsAnalyticsResponse {
  total: number;
  unique_count: number;
  duplicate_count: number;
  invalid_rows_skipped: number;
  limit: number;
  offset: number;
  items: HistoricalObservation[];
  map_points: Array<{
    id: number;
    latitude: number;
    longitude: number;
    frp: number | null;
    observation_date: string | null;
    satellite: string | null;
    instrument: string | null;
    confidence: string | null;
    record_type: string;
    is_duplicate: boolean;
  }>;
  yearly_summary: Array<{
    year: number;
    count: number;
    unique_count: number;
    total_frp: number;
    mean_frp: number | null;
  }>;
  monthly_summary: Array<{
    year_month: string;
    year: number;
    month: number;
    month_label: string;
    count: number;
    unique_count: number;
    total_frp: number;
  }>;
  satellite_breakdown: Array<{
    satellite: string;
    instrument: string;
    count: number;
  }>;
  confidence_breakdown: Record<string, number>;
  record_type_breakdown: {
    satellite_hotspot: number;
    confirmed_incident: number;
  };
  provenance_summary: Array<{
    dataset_id: number;
    name: string;
    data_source: string;
    acquisition_date: string | null;
    license_or_citation: string | null;
    sha256_hash: string;
    observations_ingested: number | null;
    duplicate_rows_detected: number;
    invalid_rows_skipped: number;
    unparsed_date_rows: number;
  }>;
  bounds: { min_lat: number; max_lat: number; min_lon: number; max_lon: number } | null;
  study_area_geojson: GeoJsonFeatureCollection | null;
  filter_options: {
    years: number[];
    satellites: string[];
    confidences: string[];
    datasets: Array<{ id: number; name: string }>;
  };
  hotspot_distinction_note: string;
  disclaimer: string;
}

export interface DataQualityReport {
  datasets: Array<{
    dataset_id: number;
    name: string;
    original_filename: string;
    file_format: string;
    data_source: string;
    sha256_hash: string;
    acquisition_date: string;
    processing_status: string;
    processing_date: string;
    crs: string | null;
    spatial_resolution: string | null;
    nodata_percentage: number | null;
    invalid_record_count: number;
    duplicate_record_count: number;
    missing_attributes: string[];
    validation_warnings: string[];
  }>;
  grids: Array<{
    grid_id: number;
    name: string;
    source_dataset_name: string;
    crs: string;
    resolution_meters: number;
    processing_date: string;
    cell_count: number;
    valid_cell_count: number;
    nodata_cell_count: number;
    nodata_percentage: number;
    missing_attributes: string[];
    warnings: string[];
  }>;
  processing_history: Array<{
    id: number;
    job_type: string;
    status: string;
    dataset_id: number | null;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
  processing_logs: Array<{
    id: number;
    level: string;
    stage: string;
    message: string;
    dataset_id: number | null;
    created_at: string;
  }>;
  imputation_policy: string;
  disclaimer: string;
}

export interface ScenarioComparisonResponse {
  simulation_scenarios: Array<{
    simulation_id: number;
    name: string;
    data_classification: string;
    status: string;
    grid_id: number;
    grid_name: string;
    dataset_id: number | null;
    dataset_name: string | null;
    dataset_hash: string | null;
    grid_configuration: {
      rows: number | null;
      cols: number | null;
      resolution_meters: number | null;
      crs: string | null;
      clipped_to_boundary: boolean | null;
    };
    mathematical_assumptions: {
      neighborhood: string;
      boundary_condition: string;
      parameters: Record<string, unknown>;
    };
    initial_conditions: {
      seed_cells: string[];
      seed_count: number;
      initial_summary: Record<string, unknown>;
    };
    generation_count: number;
    max_generations: number;
    final_state_counts: Record<string, number>;
    affected_cell_count: number;
    graph_metrics: {
      vertices: number | null;
      edges: number | null;
      connected_components: number | null;
    };
    data_quality: {
      valid_cell_pct: number | null;
      nodata_cell_count: number | null;
    };
    processing_duration_ms: number | null;
    trajectory: Array<{
      generation: number;
      unburned: number;
      ignited: number;
      burning: number;
      extinguished: number;
      non_burnable: number;
      affected_cell_count: number;
    }>;
    created_at: string;
  }>;
  experiments: Array<{
    id: number;
    name: string;
    module_type: string;
    description: string | null;
    status: string;
    grid_id: number | null;
    grid_name: string | null;
    dataset_id: number | null;
    dataset_name: string | null;
    dataset_version_hash: string | null;
    parameters: Record<string, unknown>;
    results_json: Record<string, unknown> | null;
    executed_at: string | null;
    created_at: string;
  }>;
  disclaimer: string;
  scenario_notice: string;
}

export interface ReportRecord {
  id: number;
  title: string;
  report_type: string;
  experiment_id: number | null;
  grid_id: number | null;
  format: 'pdf' | 'csv' | string;
  has_file: boolean;
  summary_json: {
    generated_at?: string;
    study_region?: string;
    simulation_id?: number | null;
    dataset_count?: number;
    observation_count?: number;
    section_count?: number;
    sections?: Array<{ number: number; title: string; content: string }>;
  } | null;
  created_at: string;
}

export interface SyllabusCoverageResponse {
  total_modules: number;
  total_concepts: number;
  implemented_and_verified_count: number;
  direct_geospatial_applications: number;
  independent_educational_demos: number;
  modules: Array<{
    module_number: string;
    module_title: string;
    route_path: string;
    api_prefix: string;
    concepts: Array<{
      concept: string;
      status: string;
      application_scope: string;
      capabilities: string;
      verification_note: string;
    }>;
  }>;
}

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  database: string;
  study_region: string;
  libraries: Record<string, string>;
}

export interface MathStep {
  step_number: number;
  title: string;
  expression_latex?: string | null;
  explanation: string;
  value?: unknown;
}

export interface MathTopicResponse {
  topic_key: string;
  module: string;
  title: string;
  introduction: string;
  definition: string;
  formula_latex: string;
  inputs_echo: Record<string, unknown>;
  steps: MathStep[];
  result: Record<string, unknown>;
  visualization: Record<string, unknown>;
  verification: Record<string, unknown>;
  limitations: string;
}

export interface SimulationStep {
  id: number;
  simulation_id: number;
  generation: number;
  state_counts_json: Record<string, number>;
  affected_cell_count: number;
  newly_ignited_count: number;
  cell_states_json: Record<string, string>;
  metrics_json: Record<string, unknown> | null;
  created_at: string;
}

export interface SimulationRun {
  id: number;
  name: string;
  grid_id: number;
  experiment_id: number | null;
  data_classification: string;
  neighborhood: 'moore_8' | 'von_neumann_4' | string;
  boundary_condition: 'absorbing' | 'reflective' | 'periodic' | string;
  status: string;
  current_generation: number;
  max_generations: number;
  parameters_json: Record<string, unknown>;
  seed_cells_json: string[];
  initial_summary_json: Record<string, unknown>;
  disclaimer: string;
  created_at: string;
  updated_at: string;
}

export interface SimulationDetail {
  simulation: SimulationRun;
  steps: SimulationStep[];
}

export interface CoordinateConvertResponse {
  grid_id: number;
  mode: string;
  row_idx: number;
  col_idx: number;
  cell_uid: string | null;
  center_lon: number;
  center_lat: number;
  native_x: number;
  native_y: number;
  crs: string;
  inside_grid_bounds: boolean;
  note: string;
}

export interface GridNeighborhoodResponse {
  grid_id: number;
  cell_uid: string;
  row_idx: number;
  col_idx: number;
  neighborhood: string;
  boundary_condition: string;
  neighbor_details: Array<{
    direction: string;
    cell_uid: string;
    graph_vertex_id: number;
    row_idx: number;
    col_idx: number;
    landcover_category: string;
    quality_status: string;
    wrapped_or_reflected: boolean;
  }>;
  degree: number;
  boundary_clipped_directions: string[];
}

