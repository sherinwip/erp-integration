import { request } from './index.js';

// steps === workflows in the UI
export const listSteps = (clientId) => {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
  return request({ url: `/steps${qs}` });
};
export const getStep = (stepPk) => request({ url: `/steps/${stepPk}` });
export const createStep = (data) => request({ url: '/steps', method: 'POST', body: data });
export const updateStep = (stepPk, data) => request({ url: `/steps/${stepPk}`, method: 'PATCH', body: data });
export const deleteStep = (stepPk) => request({ url: `/steps/${stepPk}`, method: 'DELETE' });
