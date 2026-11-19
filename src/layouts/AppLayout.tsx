import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Header Bar */}
      <header className="sticky top-0 z-40 h-14 sm:h-16 border-b border-slate-200/90 bg-white/95 backdrop-blur-xs px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-8">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <NavLink
            to="/"
            className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap truncate"
          >
            <span className="sm:hidden">Wildfire Intelligence</span>
            <span className="hidden sm:inline">Wildfire Propagation & Geospatial Intelligence Platform</span>
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
                `whitespace-nowrap shrink-0 transition-colors duration-150 py-1.5 border-b-2 ${
                  isActive
                    ? 'text-[#0284C7] font-semibold border-[#0284C7]'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
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
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0284C7] px-3 sm:px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0369A1] active:scale-[0.99] transition-all whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden min-[380px]:inline">Import Dataset</span>
            <span className="min-[380px]:hidden">Import</span>
          </button>
        </div>
      </header>

      {/* Mobile Compact Horizontal Route Strip (Quick Thumb Access without Menu Open) */}
      <nav
        className="lg:hidden border-b border-slate-200/80 bg-white px-3.5 py-2 overflow-x-auto no-scrollbar"
        aria-label="Mobile Navigation"
      >
        <div className="flex items-center gap-1.5 min-w-max">
          {TOP_LINKS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 ${
                  isActive
                    ? 'bg-sky-50 text-[#0284C7] font-semibold ring-1 ring-sky-200/80'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white border-r border-slate-200 p-5 flex flex-col justify-between gap-6 shadow-xl animate-panel-enter">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                <span className="text-sm font-bold text-slate-900">Geospatial Intelligence</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
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
                      `flex items-center rounded-lg px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sky-50 text-[#0284C7] font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-2">
              <div className="font-medium text-slate-700">
                {isInitialized ? datasetMeta?.name : 'Dormant Workspace'}
              </div>
              <div className="tabular-nums">
                {isInitialized ? `Step ${generation} · ${isRunning ? 'Simulation Active' : 'Paused'}` : 'Upload a CSV, JSON, or GeoJSON file to begin'}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
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
      <footer className="border-t border-slate-200/90 bg-white px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 tabular-nums">
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
