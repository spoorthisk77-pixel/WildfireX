import React from 'react';
import { CheckCircle2, AlertTriangle, Play, Info } from 'lucide-react';
import type { MathTopicResponse } from '../types/api';
import { LatexFormula } from './LatexFormula';

interface MathLabSectionProps {
  title: string;
  introduction: string;
  definition: string;
  formulaLatex: string;
  inputPanel: React.ReactNode;
  onExecute: () => void;
  executeLabel?: string;
  executing?: boolean;
  error?: string | null;
  response: MathTopicResponse | null;
  renderVisualization?: (response: MathTopicResponse) => React.ReactNode;
  renderResultSummary?: (response: MathTopicResponse) => React.ReactNode;
  limitationsFallback?: string;
}

export function MathLabSection({
  title,
  introduction,
  definition,
  formulaLatex,
  inputPanel,
  onExecute,
  executeLabel = 'Compute & Verify',
  executing = false,
  error = null,
  response,
  renderVisualization,
  renderResultSummary,
  limitationsFallback,
}: MathLabSectionProps) {
  const activeIntro = response?.introduction ?? introduction;
  const activeDef = response?.definition ?? definition;
  const activeLatex = response?.formula_latex ?? formulaLatex;
  const activeLimitations = response?.limitations ?? limitationsFallback;

  const verificationEntries = response ? Object.entries(response.verification) : [];

  return (
    <div className="space-y-6">
      {/* 1. Topic Introduction, 2. Mathematical Definition, 3. LaTeX Formula */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E7EBE6] pb-3">
          <h2 className="font-display text-lg font-semibold text-[#151B18]">{response?.title ?? title}</h2>
          {response && (
            <span className="font-mono text-[11px] text-[#5B6861]">{response.topic_key}</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861]">
                1. Topic Introduction
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#2A332E]">{activeIntro}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861]">
                2. Mathematical Definition
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#4B5851]">{activeDef}</p>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-md border border-[#E7EBE6] bg-[#F5F6F3] p-4 flex flex-col justify-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] mb-2">
              3. Symbolic Formula
            </div>
            <LatexFormula latex={activeLatex} />
          </div>
        </div>
      </section>

      {/* 4. Interactive Input Area & 5. Calculate / Execute Action */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBE6] pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861]">
              4. Parameters & Input Configuration
            </div>
          </div>
          <button
            type="button"
            onClick={onExecute}
            disabled={executing}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1B4332] px-4 py-2 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{executing ? 'Computing on Python Backend...' : executeLabel}</span>
          </button>
        </div>

        {inputPanel}

        {error && (
          <div className="rounded-md border border-[#E5B8B4] bg-[#FDF3F2] px-4 py-3 text-xs text-[#912018] flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* 6. Step-by-step Derivation, 7. Result, 8. Visualization, 9. Verification, 10. Limitations */}
      {response && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* 6. Step-by-step derivation */}
            <section className="xl:col-span-5 rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] border-b border-[#E7EBE6] pb-2">
                6. Step-by-Step Derivation
              </div>
              <ol className="space-y-3">
                {response.steps.map((step, i) => (
                  <li key={i} className="rounded-md bg-[#F5F6F3] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2 font-semibold text-[#151B18]">
                      <span>
                        Step {step.step_number ?? i + 1}: {step.title}
                      </span>
                    </div>
                    <p className="text-[#4B5851] leading-relaxed">{step.explanation}</p>
                    {step.value !== undefined && step.value !== null && typeof step.value !== 'object' && (
                      <div className="font-mono text-[11px] text-[#1B4332] font-medium pt-0.5">
                        Value: {String(step.value)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {/* 7. Computed Result + 8. Graphical Visualization */}
            <div className="xl:col-span-7 space-y-6">
              <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] border-b border-[#E7EBE6] pb-2">
                  7. Computed Result
                </div>
                {renderResultSummary ? (
                  renderResultSummary(response)
                ) : (
                  <pre className="overflow-x-auto rounded bg-[#F5F6F3] p-3 font-mono text-xs text-[#151B18]">
                    {JSON.stringify(response.result, null, 2)}
                  </pre>
                )}
              </section>

              {renderVisualization && (
                <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] border-b border-[#E7EBE6] pb-2">
                    8. Graphical & Structural Visualization
                  </div>
                  {renderVisualization(response)}
                </section>
              )}
            </div>
          </div>

          {/* 9. Independent Verification & 10. Assumptions / Limitations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#1E6B45]" />
                <span>9. Independent Verification</span>
              </div>
              <dl className="divide-y divide-[#F0F2EF] text-xs">
                {verificationEntries.map(([k, v]) => (
                  <div key={k} className="py-2 flex items-center justify-between gap-4">
                    <dt className="font-mono text-[#5B6861]">{k}</dt>
                    <dd
                      className={`font-mono font-semibold ${
                        v === true
                          ? 'text-[#1E6B45]'
                          : v === false
                            ? 'text-[#B42318]'
                            : 'text-[#151B18]'
                      }`}
                    >
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-lg border border-[#DCE2DC] bg-white p-5 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6861] flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-[#9A5B13]" />
                <span>10. Assumptions & Limitations</span>
              </div>
              <p className="text-xs leading-relaxed text-[#4B5851]">{activeLimitations}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
