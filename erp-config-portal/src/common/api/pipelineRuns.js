import { request } from './index.js';

export const listPipelineRuns = (pipelineId) => {
  const qs = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : '';
  return request({ url: `/pipeline-runs${qs}`, list: true });
};

export const getPipelineRun = (runId) => request({ url: `/pipeline-runs/${runId}` });

export const getPipelineRunSteps = (runId) => request({ url: `/pipeline-runs/${runId}/steps`, list: true });

export const getPipelineRunExtracts = (runId) => request({ url: `/pipeline-runs/${runId}/extracts`, list: true });

export const getStepExtracts = (runId, stepPk) =>
  request({ url: `/pipeline-runs/${runId}/steps/${stepPk}/extracts`, list: true });

export const rerunPipeline = (runId) =>
  request({ url: `/pipeline-runs/${runId}/rerun`, method: 'POST' });
