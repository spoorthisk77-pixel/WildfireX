import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type { HealthStatus, StudyArea } from '../types/api';
import { ErrorState, LoadingState } from '../components/StateViews';

export function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [studyArea, setStudyArea] = useState<StudyArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, areaRes] = await Promise.all([apiClient.getHealth(), apiClient.getActiveStudyArea()]);
      setHealth(h);
      setStudyArea(areaRes.study_area);
      setNotes(areaRes.study_area.notes || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleUpdateVerification = async (verificationStatus: string) => {
    if (!studyArea) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await apiClient.updateStudyAreaVerification(studyArea.id, {
        verification_status: verificationStatus,
        notes,
      });
      setStudyArea(updated);
      setSaveMsg(`Updated study area status to "${updated.verification_status}".`);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to update verification status.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading system diagnostics and study region settings..." />;
  if (error || !health || !studyArea) {
    return <ErrorState message={error || 'Unable to load settings.'} onRetry={loadSettings} />;
  }

  return (
    <div className="space-y-6">
      {/* Study Area Verification Settings */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <div className="border-b border-[#E7EBE6] pb-3">
          <h2 className="font-display text-base font-semibold text-[#151B18]">
            Study Region & Boundary Verification
          </h2>
          <p className="text-xs text-[#5B6861] mt-0.5">
            Active region: {studyArea.region_label}
          </p>
        </div>

        <div className="text-xs space-y-3">
          <div>
            <span className="text-[#6B7871]">Current Verification Status: </span>
            <span className="font-mono font-semibold text-[#151B18]">{studyArea.verification_status}</span>
          </div>

          <div>
            <label className="block font-medium text-[#2A332E] mb-1">Researcher Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full max-w-2xl rounded-md border border-[#C6CFC8] bg-white px-3 py-2 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving || !studyArea.has_boundary_geometry}
              onClick={() => handleUpdateVerification('verified_boundary')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1B4332] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#143326] disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Confirm Verified Boundary</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleUpdateVerification('awaiting_boundary_verification')}
              className="rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3] disabled:opacity-50"
            >
              Mark Awaiting Verification
            </button>
            {saveMsg && (
              <span className="inline-flex items-center gap-1 font-medium text-[#1E6B45]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{saveMsg}</span>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Backend Runtime & Installed Libraries */}
      <section className="rounded-lg border border-[#DCE2DC] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBE6] pb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#151B18]">
              Backend Environment & API Documentation
            </h3>
            <p className="text-xs text-[#5B6861]">
              {health.service} · v{health.version} · SQLite {health.database}
            </p>
          </div>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#C6CFC8] bg-white px-3.5 py-2 text-xs font-medium text-[#151B18] hover:bg-[#F5F6F3]"
          >
            <span>Open FastAPI Swagger Docs</span>
            <ExternalLink className="h-3.5 w-3.5 text-[#1B4332]" />
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {Object.entries(health.libraries).map(([lib, ver]) => (
            <div key={lib} className="rounded-md bg-[#F5F6F3] px-3.5 py-2.5">
              <div className="text-[#5B6861]">{lib}</div>
              <div className="mt-0.5 font-mono font-semibold text-[#151B18]">{ver}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
