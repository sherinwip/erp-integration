import React, { useState } from 'react';
import WorkflowList from './WorkflowList';
import CreateUpdateWorkflow from './CreateUpdateWorkflow';
import PipelineList from './PipelineList';
import ViewEditPipeline from './ViewEditPipeline';
import TargetSystems from './TargetSystems';
import ManageClients from './ManageClients';
import LeftPanel from '../components/LeftPanel';
import { useClient } from '../common/ClientContext.jsx';

function Home() {
  const { clients, activeClientId, setActiveClientId, loading: clientLoading } = useClient();
  const [activeScreen, setActiveScreen] = useState('WorkflowList');
  const [selectedStepPk, setSelectedStepPk] = useState(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);

  const openWorkflowEditor = (stepPk) => {
    setSelectedStepPk(stepPk);
    setActiveScreen('CreateUpdateWorkflow');
  };

  const openPipelineEditor = (pipelineId) => {
    setSelectedPipelineId(pipelineId);
    setActiveScreen('ViewEditPipeline');
  };

  const handleClientChange = (value) => {
    if (value === '__manage__') {
      setActiveScreen('ManageClients');
    } else {
      setActiveClientId(value);
    }
  };

  const getTitle = () => {
    switch (activeScreen) {
      case 'WorkflowList': return 'Steps';
      case 'CreateUpdateWorkflow': return selectedStepPk ? 'Edit Step' : 'New Step';
      case 'PipelineList': return 'Pipelines';
      case 'ViewEditPipeline': return selectedPipelineId ? 'Edit Pipeline' : 'New Pipeline';
      case 'TargetSystems': return 'Target Systems';
      case 'ManageClients': return 'Manage Clients';
      default: return 'ConfigSys';
    }
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case 'WorkflowList':
        return <WorkflowList onOpenWorkflow={openWorkflowEditor} />;
      case 'CreateUpdateWorkflow':
        return <CreateUpdateWorkflow stepPk={selectedStepPk} onBack={() => setActiveScreen('WorkflowList')} />;
      case 'PipelineList':
        return <PipelineList onOpenPipeline={openPipelineEditor} />;
      case 'ViewEditPipeline':
        return <ViewEditPipeline pipelineId={selectedPipelineId} onBack={() => setActiveScreen('PipelineList')} />;
      case 'TargetSystems':
        return <TargetSystems />;
      case 'ManageClients':
        return <ManageClients />;
      default:
        return <WorkflowList onOpenWorkflow={openWorkflowEditor} />;
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-surface text-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-desktop font-body-md text-body-md">
        <div className="flex items-center gap-xl">
          <span className="font-display-lg text-display-lg font-bold text-primary left-3">Integration Config</span>
        </div>

        <div className="flex items-center gap-md">
          {/* Client selector + Manage Clients */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Client</span>
            {clientLoading ? (
              <span className="text-xs text-slate-400">Loading…</span>
            ) : null}
            {!clientLoading && clients.length === 0 ? (
              <button
                onClick={() => setActiveScreen('ManageClients')}
                className="rounded-2xl bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95">
                + Add Client
              </button>
            ) : null}
            {!clientLoading && clients.length > 0 ? (
              <select
                value={activeClientId ?? ''}
                onChange={(e) => handleClientChange(e.target.value)}
                className="rounded-2xl border border-outline-variant bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.client_name} ({c.client_id})
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="__manage__">⚙ Manage Clients</option>
              </select>
            ) : null}
          </div>

          <button className="rounded-full p-2 transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <div className="ml-2 h-8 w-8 overflow-hidden rounded-full border border-outline-variant bg-secondary-container">
            <img
              alt="User avatar"
              className="h-full w-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDSJr1ywKtIR1a91YWQuprKAdB04KGIhCAJjKkTgsTXqYMvNHh_j6eNVVbredLC-V51N9TTafmhevWBbIpzOiUvS6Q0rdJyJ8EZNYmCiZ6FVj_8oTpGgsa6x8rpDZmD1V-m7Fu8aIu9Xqxny0WZhuEPnNQZeB4BimS1HhubBa5h7XrIsPeP-cF1CUig-LqCE76d2F7y8n5_frdA5J0EwvEiECnWxfat4dbBZEw8zeUEeyQZCpnrB5wGjeVP0AKiocsJpGx7wzX2u0i0"
            />
          </div>
        </div>
      </header>

      <div className="flex h-full pt-16">
        <LeftPanel
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          onCreateWorkflow={() => openWorkflowEditor(null)}
        />

        <main className="ml-64 flex min-h-screen flex-1 flex-col overflow-y-auto bg-background">
          <div className="border-b border-outline-variant bg-surface px-6 pb-5 pt-5">
            <h1 className="text-2xl font-semibold text-on-surface">{getTitle()}</h1>
          </div>

          <div className="flex min-h-[calc(100vh-200px)] flex-1 gap-3 px-6 pb-6 pt-5">
            {renderScreen()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Home;
