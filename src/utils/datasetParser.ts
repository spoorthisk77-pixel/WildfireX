import type { BiomeClass, ParsedDatasetPreview, VoxelCell, VoxelState } from '../types/engine';

export const DEFAULT_GRID_DIM = 24;

export function createDormantGrid(rows = DEFAULT_GRID_DIM, cols = DEFAULT_GRID_DIM): VoxelCell[] {
  const cells: VoxelCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({
        id: `V-${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
        row: r,
        col: c,
        lat: null,
        lon: null,
        elevation: null,
        fuelDensity: null,
        moistureIndex: null,
        temperature: null,
        biome: 'Dormant',
        state: 'dormant',
        burnTicksRemaining: 0,
        ignitionGeneration: null,
      });
    }
  }
  return cells;
}

function simpleHashHex(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < Math.min(text.length, 40000); i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function pickField(record: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(record);
  for (const cand of candidates) {
    const exact = keys.find((k) => k.toLowerCase() === cand);
    if (exact !== undefined && record[exact] !== undefined && record[exact] !== '') {
      return record[exact];
    }
  }
  for (const cand of candidates) {
    const partial = keys.find((k) => k.toLowerCase().includes(cand));
    if (partial !== undefined && record[partial] !== undefined && record[partial] !== '') {
      return record[partial];
    }
  }
  return undefined;
}

function normalizeBiome(raw: unknown, fuel: number | null, moisture: number | null): BiomeClass {
  const s = String(raw || '').toLowerCase();
  if (s.includes('water') || s.includes('river') || s.includes('riparian') || s.includes('lake')) {
    return 'Riparian / Water';
  }
  if (s.includes('barren') || s.includes('bare') || s.includes('rock') || s.includes('alpine')) {
    return 'Alpine / Barren';
  }
  if (s.includes('rainforest') || s.includes('amazon') || s.includes('evergreen')) {
    return 'Tropical Rainforest';
  }
  if (s.includes('boreal') || s.includes('taiga') || s.includes('conifer') || s.includes('spruce')) {
    return 'Boreal Conifer';
  }
  if (s.includes('peat') || s.includes('bog') || s.includes('wetland')) {
    return 'Peatland / Bog';
  }
  if (s.includes('scrub') || s.includes('shrub') || s.includes('savanna') || s.includes('grass')) {
    return 'Dry Scrubland';
  }
  if (s.includes('deciduous') || s.includes('ghats') || s.includes('tree') || s.includes('forest')) {
    return 'Moist Deciduous';
  }
  if (fuel !== null && fuel <= 0.05) return 'Alpine / Barren';
  if (moisture !== null && moisture >= 0.85 && (fuel === null || fuel < 0.2)) return 'Riparian / Water';
  if (fuel !== null && fuel >= 0.72) return 'Tropical Rainforest';
  if (fuel !== null && fuel >= 0.45) return 'Moist Deciduous';
  return 'Dry Scrubland';
}

function deriveVoxelState(biome: BiomeClass, fuel: number | null): VoxelState {
  if (biome === 'Riparian / Water') return 'water';
  if (biome === 'Alpine / Barren' || (fuel !== null && fuel <= 0.03)) return 'barren';
  return 'unburned';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function extractRecordsFromCsv(text: string): { rows: Array<Record<string, unknown>>; columns: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error('CSV dataset must contain a header row and at least one data record.');
  }
  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const vals = parseCsvLine(lines[i]);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const raw = vals[idx] ?? '';
      const num = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
      rec[h] = num;
    });
    rows.push(rec);
  }
  return { rows, columns: headers };
}

function centroidOfGeometry(geometry: { type?: string; coordinates?: unknown } | null): { lat: number; lon: number } | null {
  if (!geometry || !geometry.coordinates) return null;
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    const lon = toNum(geometry.coordinates[0]);
    const lat = toNum(geometry.coordinates[1]);
    if (lat !== null && lon !== null) return { lat, lon };
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const ring = geometry.coordinates[0] as Array<[number, number]>;
    if (Array.isArray(ring) && ring.length > 0) {
      let sLon = 0;
      let sLat = 0;
      let cnt = 0;
      ring.forEach((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
          sLon += Number(pt[0]);
          sLat += Number(pt[1]);
          cnt += 1;
        }
      });
      if (cnt > 0) return { lat: sLat / cnt, lon: sLon / cnt };
    }
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const firstPoly = geometry.coordinates[0] as Array<Array<[number, number]>>;
    if (Array.isArray(firstPoly) && firstPoly[0]) {
      return centroidOfGeometry({ type: 'Polygon', coordinates: firstPoly });
    }
  }
  return null;
}

function extractRecordsFromJsonOrGeoJson(
  text: string,
): { rows: Array<Record<string, unknown>>; format: 'json' | 'geojson'; regionHint?: string } {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    const rows = parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
    return { rows, format: 'json' };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      const rows: Array<Record<string, unknown>> = [];
      for (const feat of obj.features) {
        if (!feat || typeof feat !== 'object') continue;
        const f = feat as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
        const props = { ...(f.properties || {}) };
        const c = centroidOfGeometry(f.geometry || null);
        if (c) {
          if (props.latitude === undefined && props.lat === undefined) props.latitude = c.lat;
          if (props.longitude === undefined && props.lon === undefined) props.longitude = c.lon;
        }
        rows.push(props);
      }
      return {
        rows,
        format: 'geojson',
        regionHint: typeof obj.name === 'string' ? obj.name : undefined,
      };
    }
    const arrayField = ['cells', 'records', 'data', 'voxels', 'items', 'features'].find((k) => Array.isArray(obj[k]));
    if (arrayField) {
      const arr = (obj[arrayField] as unknown[]).filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
      return {
        rows: arr,
        format: 'json',
        regionHint: typeof obj.region === 'string' ? obj.region : typeof obj.name === 'string' ? obj.name : undefined,
      };
    }
  }
  throw new Error('JSON must be an array of voxel records, an object with a records/cells array, or a GeoJSON FeatureCollection.');
}

export function parseUniversalDataset(
  filename: string,
  rawText: string,
  datasetLabel?: string,
  regionOverride?: string,
): ParsedDatasetPreview {
  const lower = filename.toLowerCase();
  let format: 'csv' | 'json' | 'geojson' = 'csv';
  let records: Array<Record<string, unknown>> = [];
  let columnNames: string[] = [];
  let regionHint: string | undefined;

  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    const res = extractRecordsFromJsonOrGeoJson(rawText);
    records = res.rows;
    format = lower.endsWith('.geojson') ? 'geojson' : res.format;
    regionHint = res.regionHint;
    if (records.length > 0) {
      columnNames = Array.from(new Set(records.slice(0, 20).flatMap((r) => Object.keys(r))));
    }
  } else {
    const res = extractRecordsFromCsv(rawText);
    records = res.rows;
    columnNames = res.columns;
    format = 'csv';
  }

  if (records.length === 0) {
    throw new Error('Dataset contains zero readable records.');
  }

  // Detect explicit grid indices vs geographic coordinates
  let hasRowCol = true;
  let maxRow = 0;
  let maxCol = 0;
  const parsedCoords: Array<{
    rec: Record<string, unknown>;
    row: number | null;
    col: number | null;
    lat: number | null;
    lon: number | null;
    elev: number | null;
    fuel: number | null;
    moisture: number | null;
    temp: number | null;
    biome: BiomeClass;
  }> = [];

  let skippedCount = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const rec of records) {
    const rowVal = toNum(pickField(rec, ['row', 'row_idx', 'grid_y', 'iy']));
    const colVal = toNum(pickField(rec, ['col', 'col_idx', 'grid_x', 'ix']));
    const latVal = toNum(pickField(rec, ['latitude', 'lat', 'center_lat', 'y']));
    const lonVal = toNum(pickField(rec, ['longitude', 'lon', 'lng', 'center_lon', 'x']));

    if ((rowVal === null || colVal === null) && (latVal === null || lonVal === null)) {
      skippedCount += 1;
      continue;
    }

    if (rowVal === null || colVal === null) {
      hasRowCol = false;
    } else {
      maxRow = Math.max(maxRow, Math.floor(rowVal));
      maxCol = Math.max(maxCol, Math.floor(colVal));
    }

    if (latVal !== null && lonVal !== null) {
      if (latVal < -90 || latVal > 90 || lonVal < -180 || lonVal > 180) {
        skippedCount += 1;
        continue;
      }
      minLat = Math.min(minLat, latVal);
      maxLat = Math.max(maxLat, latVal);
      minLon = Math.min(minLon, lonVal);
      maxLon = Math.max(maxLon, lonVal);
    }

    const elev = toNum(pickField(rec, ['elevation', 'elev', 'altitude', 'dem', 'height']));
    let fuel = toNum(pickField(rec, ['fuel_density', 'fuel', 'biomass', 'ndvi', 'vegetation_index']));
    if (fuel !== null && fuel > 1.0 && fuel <= 100.0) fuel = fuel / 100.0;
    if (fuel !== null) fuel = Math.max(0, Math.min(1, fuel));

    let moisture = toNum(pickField(rec, ['moisture_index', 'moisture', 'humidity', 'ndwi']));
    if (moisture !== null && moisture > 1.0 && moisture <= 100.0) moisture = moisture / 100.0;
    if (moisture !== null) moisture = Math.max(0, Math.min(1, moisture));

    const temp = toNum(pickField(rec, ['temperature', 'temp', 'lst', 'surface_temp']));
    const rawBiome = pickField(rec, ['biome', 'landcover', 'land_cover', 'vegetation', 'class', 'category']);
    const biome = normalizeBiome(rawBiome, fuel, moisture);

    parsedCoords.push({
      rec,
      row: rowVal !== null ? Math.floor(rowVal) : null,
      col: colVal !== null ? Math.floor(colVal) : null,
      lat: latVal,
      lon: lonVal,
      elev,
      fuel,
      moisture,
      temp,
      biome,
    });
  }

  if (parsedCoords.length === 0) {
    throw new Error('No records contained valid grid (row, col) or WGS84 (latitude, longitude) coordinates.');
  }

  const targetRows = hasRowCol ? Math.min(32, Math.max(8, maxRow + 1)) : DEFAULT_GRID_DIM;
  const targetCols = hasRowCol ? Math.min(32, Math.max(8, maxCol + 1)) : DEFAULT_GRID_DIM;

  // Map records onto target grid buckets
  const bucketMap = new Map<string, typeof parsedCoords>();
  const latSpan = Number.isFinite(minLat) && maxLat > minLat ? maxLat - minLat : 0.1;
  const lonSpan = Number.isFinite(minLon) && maxLon > minLon ? maxLon - minLon : 0.1;

  for (const item of parsedCoords) {
    let r = item.row ?? 0;
    let c = item.col ?? 0;
    if (!hasRowCol && item.lat !== null && item.lon !== null) {
      const normLat = (maxLat - item.lat) / latSpan;
      const normLon = (item.lon - minLon) / lonSpan;
      r = Math.max(0, Math.min(targetRows - 1, Math.floor(normLat * (targetRows - 1e-6))));
      c = Math.max(0, Math.min(targetCols - 1, Math.floor(normLon * (targetCols - 1e-6))));
    }
    if (r < 0 || r >= targetRows || c < 0 || c >= targetCols) continue;
    const key = `${r}:${c}`;
    const arr = bucketMap.get(key) || [];
    arr.push(item);
    bucketMap.set(key, arr);
  }

  const cells: VoxelCell[] = [];
  const elevs: number[] = [];
  const fuels: number[] = [];
  const moistures: number[] = [];
  const temps: number[] = [];

  for (let r = 0; r < targetRows; r += 1) {
    for (let c = 0; c < targetCols; c += 1) {
      const key = `${r}:${c}`;
      const bucket = bucketMap.get(key);
      if (!bucket || bucket.length === 0) {
        cells.push({
          id: `V-${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
          row: r,
          col: c,
          lat: Number.isFinite(minLat) ? maxLat - (r / Math.max(1, targetRows - 1)) * latSpan : null,
          lon: Number.isFinite(minLon) ? minLon + (c / Math.max(1, targetCols - 1)) * lonSpan : null,
          elevation: null,
          fuelDensity: null,
          moistureIndex: null,
          temperature: null,
          biome: 'Dormant',
          state: 'dormant',
          burnTicksRemaining: 0,
          ignitionGeneration: null,
        });
        continue;
      }

      const avg = (vals: Array<number | null>) => {
        const valid = vals.filter((v): v is number => v !== null);
        if (valid.length === 0) return null;
        return valid.reduce((a, b) => a + b, 0) / valid.length;
      };

      const lat = avg(bucket.map((b) => b.lat));
      const lon = avg(bucket.map((b) => b.lon));
      const elevation = avg(bucket.map((b) => b.elev));
      const fuelDensity = avg(bucket.map((b) => b.fuel));
      const moistureIndex = avg(bucket.map((b) => b.moisture));
      const temperature = avg(bucket.map((b) => b.temp));
      const biome = bucket[0].biome;
      const state = deriveVoxelState(biome, fuelDensity);

      if (elevation !== null) elevs.push(elevation);
      if (fuelDensity !== null) fuels.push(fuelDensity);
      if (moistureIndex !== null) moistures.push(moistureIndex);
      if (temperature !== null) temps.push(temperature);

      cells.push({
        id: `V-${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
        row: r,
        col: c,
        lat,
        lon,
        elevation,
        fuelDensity,
        moistureIndex,
        temperature,
        biome,
        state,
        burnTicksRemaining: 0,
        ignitionGeneration: null,
      });
    }
  }

  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    meta: {
      id: `ds_${Date.now().toString(36)}`,
      name: datasetLabel || filename.replace(/\.[^/.]+$/, ''),
      region: regionOverride || regionHint || 'Global Custom Forest Sector',
      sourceFormat: format,
      rows: targetRows,
      cols: targetCols,
      importedAt: new Date().toISOString(),
      recordCount: parsedCoords.length,
      skippedCount,
      bounds: Number.isFinite(minLat) ? { minLat, maxLat, minLon, maxLon } : null,
      elevationRange: elevs.length ? { min: Math.min(...elevs), max: Math.max(...elevs) } : null,
      meanFuelDensity: mean(fuels),
      meanMoisture: mean(moistures),
      meanTemperature: mean(temps),
      sha256Preview: simpleHashHex(rawText),
    },
    cells,
    rawColumnNames: columnNames,
    sampleRows: records.slice(0, 8),
  };
}

/**
 * Generates real formatted CSV / GeoJSON / JSON strings for global forest sectors
 * ONLY when explicitly requested by the user inside the Dataset Ingestion Portal.
 */
export function buildGlobalForestPresetFile(
  preset: 'amazon' | 'western_ghats' | 'bannerghatta' | 'boreal',
): { filename: string; content: string; label: string; region: string } {
  const N = 24;
  if (preset === 'amazon') {
    const features: Array<Record<string, unknown>> = [];
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        const lat = -3.02 - r * 0.008;
        const lon = -60.18 + c * 0.008;
        const riverCurve = 11.5 + Math.sin(c * 0.32) * 3.1;
        const distRiver = Math.abs(r - riverCurve);
        const isRiver = distRiver < 1.35;
        const elev = isRiver ? 34 : Math.round(42 + Math.sin(r * 0.25) * 14 + Math.cos(c * 0.22) * 12 + distRiver * 1.4);
        const fuel = isRiver ? 0.02 : Number(Math.min(0.98, 0.72 + Math.sin(r * 0.4 + c * 0.3) * 0.16).toFixed(3));
        const moisture = isRiver ? 0.96 : Number(Math.max(0.28, 0.56 - distRiver * 0.018 + Math.cos(r * 0.3) * 0.08).toFixed(3));
        const temp = isRiver ? 25.4 : Number((31.2 + (1 - moisture) * 6.5).toFixed(1));
        const biome = isRiver ? 'Riparian / Water' : fuel > 0.78 ? 'Tropical Rainforest' : 'Moist Deciduous';
        features.push({
          type: 'Feature',
          properties: { row: r, col: c, elevation: elev, fuel_density: fuel, moisture_index: moisture, temperature: temp, biome },
          geometry: { type: 'Point', coordinates: [Number(lon.toFixed(5)), Number(lat.toFixed(5))] },
        });
      }
    }
    return {
      filename: 'amazon_manaus_sector.geojson',
      label: 'Amazon Basin — Manaus Tropical Canopy',
      region: 'Amazonas, Brazil (-3.1°S, -60.1°W)',
      content: JSON.stringify({ type: 'FeatureCollection', name: 'Amazonas Manaus Sector', features }, null, 2),
    };
  }

  if (preset === 'western_ghats') {
    const lines = ['row,col,latitude,longitude,elevation,fuel_density,moisture_index,temperature,biome'];
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        const lat = 12.08 - r * 0.006;
        const lon = 76.08 + c * 0.006;
        const isKabini = r > 18 && c > 13 && c < 22;
        const isRockyRidge = r < 4 && c < 6;
        const elev = isKabini
          ? 710
          : Math.round(740 + (N - r) * 11 + Math.sin(c * 0.35) * 38 + (isRockyRidge ? 140 : 0));
        const fuel = isKabini
          ? 0.0
          : isRockyRidge
            ? 0.08
            : Number(Math.max(0.24, Math.min(0.95, 0.58 + Math.sin(r * 0.28 + c * 0.41) * 0.24)).toFixed(3));
        const moisture = isKabini
          ? 0.98
          : isRockyRidge
            ? 0.14
            : Number(Math.max(0.15, Math.min(0.82, 0.36 + (r > 13 ? 0.18 : -0.08) + Math.cos(c * 0.3) * 0.1)).toFixed(3));
        const temp = isKabini ? 24.5 : Number((32.5 + (1 - moisture) * 7.2 - (elev - 750) * 0.006).toFixed(1));
        const biome = isKabini
          ? 'Riparian / Water'
          : isRockyRidge
            ? 'Alpine / Barren'
            : fuel < 0.48
              ? 'Dry Scrubland'
              : 'Moist Deciduous';
        lines.push(`${r},${c},${lat.toFixed(5)},${lon.toFixed(5)},${elev},${fuel},${moisture},${temp},${biome}`);
      }
    }
    return {
      filename: 'western_ghats_nagarhole.csv',
      label: 'Western Ghats — Nagarhole Escarpment',
      region: 'Karnataka, India (12.0°N, 76.1°E)',
      content: lines.join('\n'),
    };
  }

  if (preset === 'bannerghatta') {
    const lines = ['row,col,latitude,longitude,elevation,fuel_density,moisture_index,temperature,biome'];
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        const lat = 12.82 - r * 0.005;
        const lon = 77.56 + c * 0.005;
        const isSuvarnamukhi = Math.abs(c - (12 + Math.cos(r * 0.28) * 2.5)) < 1.1;
        const isGraniteOutcrop = r > 17 && c < 6;
        const elev = isSuvarnamukhi
          ? 830
          : Math.round(860 + Math.sin(r * 0.3) * 45 + Math.cos(c * 0.26) * 35 + (isGraniteOutcrop ? 115 : 0));
        const fuel = isSuvarnamukhi
          ? 0.02
          : isGraniteOutcrop
            ? 0.06
            : Number(Math.max(0.28, Math.min(0.92, 0.54 + Math.cos(r * 0.31 - c * 0.22) * 0.25)).toFixed(3));
        const moisture = isSuvarnamukhi
          ? 0.94
          : isGraniteOutcrop
            ? 0.16
            : Number(Math.max(0.18, Math.min(0.75, 0.34 + Math.sin(r * 0.22) * 0.12)).toFixed(3));
        const temp = isSuvarnamukhi ? 26.0 : Number((33.4 + (1 - moisture) * 6.8).toFixed(1));
        const biome = isSuvarnamukhi
          ? 'Riparian / Water'
          : isGraniteOutcrop
            ? 'Alpine / Barren'
            : fuel < 0.5
              ? 'Dry Scrubland'
              : 'Moist Deciduous';
        lines.push(`${r},${c},${lat.toFixed(5)},${lon.toFixed(5)},${elev},${fuel},${moisture},${temp},${biome}`);
      }
    }
    return {
      filename: 'bannerghatta_corridor.csv',
      label: 'Bannerghatta — Dry Deciduous Corridor',
      region: 'Bengaluru South, India (12.8°N, 77.6°E)',
      content: lines.join('\n'),
    };
  }

  // Boreal Taiga JSON
  const cells: Array<Record<string, unknown>> = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const lat = 57.12 - r * 0.007;
      const lon = -111.55 + c * 0.011;
      const ridge = Math.sin(r * 0.24 - c * 0.18);
      const isBog = ridge < -0.68;
      const isGranite = ridge > 0.85 && r < 8;
      const elev = Math.round(280 + (ridge + 1) * 75 + (c * 2.5));
      const fuel = isBog ? 0.38 : isGranite ? 0.04 : Number((0.64 + Math.cos(r * 0.35 + c * 0.25) * 0.22).toFixed(3));
      const moisture = isBog ? 0.78 : isGranite ? 0.12 : Number((0.28 + Math.sin(c * 0.4) * 0.09).toFixed(3));
      const temp = Number((21.0 + (1 - moisture) * 8.0 - (elev - 300) * 0.005).toFixed(1));
      const biome = isGranite ? 'Alpine / Barren' : isBog ? 'Peatland / Bog' : 'Boreal Conifer';
      cells.push({
        row: r,
        col: c,
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lon.toFixed(5)),
        elevation: elev,
        fuel_density: fuel,
        moisture_index: moisture,
        temperature: temp,
        biome,
      });
    }
  }
  return {
    filename: 'boreal_athabasca_taiga.json',
    label: 'Boreal Taiga — Athabasca Peatland',
    region: 'Alberta, Canada (57.1°N, -111.5°W)',
    content: JSON.stringify({ name: 'Athabasca Boreal Sector', region: 'Alberta, Canada', cells }, null, 2),
  };
}
