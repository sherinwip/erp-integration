import React, { useEffect, useState } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { listSteps } from '../common/api/steps.js';
import { getPipeline, getPipelineSteps, updatePipeline } from '../common/api/pipelines.js';
import { attachStep, detachStep } from '../common/api/pipelineSteps.js';

function ViewEditPipeline({ pipelineId, onBack }) {
  const { activeClientId } = useClient();
  const [pipeline, setPipeline] = useState(null);
  const [pipelineSteps, setPipelineSteps] = useState([]);   // [{pipeline_step_pk, step_pk, seq}]
  const [allSteps, setAllSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderChanged, setOrderChanged] = useState(false);

  // Edit pipeline fields
  const [editFields, setEditFields] = useState({});
  const [savingFields, setSavingFields] = useState(false);
  const [saveFieldsError, setSaveFieldsError] = useState(null);
  const [savedFieldsOk, setSavedFieldsOk] = useState(false);

  // Save order
  const [savingOrder, setSavingOrder] = useState(false);
  const [saveOrderError, setSaveOrderError] = useState(null);

  useEffect(() => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getPipeline(pipelineId),
      getPipelineSteps(pipelineId),
      activeClientId ? listSteps(activeClientId) : Promise.resolve([]),
    ])
      .then(([pl, plSteps, steps]) => {
        setPipeline(pl);
        setEditFields({
          source_system: pl.source_system,
          object_type: pl.object_type,
          event_type: pl.event_type,
          status: pl.status,
        });
        setPipelineSteps([...plSteps].sort((a, b) => a.seq - b.seq));
        setAllSteps(steps);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [pipelineId, activeClientId]);

  const getStepForPk = (stepPk) => allSteps.find((s) => s.step_pk === stepPk);

  // ── step management ──────────────────────────────────────────────────────
  const addStepToPipeline = async (stepPk) => {
    const maxSeq = pipelineSteps.reduce((max, ps) => Math.max(max, ps.seq), 0);
    try {
      const newPs = await attachStep({ pipeline_id: pipeline.pipeline_id, step_pk: stepPk, seq: maxSeq + 1 });
      setPipelineSteps((c) => [...c, newPs]);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeStepFromPipeline = async (pipelineStepPk) => {
    try {
      await detachStep(pipelineStepPk);
      setPipelineSteps((c) => c.filter((ps) => ps.pipeline_step_pk !== pipelineStepPk));
    } catch (err) {
      setError(err.message);
    }
  };

  const movePipelineStep = (index, direction) => {
    const next = [...pipelineSteps];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setPipelineSteps(next);
    setOrderChanged(true);
  };

  // Delete all, recreate with new seq to avoid unique-constraint violations
  const saveOrder = async () => {
    setSavingOrder(true);
    setSaveOrderError(null);
    try {
      const snapshot = [...pipelineSteps];
      await Promise.all(snapshot.map((ps) => detachStep(ps.pipeline_step_pk)));
      const created = await Promise.all(
        snapshot.map((ps, idx) =>
          attachStep({ pipeline_id: pipeline.pipeline_id, step_pk: ps.step_pk, seq: idx + 1 }),
        ),
      );
      setPipelineSteps([...created].sort((a, b) => a.seq - b.seq));
      setOrderChanged(false);
    } catch (err) {
      setSaveOrderError(err.message);
    } finally {
      setSavingOrder(false);
    }
  };

  // ── pipeline field save ──────────────────────────────────────────────────
  const savePipelineFields = async () => {
    setSavingFields(true);
    setSaveFieldsError(null);
    try {
      const updated = await updatePipeline(pipeline.pipeline_id, editFields);
      setPipeline(updated);
      setSavedFieldsOk(true);
      setTimeout(() => setSavedFieldsOk(false), 3000);
    } catch (err) {
      setSaveFieldsError(err.message);
    } finally {
      setSavingFields(false);
    }
  };

  if (loading) {
    return <div className="flex w-full items-center justify-center py-20 text-sm text-slate-500">Loading pipeline…</div>;
  }
  if (error) {
    return <div className="w-full rounded-[28px] border border-red-200 bg-red-50 p-8 text-sm text-red-600">{error}</div>;
  }
  if (!pipeline) {
    return (
      <div className="rounded-[28px] border border-outline-variant bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">Select a pipeline first.</p>
      </div>
    );
  }

  return (
    <div className="grid w-full gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      {/* Pipeline details + ordered steps */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline details</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{pipeline.pipeline_id}</h2>
          </div>
          <button
            onClick={onBack}
            className="rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-container-high">
            Back
          </button>
        </div>
        <div className="space-y-6 p-5">
          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Source System', key: 'source_system' },
              { label: 'Object Type', key: 'object_type' },
              { label: 'Event Type', key: 'event_type' },
            ].map(({ label, key }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
                <input
                  value={editFields[key] ?? ''}
                  onChange={(e) => setEditFields((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</label>
              <select
                value={editFields.status ?? 'active'}
                onChange={(e) => setEditFields((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveFieldsError && <span className="text-xs text-red-600">{saveFieldsError}</span>}
            {savedFieldsOk && <span className="text-xs font-semibold text-green-600">Saved!</span>}
            <button
              onClick={savePipelineFields}
              disabled={savingFields}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
              {savingFields ? 'Saving…' : 'Save Details'}
            </button>
          </div>

          {/* Ordered steps */}
          <div className="space-y-3 rounded-[24px] bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Step Execution Order
              </p>
              {orderChanged && (
                <div className="flex items-center gap-2">
                  {saveOrderError && <span className="text-xs text-red-600">{saveOrderError}</span>}
                  <button
                    onClick={saveOrder}
                    disabled={savingOrder}
                    className="rounded-2xl bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
                    {savingOrder ? 'Saving…' : 'Save Order'}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {pipelineSteps.length ? (
                pipelineSteps.map((ps, index) => {
                  const step = getStepForPk(ps.step_pk);
                  return (
                    <div
                      key={ps.pipeline_step_pk}
                      className="flex items-center justify-between gap-3 rounded-3xl border border-outline-variant bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {step?.step_name ?? `Step #${ps.step_pk}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            {step ? `${step.method} ${step.path}` : `pk: ${ps.step_pk}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => movePipelineStep(index, -1)}
                          className="rounded-2xl border border-outline-variant px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100">↑</button>
                        <button
                          onClick={() => movePipelineStep(index, 1)}
                          className="rounded-2xl border border-outline-variant px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100">↓</button>
                        <button
                          onClick={() => removeStepFromPipeline(ps.pipeline_step_pk)}
                          className="rounded-2xl border border-outline-variant px-2 py-1 text-xs text-red-600 transition hover:bg-red-50">×</button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">No steps added yet. Add steps from the list on the right.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Available steps */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <span className="text-sm font-semibold text-slate-700">Available Steps</span>
        </div>
        <div className="space-y-3 p-5">
          {allSteps.length === 0 && (
            <p className="text-sm text-slate-500">No steps available for this client.</p>
          )}
          {allSteps.map((step) => {
            const inPipeline = pipelineSteps.some((ps) => ps.step_pk === step.step_pk);
            const pipelineStep = pipelineSteps.find((ps) => ps.step_pk === step.step_pk);
            return (
              <div
                key={step.step_pk}
                className="flex items-center justify-between gap-3 rounded-3xl border border-outline-variant bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.step_name}</p>
                  <p className="text-xs text-slate-500">{step.method} {step.path}</p>
                </div>
                <button
                  onClick={() =>
                    inPipeline
                      ? removeStepFromPipeline(pipelineStep.pipeline_step_pk)
                      : addStepToPipeline(step.step_pk)
                  }
                  className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                    inPipeline
                      ? 'border border-red-200 text-red-600 hover:bg-red-50'
                      : 'bg-primary text-white hover:brightness-95'
                  }`}>
                  {inPipeline ? 'Remove' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ViewEditPipeline;
