import React, { useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Download, FileDown, Upload } from 'lucide-react';
import { useEngine } from '../context/EngineContext';
import { LightDoughnutChart, LightLineChart, LightScatterChart } from '../components/ChartsLight';

function downloadFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TelemetryPage() {
  const navigate = useNavigate();
  const { openUploadModal, openReportModal } = useOutletContext<{
    openUploadModal: () => void;
    openReportModal: () => void;
  }>();
  const { datasetMeta, cells, telemetryHistory, snapshots, isInitialized } = useEngine();

  const stateChartData = useMemo(
    () => ({
      labels: telemetryHistory.map((p) => `Step ${p.generation}`),
      datasets: [
        {
          label: 'Total Affected Blocks',
          data: telemetryHistory.map((p) => p.affectedTotal),
          borderColor: '#0284C7',
          backgroundColor: 'rgba(2, 132, 199, 0.10)',
          fill: true,
          borderWidth: 2,
          tension: 0.25,
        },
        {
          label: 'Active Fire Blocks',
          data: telemetryHistory.map((p) => p.burning),
          borderColor: '#DC2626',
          borderWidth: 1.8,
          tension: 0.25,
        },
        {
          label: 'Spread Rate (blocks/step)',
          data: telemetryHistory.map((p) => p.spreadRateCellsPerTick),
          borderColor: '#16A34A',
          borderWidth: 1.8,
          tension: 0.25,
        },
      ],
    }),
    [telemetryHistory],
  );

  const biomeDoughnutData = useMemo(() => {
    const counts = new Map<string, number>();
    cells.forEach((c) => {
      if (c.state === 'dormant') return;
      counts.set(c.biome, (counts.get(c.biome) || 0) + 1);
    });
    const labels = Array.from(counts.keys());
    return {
      labels,
      datasets: [
        {
          data: labels.map((l) => counts.get(l) || 0),
          backgroundColor: ['#16A34A', '#0284C7', '#D97706', '#0EA5E9', '#64748B', '#22C55E'],
          borderColor: '#FFFFFF',
          borderWidth: 2,
        },
      ],
    };
  }, [cells]);

  const scatterData = useMemo(
    () => ({
      datasets: [
        {
          label: 'Elevation vs. Fuel Density',
          data: cells
            .filter((c) => c.elevation !== null && c.fuelDensity !== null)
            .slice(0, 300)
            .map((c) => ({ x: c.elevation as number, y: c.fuelDensity as number })),
          backgroundColor: 'rgba(22, 163, 74, 0.65)',
          pointRadius: 3.5,
        },
      ],
    }),
    [cells],
  );

  const exportCsv = () => {
    const headers = [
      'id',
      'row',
      'col',
      'lat',
      'lon',
      'elevation_m',
      'fuel_density',
      'moisture_index',
      'temperature_c',
      'biome',
      'state',
    ];
    const rows = cells.map((c) =>
      [
        c.id,
        c.row,
        c.col,
        c.lat ?? '',
        c.lon ?? '',
        c.elevation ?? '',
        c.fuelDensity ?? '',
        c.moistureIndex ?? '',
        c.temperature ?? '',
        `"${c.biome}"`,
        c.state,
      ].join(','),
    );
    downloadFile('wildfire_terrain_telemetry.csv', [headers.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
  };

  const exportJson = () => {
    downloadFile(
      'wildfire_telemetry_bundle.json',
      JSON.stringify({ datasetMeta, telemetryHistory, snapshots, cells }, null, 2),
      'application/json',
    );
  };

  if (!isInitialized) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-4">
        <div className="text-base font-semibold text-slate-900">
          Please upload a forest dataset (CSV, JSON, GeoJSON) to initialize simulation
        </div>
        <p className="mx-auto max-w-md text-xs text-slate-500 leading-relaxed">
          Import a forest dataset and run the simulation to view historical progression charts, biome breakdowns, and exportable CSV/JSON telemetry reports.
        </p>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1]"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Forest Dataset</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/ingestion')}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Open Dataset Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Simulation Telemetry & Data Export</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Dataset: {datasetMeta?.name} · {telemetryHistory.length} recorded steps · {snapshots.length} saved snapshots
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openReportModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#0369A1] transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>Export Report (PDF / PNG)</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:border-[#0284C7] hover:text-[#0284C7]"
          >
            <Download className="h-3.5 w-3.5 text-[#0284C7]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:border-[#16A34A] hover:text-[#16A34A]"
          >
            <Download className="h-3.5 w-3.5 text-[#16A34A]" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Burn Progression & Spread Rate Over Time
          </h2>
          <div className="h-64">
            <LightLineChart data={stateChartData} yLabel="Blocks" />
          </div>
        </section>

        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Land-Cover Biome Composition</h2>
          <div className="h-64">
            <LightDoughnutChart data={biomeDoughnutData} />
          </div>
        </section>

        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Elevation vs. Canopy Fuel Density
          </h2>
          <div className="h-64">
            <LightScatterChart data={scatterData} xLabel="Elevation (m)" yLabel="Fuel Density" />
          </div>
        </section>

        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Saved Simulation Snapshots ({snapshots.length})
          </h2>
          {snapshots.length === 0 ? (
            <p className="text-xs text-slate-500">
              Click "Save Snapshot" inside the Simulation Arena to archive wind, humidity, and burned area runs for side-by-side comparison.
            </p>
          ) : (
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Snapshot</th>
                    <th className="px-3 py-2 text-right font-semibold">Steps</th>
                    <th className="px-3 py-2 text-right font-semibold">Affected</th>
                    <th className="px-3 py-2 text-right font-semibold">Conditions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{s.label}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{s.generations}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-red-600">{s.affectedCells}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#0284C7]">
                        {s.windSpeedKmh} km/h · {s.humidityPct}% RH
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
