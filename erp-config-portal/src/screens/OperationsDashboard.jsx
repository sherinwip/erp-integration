import React, { useEffect, useState, useCallback } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { getPipelineRunStats } from '../common/api/pipelineRuns.js';

// ── Date filter helpers (mirrors PipelineExecutions.jsx presets) ───────────────
function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeek(d) {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function startOfMonth(d) {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

const DATE_PRESETS = [
  { key: '', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function getPresetFrom(key) {
  const now = new Date();
  if (key === 'today') return startOfDay(now);
  if (key === 'week') return startOfWeek(now);
  if (key === 'month') return startOfMonth(now);
  return null;
}

const STATUS_GROUPS = {
  success: ['success', 'completed'],
  failed: ['failed', 'error'],
  running: ['running'],
  pending: ['pending'],
};

function sumGroup(statusCounts, keys) {
  return keys.reduce((sum, k) => sum + (statusCounts[k] ?? 0), 0);
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClasses = {
    default: 'bg-white text-slate-900',
    success: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    running: 'bg-blue-50 text-blue-700',
    pending: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-3xl border border-outline-variant p-5 shadow-sm ${toneClasses[tone] ?? toneClasses.default}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function OperationsDashboard() {
  const { clients } = useClient();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [datePreset, setDatePreset] = useState('');
  // Dashboard has its own Client filter, independent of the header's
  // "active client" (which scopes config-editing screens) -- '' means
  // "All Clients", so the dashboard defaults to a cross-client aggregate.
  const [selectedClientId, setSelectedClientId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const from = getPresetFrom(datePreset);
    getPipelineRunStats(selectedClientId, undefined, from ? from.toISOString() : undefined, undefined)
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedClientId, datePreset]);

  useEffect(() => {
    load();
  }, [load]);

  const statusCounts = stats?.status_counts ?? {};
  const successCount = sumGroup(statusCounts, STATUS_GROUPS.success);
  const failedCount = sumGroup(statusCounts, STATUS_GROUPS.failed);
  const runningCount = sumGroup(statusCounts, STATUS_GROUPS.running);
  const pendingCount = sumGroup(statusCounts, STATUS_GROUPS.pending);

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-outline-variant bg-white px-5 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dashboard</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Operations Health</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Client</span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="rounded-2xl border border-outline-variant bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.client_name} ({c.client_id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setDatePreset(p.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  datePreset === p.key
                    ? 'bg-primary text-white'
                    : 'border border-outline-variant bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-3xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-600">{error}</p>
      )}

      {loading && !stats && (
        <p className="px-5 py-6 text-sm text-slate-400">Loading dashboard…</p>
      )}

      {!loading && !error && stats?.total_runs === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No pipeline runs found for the selected filters.
        </div>
      )}

      {stats && stats.total_runs > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total Runs" value={stats.total_runs ?? 0} />
            <StatCard label="Running" value={runningCount} tone="running" />
            <StatCard label="Pending" value={pendingCount} tone="pending" />
            <StatCard label="Success" value={successCount} tone="success" />
            <StatCard label="Failed" value={failedCount} tone="failed" />
            <StatCard label="Success Rate" value={`${stats.success_rate ?? 0}%`} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard label="Avg Duration" value={formatMs(stats.avg_duration_ms)} />
            <StatCard label="P95 Duration" value={formatMs(stats.p95_duration_ms)} />
          </div>
        </>
      )}
    </div>
  );
}

export default OperationsDashboard;
