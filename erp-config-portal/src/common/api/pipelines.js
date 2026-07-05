import { request } from './index.js';

export const listPipelines = (clientId) => {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
  return request({ url: `/pipelines${qs}` });
};
export const getPipeline = (id) => request({ url: `/pipelines/${id}` });
export const createPipeline = (data) => request({ url: '/pipelines', method: 'POST', body: data });
export const updatePipeline = (id, data) => request({ url: `/pipelines/${id}`, method: 'PATCH', body: data });
export const deletePipeline = (id) => request({ url: `/pipelines/${id}`, method: 'DELETE' });
export const getPipelineSteps = (id) => request({ url: `/pipelines/${id}/steps` });
