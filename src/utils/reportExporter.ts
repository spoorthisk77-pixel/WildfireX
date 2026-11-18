import { jsPDF } from 'jspdf';
import type { ForestDatasetMeta, SimulationConfig, VoxelCell } from '../types/engine';

const ACRES_PER_VOXEL = 6.18;

export interface ReportMetrics {
  unburned: number;
  ignited: number;
  burning: number;
  extinguished: number;
  firebreak: number;
  water: number;
  activeFires: number;
  affectedBlocks: number;
  burnedAcres: number;
  containmentEfficiency: number;
  topBiomes: Array<{ biome: string; count: number }>;
  avgFuel: number | null;
  avgMoisture: number | null;
}

export function computeReportMetrics(cells: VoxelCell[], isInitialized: boolean): ReportMetrics {
  let unburned = 0;
  let ignited = 0;
  let burning = 0;
  let extinguished = 0;
  let firebreak = 0;
  let water = 0;
  const biomeCounts = new Map<string, number>();
  let fuelSum = 0;
  let fuelCnt = 0;
  let moistSum = 0;
  let moistCnt = 0;

  for (const c of cells) {
    if (c.state === 'unburned') unburned += 1;
    else if (c.state === 'ignited') ignited += 1;
    else if (c.state === 'burning') burning += 1;
    else if (c.state === 'extinguished') extinguished += 1;
    else if (c.state === 'firebreak') firebreak += 1;
    else if (c.state === 'water') water += 1;

    if (c.state !== 'dormant') {
      biomeCounts.set(c.biome, (biomeCounts.get(c.biome) || 0) + 1);
    }
    if (c.fuelDensity !== null) {
      fuelSum += c.fuelDensity;
      fuelCnt += 1;
    }
    if (c.moistureIndex !== null) {
      moistSum += c.moistureIndex;
      moistCnt += 1;
    }
  }

  const activeFires = burning + ignited;
  const affectedBlocks = activeFires + extinguished;
  const burnedAcres = Number((affectedBlocks * ACRES_PER_VOXEL).toFixed(1));
  const containmentEfficiency = !isInitialized
    ? 0
    : affectedBlocks === 0
      ? 100
      : Math.min(
          100,
          Math.round(
            ((extinguished + firebreak * 0.8) /
              Math.max(1, activeFires + extinguished + firebreak * 0.8)) *
              100,
          ),
        );

  const topBiomes = Array.from(biomeCounts.entries())
    .map(([biome, count]) => ({ biome, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    unburned,
    ignited,
    burning,
    extinguished,
    firebreak,
    water,
    activeFires,
    affectedBlocks,
    burnedAcres,
    containmentEfficiency,
    topBiomes,
    avgFuel: fuelCnt > 0 ? fuelSum / fuelCnt : null,
    avgMoisture: moistCnt > 0 ? moistSum / moistCnt : null,
  };
}

export interface StakeholderReportInput {
  title: string;
  notes: string;
  datasetMeta: ForestDatasetMeta | null;
  cells: VoxelCell[];
  generation: number;
  config: SimulationConfig;
  isInitialized: boolean;
  snapshotDataUrl: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load 3D viewport snapshot.'));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

export async function exportSimulationHighResPngReport(input: StakeholderReportInput): Promise<void> {
  const W = 2400;
  const H = 1500;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for image export.');

  const metrics = computeReportMetrics(input.cells, input.isInitialized);
  const generatedStr = new Date().toLocaleString();

  // Crisp light SaaS background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, W, H);

  // Header Bar
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, 168);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(0, 164, W, 4);

  ctx.fillStyle = '#0284C7';
  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('WILDFIRE PROPAGATION & GEOSPATIAL INTELLIGENCE PLATFORM', 72, 54);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 42px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(input.title || 'Stakeholder Simulation Briefing', 72, 108);

  ctx.fillStyle = '#475569';
  ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
  const sub = `${input.datasetMeta?.name || 'Active Sector'} (${input.datasetMeta?.region || 'Custom'})  ·  Generated ${generatedStr}`;
  ctx.fillText(sub, 72, 144);

  // 4 KPI Cards Row
  const kpis = [
    {
      label: 'BURNED ACREAGE',
      value: `${metrics.burnedAcres.toLocaleString()} ac`,
      sub: `${metrics.unburned} blocks unburned`,
      color: '#0F172A',
    },
    {
      label: 'ACTIVE FIRE COUNT',
      value: `${metrics.activeFires}`,
      sub: `${metrics.burning} burning · ${metrics.ignited} igniting`,
      color: '#DC2626',
    },
    {
      label: 'CONTAINMENT EFFICIENCY',
      value: `${metrics.containmentEfficiency}%`,
      sub: `${metrics.firebreak} firebreaks · ${metrics.extinguished} extinguished`,
      color: '#16A34A',
    },
    {
      label: 'ELAPSED TIME STEPS',
      value: `Step ${input.generation}`,
      sub: `Wind ${input.config.windSpeedKmh} km/h @ ${input.config.windAngleDeg}°`,
      color: '#0284C7',
    },
  ];

  const cardY = 204;
  const cardH = 166;
  const gap = 28;
  const cardW = (W - 144 - gap * 3) / 4;

  kpis.forEach((kpi, idx) => {
    const cx = 72 + idx * (cardW + gap);
    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 16, '#FFFFFF', '#E2E8F0');
    ctx.fillStyle = '#64748B';
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(kpi.label, cx + 28, cardY + 42);

    ctx.fillStyle = kpi.color;
    ctx.font = '700 46px "IBM Plex Mono", monospace';
    ctx.fillText(kpi.value, cx + 28, cardY + 102);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(kpi.sub, cx + 28, cardY + 140);
  });

  // Main Content Split: Left 3D Snapshot Card + Right Telemetry Details Card
  const bodyY = 402;
  const bodyH = 1004;
  const leftW = 1460;
  const rightX = 72 + leftW + 32;
  const rightW = W - 72 - rightX;

  drawRoundedRect(ctx, 72, bodyY, leftW, bodyH, 18, '#FFFFFF', '#E2E8F0');
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('3D Isometric Terrain & Flame Front Snapshot', 104, bodyY + 48);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `Grid Resolution: ${input.datasetMeta?.rows ?? 24}×${input.datasetMeta?.cols ?? 24} blocks  ·  Spread Stencil: ${
      input.config.neighborhood === 'moore_8' ? '8-Direction' : '4-Direction'
    }`,
    104,
    bodyY + 80,
  );

  // Snapshot Frame
  const frameX = 104;
  const frameY = bodyY + 104;
  const frameW = leftW - 64;
  const frameH = bodyH - 172;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 12, '#F1F5F9', '#CBD5E1');

  if (input.snapshotDataUrl) {
    try {
      const img = await loadImage(input.snapshotDataUrl);
      const scale = Math.min(frameW / img.width, frameH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = frameX + (frameW - dw) / 2;
      const dy = frameY + (frameH - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      ctx.fillStyle = '#64748B';
      ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('3D Viewport image unavailable for this snapshot.', frameX + 48, frameY + frameH / 2);
    }
  } else {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('No 3D viewport frame captured yet.', frameX + 48, frameY + frameH / 2);
  }

  // Legend below snapshot
  const legendItems = [
    { color: '#16A34A', label: 'Forest Canopy' },
    { color: '#0284C7', label: 'Water / Firebreak' },
    { color: '#D97706', label: 'Igniting Edge' },
    { color: '#DC2626', label: 'Active Fire' },
    { color: '#475569', label: 'Extinguished' },
  ];
  let lx = 104;
  const ly = bodyY + bodyH - 32;
  legendItems.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly - 16, 18, 18);
    ctx.fillStyle = '#334155';
    ctx.font = '500 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(item.label, lx + 26, ly);
    lx += ctx.measureText(item.label).width + 64;
  });

  // Right Panel: Environmental Conditions, Biome Distribution & Stakeholder Notes
  drawRoundedRect(ctx, rightX, bodyY, rightW, bodyH, 18, '#FFFFFF', '#E2E8F0');
  let ry = bodyY + 52;

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Atmospheric & Terrain Conditions', rightX + 36, ry);
  ry += 44;

  const envRows: Array<[string, string]> = [
    ['Wind Speed', `${input.config.windSpeedKmh} km/h`],
    ['Wind Compass Angle', `${input.config.windAngleDeg}°`],
    ['Relative Humidity', `${input.config.humidityPct}%`],
    ['Ambient Temperature', `${input.config.ambientTempC} °C`],
    ['Avg Fuel Density', metrics.avgFuel !== null ? metrics.avgFuel.toFixed(3) : '—'],
    ['Avg Moisture Index', metrics.avgMoisture !== null ? metrics.avgMoisture.toFixed(3) : '—'],
  ];

  envRows.forEach(([k, v]) => {
    drawRoundedRect(ctx, rightX + 36, ry, rightW - 72, 54, 8, '#F8FAFC', '#E2E8F0');
    ctx.fillStyle = '#475569';
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(k, rightX + 54, ry + 34);
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 21px "IBM Plex Mono", monospace';
    const vw = ctx.measureText(v).width;
    ctx.fillText(v, rightX + rightW - 54 - vw, ry + 34);
    ry += 66;
  });

  ry += 24;
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Dominant Land-Cover Strata', rightX + 36, ry);
  ry += 36;

  metrics.topBiomes.forEach((b) => {
    const pct = Math.round((b.count / Math.max(1, input.cells.length)) * 100);
    ctx.fillStyle = '#334155';
    ctx.font = '500 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(b.biome, rightX + 36, ry);
    const valStr = `${b.count} blocks (${pct}%)`;
    const vw = ctx.measureText(valStr).width;
    ctx.fillStyle = '#0284C7';
    ctx.font = '600 19px "IBM Plex Mono", monospace';
    ctx.fillText(valStr, rightX + rightW - 36 - vw, ry);
    ry += 38;
  });

  if (input.notes.trim()) {
    ry += 24;
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Executive Notes', rightX + 36, ry);
    ry += 24;
    drawRoundedRect(ctx, rightX + 36, ry, rightW - 72, Math.max(120, bodyY + bodyH - ry - 32), 10, '#F8FAFC', '#E2E8F0');
    ctx.fillStyle = '#334155';
    ctx.font = '400 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapLines(ctx, input.notes, rightW - 112).slice(0, 6);
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, rightX + 54, ry + 38 + idx * 30);
    });
  }

  // Trigger download
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode high-resolution PNG report.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wildfire_stakeholder_report_step_${input.generation}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

