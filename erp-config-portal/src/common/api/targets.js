import { request } from './index.js';

export const listTargets = (clientId) => {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
  return request({ url: `/targets${qs}` });
};
export const getTarget = (id) => request({ url: `/targets/${id}` });
export const createTarget = (data) => request({ url: '/targets', method: 'POST', body: data });
export const updateTarget = (id, data) => request({ url: `/targets/${id}`, method: 'PATCH', body: data });
export const deleteTarget = (id) => request({ url: `/targets/${id}`, method: 'DELETE' });
