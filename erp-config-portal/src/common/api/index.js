const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000') + '/api/v1';

export async function request({ url, method = 'GET', body } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${url}`, opts);

  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.detail ?? `HTTP ${res.status}`);
  }
  return json;
}
