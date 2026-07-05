import { request } from './index.js';

export const listFieldMappings = (stepPk) => {
  const qs = stepPk !== null && stepPk !== undefined ? `?step_pk=${stepPk}` : '';
  return request({ url: `/field-mappings${qs}` });
};
export const createFieldMapping = (data) => request({ url: '/field-mappings', method: 'POST', body: data });
export const updateFieldMapping = (pk, data) => request({ url: `/field-mappings/${pk}`, method: 'PATCH', body: data });
export const deleteFieldMapping = (pk) => request({ url: `/field-mappings/${pk}`, method: 'DELETE' });
