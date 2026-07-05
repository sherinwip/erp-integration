import { request } from './index.js';

export const attachStep = (data) => request({ url: '/pipeline-steps', method: 'POST', body: data });
export const updatePipelineStep = (pk, data) =>
  request({ url: `/pipeline-steps/${pk}`, method: 'PATCH', body: data });
export const detachStep = (pk) => request({ url: `/pipeline-steps/${pk}`, method: 'DELETE' });
