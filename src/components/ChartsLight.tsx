import React from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartData,
  type ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line, Scatter } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

const SANS_FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const MONO_FONT = "'IBM Plex Mono', monospace";

export function LightLineChart({
  data,
  yLabel,
}: {
  data: ChartData<'line'>;
  yLabel?: string;
}) {
  const opts: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 180 },
    plugins: {
      legend: {
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: 11, weight: 500 },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        titleColor: '#0F172A',
        bodyColor: '#334155',
        padding: 10,
        titleFont: { family: SANS_FONT, size: 12, weight: 600 },
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
        ticks: { color: '#64748B', font: { family: MONO_FONT, size: 10 }, maxRotation: 0 },
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        ticks: { color: '#64748B', font: { family: MONO_FONT, size: 10 } },
        title: yLabel
          ? { display: true, text: yLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } }
          : undefined,
      },
    },
  };
  return (
    <div className="relative w-full h-full">
      <Line data={data} options={opts} />
    </div>
  );
}

export function LightBarChart({
  data,
  yLabel,
  stacked = false,
}: {
  data: ChartData<'bar'>;
  yLabel?: string;
  stacked?: boolean;
}) {
  const opts: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 180 },
    plugins: {
      legend: {
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: 11, weight: 500 },
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        titleColor: '#0F172A',
        bodyColor: '#334155',
        padding: 10,
        titleFont: { family: SANS_FONT, size: 12, weight: 600 },
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
        ticks: { color: '#64748B', font: { family: SANS_FONT, size: 11 } },
      },
      y: {
        stacked,
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        ticks: { color: '#64748B', font: { family: MONO_FONT, size: 10 } },
        title: yLabel
          ? { display: true, text: yLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } }
          : undefined,
      },
    },
  };
  return (
    <div className="relative w-full h-full">
      <Bar data={data} options={opts} />
    </div>
  );
}

export function LightDoughnutChart({ data }: { data: ChartData<'doughnut'> }) {
  const opts: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '64%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: 11, weight: 500 },
          boxWidth: 10,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        titleColor: '#0F172A',
        bodyColor: '#334155',
        padding: 10,
        titleFont: { family: SANS_FONT, size: 12, weight: 600 },
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
  };
  return (
    <div className="relative w-full h-full">
      <Doughnut data={data} options={opts} />
    </div>
  );
}

export function LightScatterChart({
  data,
  xLabel,
  yLabel,
}: {
  data: ChartData<'scatter'>;
  xLabel: string;
  yLabel: string;
}) {
  const opts: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#475569', font: { family: SANS_FONT, size: 11, weight: 500 } },
      },
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        titleColor: '#0F172A',
        bodyColor: '#334155',
        padding: 10,
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.05)' },
        ticks: { color: '#64748B', font: { family: MONO_FONT, size: 10 } },
        title: { display: true, text: xLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } },
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        ticks: { color: '#64748B', font: { family: MONO_FONT, size: 10 } },
        title: { display: true, text: yLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } },
      },
    },
  };
  return (
    <div className="relative w-full h-full">
      <Scatter data={data} options={opts} />
    </div>
  );
}
