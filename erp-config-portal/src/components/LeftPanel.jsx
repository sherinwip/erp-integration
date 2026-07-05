import React from 'react';

function LeftPanel({ activeScreen, setActiveScreen, onCreateWorkflow }) {
  return (
    <aside className="fixed bottom-0 left-0 top-16 flex w-64 flex-col border-r border-outline-variant bg-white py-5 px-4 shadow-sm">
      <div className="mb-6">
        <div className="flex items-center gap-3 rounded-3xl bg-surface-container-low px-3 py-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-3xl bg-primary text-white">
            <span className="material-symbols-outlined text-lg">transform</span>
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">MapEngine</div>
            <div className="text-xs text-slate-500">Active Environment</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Navigation</p>

        <button
          onClick={() => setActiveScreen('WorkflowList')}
          className={`flex w-full items-center gap-3 rounded-3xl px-3 py-2 text-xs font-semibold transition ${
            activeScreen === 'WorkflowList' || activeScreen === 'CreateUpdateWorkflow'
              ? 'bg-primary/5 text-primary'
              : 'text-slate-600 hover:bg-surface-container-low'
          }`}>
          <span className="material-symbols-outlined text-sm">account_tree</span>
          <span>Steps</span>
        </button>

        <button
          onClick={() => setActiveScreen('PipelineList')}
          className={`flex w-full items-center gap-3 rounded-3xl px-3 py-2 text-xs font-semibold transition ${
            activeScreen === 'PipelineList' || activeScreen === 'ViewEditPipeline'
              ? 'bg-primary/5 text-primary'
              : 'text-slate-600 hover:bg-surface-container-low'
          }`}>
          <span className="material-symbols-outlined text-sm">inventory_2</span>
          <span>Pipelines</span>
        </button>

        <button
          onClick={() => setActiveScreen('TargetSystems')}
          className={`flex w-full items-center gap-3 rounded-3xl px-3 py-2 text-xs font-semibold transition ${
            activeScreen === 'TargetSystems'
              ? 'bg-primary/5 text-primary'
              : 'text-slate-600 hover:bg-surface-container-low'
          }`}>
          <span className="material-symbols-outlined text-sm">hub</span>
          <span>Target Systems</span>
        </button>

        <div className="pt-3">
          <button
            onClick={onCreateWorkflow}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
            <span className="material-symbols-outlined text-sm">add</span>
            Add Step
          </button>
        </div>
      </nav>
    </aside>
  );
}

export default LeftPanel;
