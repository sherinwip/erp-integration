import React, { useEffect, useState } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { listTargets, createTarget, updateTarget, deleteTarget } from '../common/api/targets.js';

const EMPTY_FORM = {
  target_id: '',
  target_name: '',
  base_url: '',
  auth_type: 'apikey',
  credential_ref: '',
  default_headers: '{}',
  is_active: true,
};

function TargetSystems() {
  const { activeClientId } = useClient();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state — null = panel hidden
  const [form, setForm] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!activeClientId) { setTargets([]); return; }
    setLoading(true);
    setError(null);
    listTargets(activeClientId)
      .then(setTargets)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeClientId]);

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setIsEdit(false); setSaveError(null); };

  const openEdit = (t) => {
    setForm({
      target_id: t.target_id,
      target_name: t.target_name,
      base_url: t.base_url,
      auth_type: t.auth_type,
      credential_ref: t.credential_ref,
      default_headers: JSON.stringify(t.default_headers ?? {}, null, 2),
      is_active: t.is_active,
    });
    setIsEdit(true);
    setSaveError(null);
  };

  const handleDelete = async (t) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete target "${t.target_name}"?`)) return;
    try {
      await deleteTarget(t.target_id);
      setTargets((c) => c.filter((x) => x.target_id !== t.target_id));
      if (form?.target_id === t.target_id) setForm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    if (!form.target_id.trim() || !form.target_name.trim() || !form.base_url.trim()) {
      setSaveError('Target ID, Name, and Base URL are required.');
      return;
    }
    let parsedHeaders = {};
    try { parsedHeaders = JSON.parse(form.default_headers || '{}'); }
    catch { setSaveError('Default Headers must be valid JSON.'); return; }

    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        const updated = await updateTarget(form.target_id, {
          target_name: form.target_name.trim(),
          base_url: form.base_url.trim(),
          auth_type: form.auth_type,
          credential_ref: form.credential_ref.trim() || 'placeholder',
          default_headers: parsedHeaders,
          is_active: form.is_active,
        });
        setTargets((c) => c.map((x) => (x.target_id === updated.target_id ? updated : x)));
      } else {
        const created = await createTarget({
          target_id: form.target_id.trim(),
          client_id: activeClientId,
          target_name: form.target_name.trim(),
          base_url: form.base_url.trim(),
          auth_type: form.auth_type,
          credential_ref: form.credential_ref.trim() || 'placeholder',
          default_headers: parsedHeaders,
          is_active: form.is_active,
        });
        setTargets((c) => [...c, created]);
      }
      setForm(null);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="grid w-full gap-4 xl:grid-cols-2">
      {/* ── Left: list ─────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Target Systems</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {activeClientId ? `Client: ${activeClientId}` : 'Select a client'}
            </h2>
          </div>
          <button
            onClick={openCreate}
            disabled={!activeClientId}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
            + Add Target
          </button>
        </div>

        <div className="space-y-3 p-5">
          {loading && <div className="py-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && targets.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {activeClientId
                ? 'No target systems yet. Add one to get started.'
                : 'Select a client to view target systems.'}
            </div>
          )}
          {targets.map((t) => (
            <div
              key={t.target_id}
              className={`rounded-3xl border px-4 py-4 transition ${
                form?.target_id === t.target_id
                  ? 'border-primary/70 bg-primary/5'
                  : 'border-outline-variant bg-slate-50'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{t.target_name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{t.base_url}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {t.auth_type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        t.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {t.is_active ? 'active' : 'inactive'}
                    </span>
                    {t.credential_ref && t.credential_ref !== 'placeholder' && (
                      <span className="truncate text-[10px] text-slate-400">{t.credential_ref}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded-2xl border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-surface-container-high">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="rounded-2xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: Add / Edit form ──────────────────────────────────────── */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        {form === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <span className="material-symbols-outlined text-2xl text-slate-400">hub</span>
            </div>
            <p className="text-sm font-semibold text-slate-700">No target selected</p>
            <p className="text-xs text-slate-400">
              Click <strong>+ Add Target</strong> or <strong>Edit</strong> on an existing target.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <p className="text-sm font-semibold text-slate-600">
                {isEdit ? 'Edit Target System' : 'New Target System'}
              </p>
              <button
                onClick={() => setForm(null)}
                className="rounded-full p-1.5 text-slate-400 transition hover:text-slate-600">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="space-y-4 overflow-auto p-5">
              {saveError && (
                <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{saveError}</div>
              )}

              <Field label="Target ID" hint={isEdit ? 'Cannot be changed after creation' : 'Unique identifier, e.g. acme-salesforce'}>
                <input
                  value={form.target_id}
                  onChange={(e) => setField('target_id', e.target.value)}
                  disabled={isEdit}
                  placeholder="acme-salesforce-api"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </Field>

              <Field label="Target Name">
                <input
                  value={form.target_name}
                  onChange={(e) => setField('target_name', e.target.value)}
                  placeholder="e.g. Salesforce CRM API"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </Field>

              <Field label="Base URL">
                <input
                  value={form.base_url}
                  onChange={(e) => setField('base_url', e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Auth Type">
                  <select
                    value={form.auth_type}
                    onChange={(e) => setField('auth_type', e.target.value)}
                    className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                    <option value="apikey">API Key</option>
                    <option value="oauth2">OAuth 2.0</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </Field>

                <Field label="Status">
                  <button
                    type="button"
                    onClick={() => setField('is_active', !form.is_active)}
                    className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      form.is_active
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                    <span
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        form.is_active ? 'bg-green-500' : 'bg-slate-300'
                      }`}>
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          form.is_active ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                    {form.is_active ? 'Active' : 'Inactive'}
                  </button>
                </Field>
              </div>

              <Field label="Credential Ref" hint="Vault path, secret name, or identifier">
                <input
                  value={form.credential_ref}
                  onChange={(e) => setField('credential_ref', e.target.value)}
                  placeholder="e.g. vault/salesforce-apikey"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </Field>

              <Field label="Default Headers (JSON)">
                <textarea
                  value={form.default_headers}
                  onChange={(e) => setField('default_headers', e.target.value)}
                  rows={3}
                  placeholder='{}'
                  className="w-full resize-none rounded-2xl border border-outline-variant bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </Field>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setForm(null)}
                  className="flex-1 rounded-2xl border border-outline-variant bg-white py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-container-high">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-primary py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
                  {saving ? 'Saving…' : isEdit ? 'Update Target' : 'Save Target'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {children}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default TargetSystems;
