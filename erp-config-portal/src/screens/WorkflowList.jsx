import React, { useEffect, useMemo, useState } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { listSteps } from '../common/api/steps.js';

function WorkflowList({ onOpenWorkflow }) {
  const { activeClientId } = useClient();
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeStepPk, setActiveStepPk] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!activeClientId) { setSteps([]); return; }
    setLoading(true);
    setError(null);
    listSteps(activeClientId)
      .then(setSteps)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeClientId]);

  const filtered = useMemo(
    () => steps.filter((s) => s.step_name.toLowerCase().includes(search.toLowerCase())),
    [search, steps],
  );

  const handleSelect = (stepPk) => {
    setActiveStepPk(stepPk);
    onOpenWorkflow(stepPk);
  };

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[0.45fr_0.55fr]">
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Steps</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Step list</h2>
          </div>
          <button
            onClick={() => onOpenWorkflow(null)}
            disabled={!activeClientId}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
            Create Step
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-3xl border border-outline-variant bg-slate-50 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search steps"
              className="w-full rounded-2xl border border-outline-variant bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              type="text"
            />
          </div>

          {loading && <div className="py-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && (
            <div className="space-y-3">
              {filtered.length ? (
                filtered.map((step) => (
                  <button
                    key={step.step_pk}
                    onClick={() => handleSelect(step.step_pk)}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      step.step_pk === activeStepPk
                        ? 'border-primary/70 bg-primary/5'
                        : 'border-outline-variant bg-slate-50 hover:bg-slate-100'
                    }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{step.step_name}</div>
                        <div className="mt-1 text-xs text-slate-500">{step.method} {step.path}</div>
                      </div>
                      {step.step_pk === activeStepPk && (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                          Selected
                        </span>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  {activeClientId
                    ? 'No steps found. Create one to get started.'
                    : 'Select a client to view steps.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <p className="text-sm font-semibold text-slate-700">Step guidance</p>
        </div>
        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p>Click a step to edit its field mappings, method, path, and target config.</p>
          <p>Use the create button to define a new step and assign it to pipelines.</p>
          <div className="rounded-3xl bg-slate-50 p-4 text-slate-500">
            Each step is a single outbound API call with configurable field mappings that runs as part of a pipeline.
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkflowList;
