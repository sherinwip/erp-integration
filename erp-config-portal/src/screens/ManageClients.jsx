import React, { useEffect, useState } from 'react';
import { useClient } from '../common/ClientContext.jsx';
import { listClients, createClient, updateClient, deleteClient } from '../common/api/clients.js';

const EMPTY_FORM = { client_id: '', client_name: '', is_active: true };

function ManageClients() {
  const { refreshClients } = useClient();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Form state — null = panel hidden
  const [form, setForm] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    listClients()
      .then(setClients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setIsEdit(false); setSaveError(null); };

  const openEdit = (c) => {
    setForm({ client_id: c.client_id, client_name: c.client_name, is_active: c.is_active });
    setIsEdit(true);
    setSaveError(null);
  };

  const handleDelete = async (c) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete client "${c.client_name}" (${c.client_id})?\n\nThis will also remove all associated targets, steps, and pipelines.`)) return;
    setDeleteError(null);
    try {
      await deleteClient(c.client_id);
      const updated = clients.filter((x) => x.client_id !== c.client_id);
      setClients(updated);
      if (form?.client_id === c.client_id) setForm(null);
      refreshClients();
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  const handleSave = async () => {
    if (!form.client_id.trim() || !form.client_name.trim()) {
      setSaveError('Client ID and Name are required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        const updated = await updateClient(form.client_id, {
          client_name: form.client_name.trim(),
          is_active: form.is_active,
        });
        setClients((c) => c.map((x) => (x.client_id === updated.client_id ? updated : x)));
      } else {
        const created = await createClient({
          client_id: form.client_id.trim(),
          client_name: form.client_name.trim(),
          is_active: form.is_active,
        });
        setClients((c) => [...c, created]);
      }
      setForm(null);
      refreshClients();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="grid w-full gap-4 xl:grid-cols-2">
      {/* ── Left: client list ───────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-outline-variant bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clients</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Client list</h2>
          </div>
          <button
            onClick={openCreate}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95">
            + Add Client
          </button>
        </div>

        <div className="space-y-3 p-5">
          {loading && <div className="py-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
          )}
          {deleteError && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{deleteError}</div>
          )}
          {!loading && !error && clients.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No clients configured. Add one to get started.
            </div>
          )}
          {clients.map((c) => (
            <div
              key={c.client_id}
              className={`rounded-3xl border px-4 py-4 transition ${
                form?.client_id === c.client_id
                  ? 'border-primary/70 bg-primary/5'
                  : 'border-outline-variant bg-slate-50'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{c.client_name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{c.client_id}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {c.is_active ? 'active' : 'inactive'}
                    </span>
                    {c.created_at && (
                      <span className="text-[10px] text-slate-400">
                        Created {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded-2xl border border-outline-variant bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-surface-container-high">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
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
              <span className="material-symbols-outlined text-2xl text-slate-400">corporate_fare</span>
            </div>
            <p className="text-sm font-semibold text-slate-700">No client selected</p>
            <p className="text-xs text-slate-400">
              Click <strong>+ Add Client</strong> or <strong>Edit</strong> on an existing client.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <p className="text-sm font-semibold text-slate-600">
                {isEdit ? 'Edit Client' : 'New Client'}
              </p>
              <button
                onClick={() => setForm(null)}
                className="rounded-full p-1.5 text-slate-400 transition hover:text-slate-600">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="space-y-4 p-5">
              {saveError && (
                <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{saveError}</div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client ID</p>
                <input
                  value={form.client_id}
                  onChange={(e) => setField('client_id', e.target.value)}
                  disabled={isEdit}
                  placeholder="e.g. acme-corp"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <p className="text-[10px] text-slate-400">
                  {isEdit ? 'Client ID cannot be changed after creation.' : 'Unique identifier — cannot be changed after creation.'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client Name</p>
                <input
                  value={form.client_name}
                  onChange={(e) => setField('client_name', e.target.value)}
                  placeholder="e.g. ACME Corporation"
                  className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                <button
                  type="button"
                  onClick={() => setField('is_active', !form.is_active)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                    form.is_active
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      form.is_active ? 'bg-green-500' : 'bg-slate-300'
                    }`}>
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        form.is_active ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  {form.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

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
                  {saving ? 'Saving…' : isEdit ? 'Update Client' : 'Save Client'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ManageClients;
