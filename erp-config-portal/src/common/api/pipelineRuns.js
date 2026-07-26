import { request } from './index.js';

export const listPipelineRuns = (clientId, pipelineId) => {
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  if (pipelineId) params.set('pipelineId', pipelineId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request({ url: `/pipeline-runs${qs}`, list: true });
};

export const getPipelineRun = (runId) => request({ url: `/pipeline-runs/${runId}` });

export const getPipelineRunStats = (clientId, pipelineId, from, to) => {
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  if (pipelineId) params.set('pipelineId', pipelineId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request({ url: `/pipeline-runs/stats${qs}` });
};

export const getPipelineRunSteps = (runId) => request({ url: `/pipeline-runs/${runId}/steps`, list: true });

export const getPipelineRunExtracts = (runId) => request({ url: `/pipeline-runs/${runId}/extracts`, list: true });

export const getStepExtracts = (runId, stepPk) =>
  request({ url: `/pipeline-runs/${runId}/steps/${stepPk}/extracts`, list: true });

export const rerunPipeline = (runId) =>
  request({ url: `/pipeline-runs/${runId}/rerun`, method: 'POST' });
