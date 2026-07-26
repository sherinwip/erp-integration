const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000') + '/client-config/api/v1/erp';
const AUTHORIZATION_TOKEN = import.meta.env.VITE_AUTHORIZATION_TOKEN ?? import.meta.env.AUTHORIZATION_TOKEN ?? 'VZZZZ';

// Backend wraps every response in a ResponseDto/TMErrorDto envelope
// ({ data } for a single object, { data_list } for a collection, { message }
// on error) instead of returning bare JSON. Field names are already
// snake_case on the wire (every DTO declares an explicit @JsonProperty),
// matching this frontend's convention, so no case conversion is needed.
export async function request({ url, method = 'GET', body, list = false } = {}) {
  const opts = {
    method,
    headers: { 
      "Authorization": `Bearer ${AUTHORIZATION_TOKEN}`,
      'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${url}`, opts);

  if (res.status === 204) return list ? [] : null;

  const envelope = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(envelope?.message ?? `HTTP ${res.status}`);
  }
  if (!envelope) return list ? [] : null;

  return list ? (envelope.data_list ?? []) : (envelope.data ?? null);
}
