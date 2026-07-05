import React, { useEffect, useMemo, useState } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { listPipelines, createPipeline } from '../common/api/pipelines.js';

const SUPPORTED_PATTERNS = ['PAT-01', 'PAT-02', 'PAT-03', 'PAT-05', 'PAT-06', 'PAT-07', 'PAT-08', 'PAT-10'];

function PipelineList({ onOpenPipeline }) {
  const { activeClientId } = useClient();
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [search, setSearch] = useState('');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState('');
  const [newSourceSystem, setNewSourceSystem] = useState('');
  const [newObjectType, setNewObjectType] = useState('');
  const [newPatternId, setNewPatternId] = useState('PAT-01');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    if (!activeClientId) { setPipelines([]); return; }
    setLoading(true);
    setError(null);
    listPipelines(activeClientId)
      .then(setPipelines)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeClientId]);

  const filtered = useMemo(
    () => pipelines.filter((p) =>
      `${p.pipeline_id} ${p.source_system} ${p.object_type}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [search, pipelines],
  );

  const handleCreate = async () => {
    if (!newId.trim() || !newSourceSystem.trim() || !newObjectType.trim()) {
      setCreateError('Pipeline ID, source system, and object type are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const pipeline = await createPipeline({
        pipeline_id: newId.trim(),
        client_id: activeClientId,
        source_system: newSourceSystem.trim(),
        object_type: newObjectType.trim(),
        pattern_id: newPatternId,
      });
      setPipelines((c) => [...c, pipeline]);
      setShowCreate(false);
      setNewId(''); setNewSourceSystem(''); setNewObjectType(''); setNewPatternId('PAT-01');
      setActivePipelineId(pipeline.pipeline_id);
      onOpenPipeline(pipeline.pipeline_id);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[0.45fr_0.55fr]">
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipelines</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Pipeline list</h2>
          </div>
          <button
            onClick={() => { setCreateError(null); setShowCreate(true); }}
            disabled={!activeClientId}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
            Create Pipeline
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-3xl border border-outline-variant bg-slate-50 p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipelines"
              className="w-full rounded-2xl border border-outline-variant bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              type="text"
            />
          </div>

          {loading && <div className="py-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
          {!loading && !error && (
            <div className="space-y-3">
              {filtered.length ? (
                filtered.map((pipeline) => (
                  <button
                    key={pipeline.pipeline_id}
                    onClick={() => { setActivePipelineId(pipeline.pipeline_id); onOpenPipeline(pipeline.pipeline_id); }}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      pipeline.pipeline_id === activePipelineId
                        ? 'border-primary/70 bg-primary/5'
                        : 'border-outline-variant bg-slate-50 hover:bg-slate-100'
                    }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{pipeline.pipeline_id}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {pipeline.source_system} · {pipeline.object_type} · {pipeline.pattern_id}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pipeline.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {pipeline.status}
                        </span>
                        {pipeline.pipeline_id === activePipelineId && (
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  {activeClientId
                    ? 'No pipelines found. Create one to get started.'
                    : 'Select a client to view pipelines.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Guidance panel */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <p className="text-sm font-semibold text-slate-700">Pipeline guidance</p>
        </div>
        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p>Choose a pipeline to view its configuration, add or reorder steps, and adjust retry settings.</p>
          <p>New pipelines require an ID, source system, object type, and routing pattern.</p>
          <div className="rounded-3xl bg-slate-50 p-4 text-slate-500">
            Pipelines define a sequence of steps that run together for a given source system event.
          </div>
        </div>
      </div>

      {/* ── Create Pipeline modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-[32px] border border-outline-variant bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <span className="text-sm font-semibold text-slate-700">New Pipeline</span>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-2xl border border-outline-variant bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-surface-container-high">
                Cancel
              </button>
            </div>
            <div className="space-y-4 p-5">
              {createError && (
                <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{createError}</div>
              )}
              {[
                { label: 'Pipeline ID', value: newId, set: setNewId, placeholder: 'e.g. acme-contact-sync' },
                { label: 'Source System', value: newSourceSystem, set: setNewSourceSystem, placeholder: 'e.g. salesforce' },
                { label: 'Object Type', value: newObjectType, set: setNewObjectType, placeholder: 'e.g. Contact' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label} className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
                  <input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pattern</label>
                <select
                  value={newPatternId}
                  onChange={(e) => setNewPatternId(e.target.value)}
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                  {SUPPORTED_PATTERNS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full rounded-2xl bg-primary py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Pipeline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PipelineList;
