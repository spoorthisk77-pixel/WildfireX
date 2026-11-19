import React, { useEffect, useState } from 'react';
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

function useIsCompactScreen(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return compact;
}

export function LightLineChart({
  data,
  yLabel,
}: {
  data: ChartData<'line'>;
  yLabel?: string;
}) {
  const compact = useIsCompactScreen();

  const opts: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 220, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: compact ? 10 : 11, weight: 500 },
          boxWidth: 10,
          boxHeight: 10,
          padding: compact ? 10 : 14,
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
        cornerRadius: 8,
        titleFont: { family: SANS_FONT, size: 12, weight: 600 },
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.04)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: MONO_FONT, size: 10 },
          maxRotation: 0,
          maxTicksLimit: compact ? 5 : 8,
        },
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: MONO_FONT, size: 10 },
          maxTicksLimit: 5,
        },
        title: yLabel
          ? { display: !compact, text: yLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } }
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
  const compact = useIsCompactScreen();

  const opts: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 220, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: compact ? 10 : 11, weight: 500 },
          boxWidth: 10,
          boxHeight: 10,
          padding: compact ? 10 : 14,
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
        cornerRadius: 8,
        titleFont: { family: SANS_FONT, size: 12, weight: 600 },
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { color: 'rgba(15, 23, 42, 0.04)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: SANS_FONT, size: compact ? 10 : 11 },
          maxRotation: compact ? 18 : 0,
        },
      },
      y: {
        stacked,
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: MONO_FONT, size: 10 },
          maxTicksLimit: 5,
        },
        title: yLabel
          ? { display: !compact, text: yLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } }
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
  const compact = useIsCompactScreen();

  const opts: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 240, easing: 'easeOutQuart' },
    cutout: '64%',
    plugins: {
      legend: {
        position: compact ? 'bottom' : 'right',
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: compact ? 10 : 11, weight: 500 },
          boxWidth: 10,
          padding: compact ? 10 : 12,
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
        cornerRadius: 8,
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
  const compact = useIsCompactScreen();

  const opts: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 220, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          color: '#475569',
          font: { family: SANS_FONT, size: compact ? 10 : 11, weight: 500 },
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
        cornerRadius: 8,
        bodyFont: { family: MONO_FONT, size: 11 },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(15, 23, 42, 0.04)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: MONO_FONT, size: 10 },
          maxTicksLimit: compact ? 5 : 8,
        },
        title: { display: true, text: xLabel, color: '#64748B', font: { family: SANS_FONT, size: 11 } },
      },
      y: {
        grid: { color: 'rgba(15, 23, 42, 0.06)' },
        border: { display: false },
        ticks: {
          color: '#64748B',
          font: { family: MONO_FONT, size: 10 },
          maxTicksLimit: 5,
        },
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
