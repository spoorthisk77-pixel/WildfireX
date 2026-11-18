import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu, Upload, X } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DatasetUploadModal } from '../components/DatasetUploadModal';
import { ReportExportModal } from '../components/ReportExportModal';
import { useEngine } from '../context/EngineContext';

const TOP_LINKS = [
  { label: 'Simulation Arena', path: '/' },
  { label: 'Dataset Portal', path: '/ingestion' },
  { label: 'Analytics Suites', path: '/analytics' },
  { label: 'Telemetry & Export', path: '/telemetry' },
];

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const { datasetMeta, isInitialized, generation, isRunning } = useEngine();

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Header Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white/95 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8 shadow-2xs">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <NavLink
            to="/"
            className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Wildfire Propagation & Geospatial Intelligence Platform
          </NavLink>
        </div>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600" aria-label="Primary Navigation">
          {TOP_LINKS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors py-1 ${
                  isActive
                    ? 'text-[#0284C7] font-semibold underline decoration-[#0284C7] underline-offset-8'
                    : 'hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0369A1] transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Dataset</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white border-r border-slate-200 p-5 flex flex-col gap-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-sm font-bold text-slate-900">Geospatial Intelligence</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-500 hover:text-slate-800"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1.5">
              {TOP_LINKS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-sky-50 text-[#0284C7] font-semibold' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary>
          <Outlet
            context={{
              openUploadModal: () => setUploadModalOpen(true),
              openReportModal: () => setReportModalOpen(true),
            }}
          />
        </ErrorBoundary>
      </main>

      {/* Quiet SaaS Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 tabular-nums">
          <span>Wildfire Propagation & Geospatial Intelligence Platform</span>
          <span>
            {isInitialized
              ? `Active Dataset: ${datasetMeta?.name} · Step ${generation} · ${isRunning ? 'Simulation Active' : 'Ready'}`
              : 'Dormant State · Awaiting forest dataset upload'}
          </span>
        </div>
      </footer>

      <DatasetUploadModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
      <ReportExportModal open={reportModalOpen} onClose={() => setReportModalOpen(false)} />
    </div>
  );
}
