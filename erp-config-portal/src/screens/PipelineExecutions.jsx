import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  listPipelineRuns,
  getPipelineRunSteps,
  getStepExtracts,
} from '../common/api/pipelineRuns.js';

const STATUS_COLORS = {
  success: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  skipped: 'bg-slate-100 text-slate-600',
};

function statusBadge(status) {
  const s = (status ?? '').toLowerCase();
  const color = STATUS_COLORS[s] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${color}`}>
      {status ?? '—'}
    </span>
  );
}

function formatDateTime(dt) {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

// ── Step detail drawer ────────────────────────────────────────────────────────
function StepDetail({ step, onClose }) {
  const [extracts, setExtracts] = useState([]);
  const [tab, setTab] = useState('request');

  useEffect(() => {
    if (!step) return;
    getStepExtracts(step.run_id, step.step_pk)
      .then(setExtracts)
      .catch(() => setExtracts([]));
  }, [step]);

  if (!step) return null;

  const tabs = [
    { key: 'request', label: 'Request' },
    { key: 'transformed', label: 'Transformed' },
    { key: 'response', label: 'Response' },
    { key: 'extracts', label: extracts.length ? `Extracts (${extracts.length})` : 'Extracts' },
  ];

  const renderExtracts = (list) => {
    if (list.length === 0) {
      return <p className="text-sm text-slate-400">No extracted variables for this step.</p>;
    }
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-outline-variant text-left text-slate-500">
            <th className="pb-2 pr-4 font-semibold">Variable</th>
            <th className="pb-2 font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {list.map((ex) => (
            <tr key={ex.extract_pk} className="border-b border-outline-variant/50">
              <td className="py-1.5 pr-4 font-mono font-semibold text-primary">{ex.var_name}</td>
              <td className="py-1.5 font-mono text-slate-700">{ex.value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const content = {
    request: step.request_received,
    transformed: step.transformed_request,
    response: step.response_received,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex w-full max-w-2xl flex-col rounded-3xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step Detail</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">{step.step_name ?? `Step ${step.step_pk}`}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Seq {step.seq} &nbsp;·&nbsp; Status Code: {step.status_code ?? '—'} &nbsp;·&nbsp;{' '}
              {statusBadge(step.status)}
            </p>
            {step.step_fail_reason && (
              <p className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{step.step_fail_reason}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="flex gap-1 border-b border-outline-variant px-6 pt-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                tab === t.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-96 overflow-y-auto px-6 py-4">
          {tab === 'extracts' ? (
            renderExtracts(extracts)
          ) : (
            <pre className="whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700">
              {content[tab] ? content[tab] : <span className="text-slate-400">—</span>}
            </pre>
          )}
        </div>

        <div className="flex justify-end border-t border-outline-variant px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-outline-variant px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
function PipelineExecutions() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected run & its steps
  const [selectedRun, setSelectedRun] = useState(null);
  const [steps, setSteps] = useState([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsError, setStepsError] = useState(null);

  // Step detail drawer
  const [selectedStep, setSelectedStep] = useState(null);

  // Re-run state
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const [rerunSuccess, setRerunSuccess] = useState(false);

  const loadRuns = useCallback(() => {
    setLoading(true);
    setError(null);
    listPipelineRuns()
      .then(setRuns)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    let list = runs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          String(r.run_id).includes(q) ||
          (r.pipeline_id ?? '').toLowerCase().includes(q) ||
          (r.raw_payload_id ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      list = list.filter((r) => (r.status ?? '').toLowerCase() === statusFilter.toLowerCase());
    }
    return list;
  }, [runs, search, statusFilter]);

  const selectRun = (run) => {
    setSelectedRun(run);
    setSteps([]);
    setStepsError(null);
    setRerunError(null);
    setRerunSuccess(false);
    setStepsLoading(true);
    getPipelineRunSteps(run.run_id)
      .then(setSteps)
      .catch((err) => setStepsError(err.message))
      .finally(() => setStepsLoading(false));
  };

  const handleRerun = async () => {
    if (!selectedRun) return;
    setRerunning(true);
    setRerunError(null);
    setRerunSuccess(false);
    try {
      // POST to re-run endpoint; refresh the list once triggered
      await import('../common/api/pipelineRuns.js').then(({ rerunPipeline }) =>
        rerunPipeline(selectedRun.run_id),
      );
      setRerunSuccess(true);
      loadRuns();
    } catch (err) {
      setRerunError(err.message);
    } finally {
      setRerunning(false);
    }
  };

  const isFailed = (run) => {
    const s = (run?.status ?? '').toLowerCase();
    return s === 'failed' || s === 'error';
  };

  const distinctStatuses = useMemo(
    () => [...new Set(runs.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [runs],
  );

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[0.45fr_0.55fr]">
      {/* ── Left: Run list ── */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Executions</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Pipeline Runs</h2>
          </div>
          <button
            onClick={loadRuns}
            disabled={loading}
            title="Refresh"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 border-b border-outline-variant px-5 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search run ID / pipeline…"
            className="flex-1 rounded-2xl border border-outline-variant bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-primary">
            <option value="">All</option>
            {distinctStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
          {loading && (
            <p className="px-5 py-6 text-sm text-slate-400">Loading pipeline runs…</p>
          )}
          {error && (
            <p className="px-5 py-4 text-sm text-red-600">{error}</p>
          )}
          {!loading && !error && filteredRuns.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400">No pipeline runs found.</p>
          )}
          {filteredRuns.map((run) => (
            <button
              key={run.run_id}
              onClick={() => selectRun(run)}
              className={`flex w-full items-center gap-3 border-b border-outline-variant/50 px-5 py-3 text-left transition hover:bg-surface-container-low ${
                selectedRun?.run_id === run.run_id ? 'bg-primary/5' : ''
              }`}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-900">
                    {run.pipeline_id}
                  </span>
                  {statusBadge(run.status)}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Run #{run.run_id}</span>
                  {run.raw_payload_id && <span>· Payload: {run.raw_payload_id}</span>}
                </div>
                <div className="text-xs text-slate-400">{formatDateTime(run.created_at)}</div>
              </div>
              <span className="material-symbols-outlined text-sm text-slate-300">chevron_right</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Run detail + steps ── */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        {!selectedRun ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl">playlist_play</span>
            <p className="text-sm">Select a pipeline run to see its steps</p>
          </div>
        ) : (
          <>
            {/* Run header */}
            <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Run #{selectedRun.run_id}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold text-slate-900">
                    {selectedRun.pipeline_id}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {statusBadge(selectedRun.status)}
                    <span>Started: {formatDateTime(selectedRun.created_at)}</span>
                    {selectedRun.completed_at && (
                      <span>Completed: {formatDateTime(selectedRun.completed_at)}</span>
                    )}
                  </div>
                  {selectedRun.pipeline_fail_reason && (
                    <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                      <span className="font-semibold">Failure reason: </span>
                      {selectedRun.pipeline_fail_reason}
                    </div>
                  )}
                </div>

                {/* Re-Run button */}
                {isFailed(selectedRun) && (
                  <button
                    onClick={handleRerun}
                    disabled={rerunning}
                    className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50">
                    <span className="material-symbols-outlined text-sm">replay</span>
                    {rerunning ? 'Re-Running…' : 'Re-Run Pipeline'}
                  </button>
                )}
              </div>
              {rerunError && (
                <p className="mt-2 text-xs text-red-600">{rerunError}</p>
              )}
              {rerunSuccess && (
                <p className="mt-2 text-xs text-emerald-600">Pipeline re-run triggered successfully.</p>
              )}
            </div>

            {/* Steps list */}
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Steps</p>

              {stepsLoading && (
                <p className="text-sm text-slate-400">Loading steps…</p>
              )}
              {stepsError && (
                <p className="text-sm text-red-600">{stepsError}</p>
              )}
              {!stepsLoading && !stepsError && steps.length === 0 && (
                <p className="text-sm text-slate-400">No steps recorded for this run.</p>
              )}

              <div className="flex flex-col gap-2 max-h-[calc(100vh-380px)] overflow-y-auto">
                {steps.map((step, idx) => {
                  const failed = ['failed', 'error'].includes((step.status ?? '').toLowerCase());
                  return (
                    <button
                      key={step.run_step_pk}
                      onClick={() => setSelectedStep(step)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-xs transition hover:shadow-sm ${
                        failed
                          ? 'border-red-200 bg-red-50 hover:bg-red-100'
                          : 'border-outline-variant bg-surface-container-low hover:bg-slate-100'
                      }`}>
                      {/* Sequence badge */}
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          failed ? 'bg-red-200 text-red-700' : 'bg-primary/10 text-primary'
                        }`}>
                        {step.seq ?? idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-slate-900">
                            {step.step_name ?? `Step ${step.step_pk}`}
                          </span>
                          {statusBadge(step.status)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-slate-500">
                          <span>HTTP {step.status_code ?? '—'}</span>
                          <span>·</span>
                          <span>{formatDateTime(step.created_at)}</span>
                        </div>
                        {step.step_fail_reason && (
                          <p className="mt-1 truncate text-red-600">{step.step_fail_reason}</p>
                        )}
                      </div>

                      <span className="material-symbols-outlined shrink-0 text-sm text-slate-300">
                        open_in_new
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Step detail drawer */}
      {selectedStep && (
        <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} />
      )}
    </div>
  );
}

export default PipelineExecutions;
