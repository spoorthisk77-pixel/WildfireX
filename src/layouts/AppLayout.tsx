import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Binary,
  BookOpenCheck,
  Box,
  Database,
  FileSpreadsheet,
  Flame,
  GitBranch,
  Grid3X3,
  Layers,
  LayoutDashboard,
  MapPin,
  Menu,
  Network,
  Scale,
  Settings,
  ShieldCheck,
  Sigma,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { NAV_GROUPS, NAV_ITEMS } from '../utils/navigation';
import { SCIENTIFIC_DISCLAIMER } from '../utils/disclaimer';
import { ErrorBoundary } from '../components/ErrorBoundary';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  'forest-explorer': Grid3X3,
  'landscape-3d': Box,
  datasets: Database,
  geospatial: Layers,
  observations: Flame,
  'data-quality': ShieldCheck,
  'cellular-automata': Activity,
  'graph-theory': Network,
  combinatorics: Binary,
  'mathematical-logic': Scale,
  'generating-functions': Sigma,
  'recurrence-relations': TrendingUp,
  'trees-algorithms': GitBranch,
  'scenario-comparison': MapPin,
  reports: FileSpreadsheet,
  'syllabus-coverage': BookOpenCheck,
  settings: Settings,
};

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const currentNav =
    NAV_ITEMS.find((item) => item.path === location.pathname) || NAV_ITEMS[0];

  const renderSidebarLinks = (onSelect?: () => void) => (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="WildfireX Navigation">
      {NAV_GROUPS.map((groupName) => {
        const items = NAV_ITEMS.filter((i) => i.group === groupName);
        return (
          <div key={groupName}>
            <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-[#8FA296]">
              {groupName}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICON_MAP[item.id] || LayoutDashboard;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onSelect}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-[#24392E] text-white'
                            : 'text-[#C6D1CA] hover:bg-[#1D2822] hover:text-white'
                        }`
                      }
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        <span className="truncate">{item.label}</span>
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[#F5F6F3] text-[#151B18]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#141B18] border-r border-[#24302A]">
        <div className="flex h-14 items-center px-5 border-b border-[#24302A] shrink-0">
          <span className="font-display text-lg font-bold tracking-tight text-[#F3F5F2] whitespace-nowrap">
            WildfireX
          </span>
        </div>
        {renderSidebarLinks()}
        <div className="border-t border-[#24302A] px-4 py-3 text-[11px] text-[#95A79C] leading-relaxed">
          <div>Nagarhole National Park</div>
          <div className="font-mono text-[#7C8E83]">Karnataka, India</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-[#141B18] border-r border-[#24302A]">
            <div className="flex h-14 items-center justify-between px-5 border-b border-[#24302A]">
              <span className="font-display text-lg font-bold tracking-tight text-[#F3F5F2]">
                WildfireX
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1.5 text-[#C6D1CA] hover:bg-[#1D2822] hover:text-white"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderSidebarLinks(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Three-Zone Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-8 border-b border-[#DCE2DC] bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-md p-1.5 text-[#37423C] hover:bg-[#EFF2EE]"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#6B7871] hidden sm:inline whitespace-nowrap">
                {currentNav.group}
              </span>
              <span className="text-[#B4BEB7] hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display text-sm sm:text-base font-semibold text-[#151B18] truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <nav className="hidden xl:flex items-center gap-6 text-[13px] font-medium text-[#4B5851]">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? 'text-[#151B18] underline underline-offset-4' : 'hover:text-[#151B18]'
                }`
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/datasets"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? 'text-[#151B18] underline underline-offset-4' : 'hover:text-[#151B18]'
                }`
              }
            >
              Datasets
            </NavLink>
            <NavLink
              to="/observations"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? 'text-[#151B18] underline underline-offset-4' : 'hover:text-[#151B18]'
                }`
              }
            >
              Observations
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? 'text-[#151B18] underline underline-offset-4' : 'hover:text-[#151B18]'
                }`
              }
            >
              Reports
            </NavLink>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => navigate('/datasets')}
              className="inline-flex items-center gap-2 rounded-md bg-[#1B4332] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import Dataset</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-[1440px] w-full mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        <footer className="border-t border-[#DCE2DC] bg-white px-4 py-4 sm:px-6 lg:px-8 mt-8">
          <div className="max-w-[1440px] mx-auto text-[11px] leading-relaxed text-[#4B5851] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <p className="max-w-5xl">
              <strong className="text-[#151B18]">Scientific Limitations & Responsible Use:</strong>{' '}
              {SCIENTIFIC_DISCLAIMER}
            </p>
            <NavLink
              to="/syllabus-coverage"
              className="text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap shrink-0"
            >
              Syllabus Verification Matrix
            </NavLink>
          </div>
        </footer>
      </div>
    </div>
  );
}
