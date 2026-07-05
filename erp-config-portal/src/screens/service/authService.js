import { request } from '../../common/api';

export const loginService = async ({ username, password }) => {
  const payload = { username, password };
  return request({ url: '/auth/login', method: 'POST', body: payload });
};
