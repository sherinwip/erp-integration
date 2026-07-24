import { request } from './index.js';

export const listPipelines = (clientId) => {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return request({ url: `/pipelines${qs}`, list: true });
};
export const getPipeline = (id) => request({ url: `/pipelines/${id}` });
export const createPipeline = (data) => request({ url: '/pipelines', method: 'POST', body: data });
export const updatePipeline = (id, data) => request({ url: `/pipelines/${id}`, method: 'PATCH', body: data });
export const deletePipeline = (id) => request({ url: `/pipelines/${id}`, method: 'DELETE' });
export const getPipelineSteps = (id) => request({ url: `/pipelines/${id}/steps`, list: true });
