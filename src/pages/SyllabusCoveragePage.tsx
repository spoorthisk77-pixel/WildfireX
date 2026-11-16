import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { SyllabusCoverageResponse } from '../types/api';
import { ErrorState, LoadingState } from '../components/StateViews';

export function SyllabusCoveragePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SyllabusCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSyllabus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getSyllabusCoverage();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load syllabus coverage matrix.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSyllabus();
  }, []);

  if (loading) return <LoadingState message="Loading Discrete Mathematics syllabus verification matrix..." />;
  if (error || !data) return <ErrorState message={error || 'Unable to load syllabus audit.'} onRetry={loadSyllabus} />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1B4332]">
          <BookOpenCheck className="h-4 w-4" />
          <span>Academic Syllabus Verification Audit</span>
        </div>
        <h2 className="font-display text-lg font-semibold text-[#151B18]">
          Discrete Mathematics Modules I–V Coverage Matrix
        </h2>
        <p className="text-xs leading-relaxed text-[#4B5851] max-w-4xl">
          Honest verification of every mathematical concept across WildfireX, distinguishing between concepts applied directly to structured landscape grids and independent educational discrete-math laboratories.
        </p>

        <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md bg-[#F5F6F3] p-3.5">
            <div className="text-[11px] text-[#5B6861]">Modules Audited</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#151B18]">
              {data.total_modules}
            </div>
          </div>
          <div className="rounded-md bg-[#F5F6F3] p-3.5">
            <div className="text-[11px] text-[#5B6861]">Verified Concepts</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#1E6B45]">
              {data.implemented_and_verified_count} / {data.total_concepts}
            </div>
          </div>
          <div className="rounded-md bg-[#F5F6F3] p-3.5">
            <div className="text-[11px] text-[#5B6861]">Direct Geospatial Applications</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#151B18]">
              {data.direct_geospatial_applications}
            </div>
          </div>
          <div className="rounded-md bg-[#F5F6F3] p-3.5">
            <div className="text-[11px] text-[#5B6861]">Independent Educational Demos</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#151B18]">
              {data.independent_educational_demos}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        {data.modules.map((mod) => (
          <section key={mod.module_number} className="rounded-lg border border-[#DCE2DC] bg-white overflow-hidden">
            <div className="border-b border-[#DCE2DC] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono text-[#5B6861]">{mod.module_number}</div>
                <h3 className="font-display text-base font-semibold text-[#151B18]">{mod.module_title}</h3>
              </div>
              <button
                type="button"
                onClick={() => navigate(mod.route_path)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] whitespace-nowrap shrink-0"
              >
                <span>Open Interactive Module</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#1B4332]" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F3] border-b border-[#E7EBE6] text-[#4B5851]">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Mathematical Concept</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium">Application vs. Educational Scope</th>
                    <th className="px-5 py-2.5 font-medium">Calculation & Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F2EF]">
                  {mod.concepts.map((c) => (
                    <tr key={c.concept} className="align-top">
                      <td className="px-5 py-3 font-medium text-[#151B18] min-w-[200px]">{c.concept}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-medium text-[#1E6B45]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{c.status}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#4B5851] max-w-xs">{c.application_scope}</td>
                      <td className="px-5 py-3 text-[#4B5851] space-y-1">
                        <div>{c.capabilities}</div>
                        <div className="text-[11px] font-mono text-[#5B6861]">{c.verification_note}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
