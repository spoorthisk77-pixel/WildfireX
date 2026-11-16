export interface LandcoverVisualSpec {
  code: number | null;
  label: string;
  hex: string;
  canopyHeight: number;
  roughness: number;
  description: string;
}

export const LANDCOVER_PALETTE: Record<string, LandcoverVisualSpec> = {
  'Tree cover': {
    code: 10,
    label: 'Tree cover',
    hex: '#1E4D33',
    canopyHeight: 2.2,
    roughness: 0.85,
    description: 'Closed or open canopy forest',
  },
  Shrubland: {
    code: 20,
    label: 'Shrubland',
    hex: '#6B7A47',
    canopyHeight: 1.05,
    roughness: 0.9,
    description: 'Woody shrubs and deciduous scrub',
  },
  Grassland: {
    code: 30,
    label: 'Grassland',
    hex: '#97AA63',
    canopyHeight: 0.55,
    roughness: 0.92,
    description: 'Herbaceous savanna and grassy clearings',
  },
  Cropland: {
    code: 40,
    label: 'Cropland',
    hex: '#C4AF62',
    canopyHeight: 0.65,
    roughness: 0.88,
    description: 'Cultivated perimeter parcels',
  },
  'Built-up': {
    code: 50,
    label: 'Built-up',
    hex: '#747876',
    canopyHeight: 0.9,
    roughness: 0.72,
    description: 'Roads, ranger stations, and settlements',
  },
  'Bare / sparse vegetation': {
    code: 60,
    label: 'Bare / sparse vegetation',
    hex: '#B3A89A',
    canopyHeight: 0.3,
    roughness: 0.95,
    description: 'Exposed soil, rock outcrops, or firelines',
  },
  'Snow and ice': {
    code: 70,
    label: 'Snow and ice',
    hex: '#D8E2E4',
    canopyHeight: 0.4,
    roughness: 0.4,
    description: 'Snow or ice cover',
  },
  'Permanent water bodies': {
    code: 80,
    label: 'Permanent water bodies',
    hex: '#2F6B84',
    canopyHeight: 0.18,
    roughness: 0.18,
    description: 'Kabini reservoir, rivers, and tanks',
  },
  'Herbaceous wetland': {
    code: 90,
    label: 'Herbaceous wetland',
    hex: '#4A8374',
    canopyHeight: 0.42,
    roughness: 0.65,
    description: 'Seasonal marshland and riparian margins',
  },
  Mangroves: {
    code: 95,
    label: 'Mangroves',
    hex: '#256050',
    canopyHeight: 1.6,
    roughness: 0.82,
    description: 'Mangrove canopy',
  },
  'Moss and lichen': {
    code: 100,
    label: 'Moss and lichen',
    hex: '#899875',
    canopyHeight: 0.28,
    roughness: 0.95,
    description: 'Bryophyte ground cover',
  },
  NoData: {
    code: null,
    label: 'NoData',
    hex: '#D5D9D3',
    canopyHeight: 0.12,
    roughness: 0.95,
    description: 'Outside boundary or masked pixel',
  },
};

export function getLandcoverVisual(category: string): LandcoverVisualSpec {
  if (LANDCOVER_PALETTE[category]) {
    return LANDCOVER_PALETTE[category];
  }
  const lower = category.toLowerCase();
  if (lower.includes('tree') || lower.includes('forest')) return LANDCOVER_PALETTE['Tree cover'];
  if (lower.includes('shrub') || lower.includes('scrub')) return LANDCOVER_PALETTE['Shrubland'];
  if (lower.includes('grass')) return LANDCOVER_PALETTE['Grassland'];
  if (lower.includes('crop') || lower.includes('agri')) return LANDCOVER_PALETTE['Cropland'];
  if (lower.includes('water') || lower.includes('river')) return LANDCOVER_PALETTE['Permanent water bodies'];
  if (lower.includes('built') || lower.includes('urban')) return LANDCOVER_PALETTE['Built-up'];
  if (lower.includes('bare')) return LANDCOVER_PALETTE['Bare / sparse vegetation'];
  if (lower.includes('nodata')) return LANDCOVER_PALETTE['NoData'];

  return {
    code: null,
    label: category,
    hex: '#5D7466',
    canopyHeight: 0.85,
    roughness: 0.85,
    description: 'Observed spatial feature category',
  };
}