export async function exportSimulationPdfReport(input: StakeholderReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const metrics = computeReportMetrics(input.cells, input.isInitialized);

  // Page backdrop
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Header
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 27, 'F');
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 26.2, pageW, 0.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(2, 132, 199);
  doc.text('WILDFIRE PROPAGATION & GEOSPATIAL INTELLIGENCE PLATFORM', 12, 8);

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(input.title || 'Stakeholder Simulation Briefing', 12, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Sector: ${input.datasetMeta?.name || 'Custom Dataset'} (${input.datasetMeta?.region || 'Custom'})  |  Generated: ${new Date().toLocaleString()}`,
    12,
    22.5,
  );

  // 4 KPI Cards
  const kpis = [
    {
      label: 'BURNED ACREAGE',
      value: `${metrics.burnedAcres.toLocaleString()} ac`,
      sub: `${metrics.unburned} blocks unburned`,
      rgb: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'ACTIVE FIRE COUNT',
      value: `${metrics.activeFires}`,
      sub: `${metrics.burning} burning / ${metrics.ignited} igniting`,
      rgb: [220, 38, 38] as [number, number, number],
    },
    {
      label: 'CONTAINMENT EFFICIENCY',
      value: `${metrics.containmentEfficiency}%`,
      sub: `${metrics.firebreak} barriers / ${metrics.extinguished} contained`,
      rgb: [22, 163, 74] as [number, number, number],
    },
    {
      label: 'ELAPSED TIME STEPS',
      value: `Step ${input.generation}`,
      sub: `Wind ${input.config.windSpeedKmh} km/h at ${input.config.windAngleDeg} deg`,
      rgb: [2, 132, 199] as [number, number, number],
    },
  ];

  const cardY = 32;
  const cardH = 22;
  const gap = 4;
  const cardW = (pageW - 24 - gap * 3) / 4;

  kpis.forEach((kpi, idx) => {
    const x = 12 + idx * (cardW + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 4, cardY + 6);

    doc.setFontSize(14);
    doc.setTextColor(...kpi.rgb);
    doc.text(kpi.value, x + 4, cardY + 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 4, cardY + 19);
  });

  // Left: 3D Isometric Snapshot Card
  const bodyY = 58;
  const bodyH = 140;
  const leftW = 178;
  const rightX = 12 + leftW + 5;
  const rightW = pageW - 12 - rightX;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, bodyY, leftW, bodyH, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3D Isometric Terrain & Propagation Snapshot', 17, bodyY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Grid: ${input.datasetMeta?.rows ?? 24}x${input.datasetMeta?.cols ?? 24} blocks  |  Neighborhood: ${
      input.config.neighborhood === 'moore_8' ? '8-Direction' : '4-Direction'
    }`,
    17,
    bodyY + 13,
  );

  const imgBoxX = 17;
  const imgBoxY = bodyY + 16;
  const imgBoxW = leftW - 10;
  const imgBoxH = bodyH - 27;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 1.5, 1.5, 'FD');

  if (input.snapshotDataUrl) {
    try {
      const img = await loadImage(input.snapshotDataUrl);
      const scale = Math.min(imgBoxW / img.width, imgBoxH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = imgBoxX + (imgBoxW - dw) / 2;
      const dy = imgBoxY + (imgBoxH - dh) / 2;
      doc.addImage(input.snapshotDataUrl, 'PNG', dx, dy, dw, dh);
    } catch {
      doc.setFontSize(9);
      doc.text('3D viewport snapshot could not be embedded.', imgBoxX + 10, imgBoxY + imgBoxH / 2);
    }
  } else {
    doc.setFontSize(9);
    doc.text('No 3D viewport snapshot available.', imgBoxX + 10, imgBoxY + imgBoxH / 2);
  }

  // Snapshot legend
  const legY = bodyY + bodyH - 5;
  const legend = [
    { rgb: [22, 163, 74] as [number, number, number], text: 'Forest Canopy' },
    { rgb: [2, 132, 199] as [number, number, number], text: 'Water / Firebreak' },
    { rgb: [217, 119, 6] as [number, number, number], text: 'Igniting' },
    { rgb: [220, 38, 38] as [number, number, number], text: 'Active Fire' },
    { rgb: [71, 85, 105] as [number, number, number], text: 'Extinguished' },
  ];
  let lx = 17;
  legend.forEach((l) => {
    doc.setFillColor(...l.rgb);
    doc.rect(lx, legY - 2.6, 3, 3, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(l.text, lx + 4.5, legY);
    lx += doc.getTextWidth(l.text) + 10;
  });

  // Right Details Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightX, bodyY, rightW, bodyH, 2.5, 2.5, 'FD');

  let ry = bodyY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Atmospheric & Terrain Summary', rightX + 5, ry);
  ry += 5;

  const envRows: Array<[string, string]> = [
    ['Wind Speed', `${input.config.windSpeedKmh} km/h`],
    ['Compass Angle', `${input.config.windAngleDeg} deg`],
    ['Relative Humidity', `${input.config.humidityPct}%`],
    ['Ambient Temp', `${input.config.ambientTempC} C`],
    ['Avg Fuel Density', metrics.avgFuel !== null ? metrics.avgFuel.toFixed(3) : '—'],
    ['Avg Moisture Index', metrics.avgMoisture !== null ? metrics.avgMoisture.toFixed(3) : '—'],
  ];

  envRows.forEach(([k, v]) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(rightX + 5, ry, rightW - 10, 8, 1, 1, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(k, rightX + 8, ry + 5.3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(v, rightX + rightW - 8, ry + 5.3, { align: 'right' });
    ry += 9.5;
  });

  ry += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Land-Cover Distribution', rightX + 5, ry);
  ry += 5;

  metrics.topBiomes.forEach((b) => {
    const pct = Math.round((b.count / Math.max(1, input.cells.length)) * 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(b.biome, rightX + 5, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(2, 132, 199);
    doc.text(`${b.count} (${pct}%)`, rightX + rightW - 5, ry, { align: 'right' });
    ry += 5.5;
  });

  if (input.notes.trim()) {
    ry += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Stakeholder Notes', rightX + 5, ry);
    ry += 3;
    const boxH = Math.max(18, bodyY + bodyH - ry - 5);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(rightX + 5, ry, rightW - 10, boxH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const wrapped = doc.splitTextToSize(input.notes.trim(), rightW - 16) as string[];
    doc.text(wrapped.slice(0, 6), rightX + 8, ry + 5.5);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by Wildfire Propagation & Geospatial Intelligence Platform', 12, pageH - 5);

  doc.save(`wildfire_stakeholder_report_step_${input.generation}.pdf`);
}
