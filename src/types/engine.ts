export type VoxelState =
  | 'dormant'
  | 'unburned'
  | 'ignited'
  | 'burning'
  | 'extinguished'
  | 'firebreak'
  | 'water'
  | 'barren';

export type BiomeClass =
  | 'Dormant'
  | 'Tropical Rainforest'
  | 'Moist Deciduous'
  | 'Dry Scrubland'
  | 'Boreal Conifer'
  | 'Peatland / Bog'
  | 'Riparian / Water'
  | 'Alpine / Barren';

export interface VoxelCell {
  id: string;
  row: number;
  col: number;
  lat: number | null;
  lon: number | null;
  elevation: number | null;
  fuelDensity: number | null;
  moistureIndex: number | null;
  temperature: number | null;
  biome: BiomeClass;
  state: VoxelState;
  burnTicksRemaining: number;
  ignitionGeneration: number | null;
}

export interface ForestDatasetMeta {
  id: string;
  name: string;
  region: string;
  sourceFormat: 'csv' | 'json' | 'geojson';
  rows: number;
  cols: number;
  importedAt: string;
  recordCount: number;
  skippedCount: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  elevationRange: { min: number; max: number } | null;
  meanFuelDensity: number | null;
  meanMoisture: number | null;
  meanTemperature: number | null;
  sha256Preview: string;
}

export interface SimulationConfig {
  windSpeedKmh: number;
  windAngleDeg: number;
  humidityPct: number;
  ambientTempC: number;
  neighborhood: 'moore_8' | 'von_neumann_4';
  boundaryCondition: 'absorbing' | 'reflective' | 'periodic';
  burnDurationTicks: number;
  baseSpreadCoeff: number;
  tickIntervalMs: number;
}

export interface SimulationTelemetryPoint {
  generation: number;
  unburned: number;
  ignited: number;
  burning: number;
  extinguished: number;
  firebreak: number;
  affectedTotal: number;
  spreadRateCellsPerTick: number;
  meanActiveTempC: number;
}

export interface SimulationSnapshot {
  id: string;
  label: string;
  datasetName: string;
  generations: number;
  affectedCells: number;
  windSpeedKmh: number;
  windAngleDeg: number;
  humidityPct: number;
  capturedAt: string;
}

export type AnalyticalTabId =
  | 'resource-deployment'
  | 'ignition-rules'
  | 'spread-forecasting'
  | 'network-zoning'
  | 'evacuation-routing';

export interface ParsedDatasetPreview {
  meta: ForestDatasetMeta;
  cells: VoxelCell[];
  rawColumnNames: string[];
  sampleRows: Array<Record<string, unknown>>;
}
