import { request } from './index.js';

export const listClients = () => request({ url: '/clients' });
export const getClient = (id) => request({ url: `/clients/${id}` });
export const createClient = (data) => request({ url: '/clients', method: 'POST', body: data });
export const updateClient = (id, data) => request({ url: `/clients/${id}`, method: 'PATCH', body: data });
export const deleteClient = (id) => request({ url: `/clients/${id}`, method: 'DELETE' });
