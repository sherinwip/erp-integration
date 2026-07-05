import React, { useEffect, useMemo, useState } from "react";
import { useClient } from "../common/ClientContext.jsx";
import { getStep, createStep, updateStep } from "../common/api/steps.js";
import { listTargets, createTarget } from "../common/api/targets.js";
import { listFieldMappings, createFieldMapping, deleteFieldMapping } from "../common/api/fieldMappings.js";

// ── constants ─────────────────────────────────────────────────────────────────
const STEP_TYPE = { GET_STORE: "GET_STORE", TRANSFORM_POST: "TRANSFORM_POST" };

// ── helpers ───────────────────────────────────────────────────────────────────
function toKVArray(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}
function fromKVArray(pairs) {
  return pairs.reduce((acc, { key, value }) => (key ? { ...acc, [key]: value } : acc), {});
}
const getRuleBadgeClass = (type) => {
  switch (type) {
    case "CONCAT": return "bg-tertiary-container/10 text-on-tertiary-container";
    case "CONST": return "bg-tertiary-fixed/30 text-on-tertiary-fixed-variant";
    default: return "bg-primary/10 text-primary";
  }
};
const getRuleHelpText = (type) => {
  switch (type) {
    case "RENAME": return "Rename a source field. e.g. firstName → name";
    case "CONCAT": return "Concatenate fields. e.g. firstName + lastName → full_name";
    case "TRANSFORM": return "Apply a transformation to the source field.";
    case "CONST": return "Set a constant value for the target field.";
    case "VARIABLE": return "Use a variable value for the target field.";
    case "SPLIT": return "Split a source field into multiple target fields.";
    default: return "";
  }
};
const getNestedValue = (source, path) => {
  if (!source || !path) return undefined;
  let current = source;
  for (const seg of path.trim().split(".").filter(Boolean)) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[seg];
  }
  return current;
};
const INITIAL_SOURCE = JSON.stringify(
  { legacy_id: 10293, firstName: "John", lastName: "Doe", email_addr: "john.d@oldmail.com", status: 1, attributes: { tier: "premium", joined: "2022-05-12" } },
  null, 2,
);

// ── component ─────────────────────────────────────────────────────────────────
function CreateUpdateWorkflow({ stepPk, onBack }) {
  const { activeClientId } = useClient();

  // Step type — null shows type-selector (create mode only)
  const [stepType, setStepType] = useState(null);

  // Step fields
  const [stepName, setStepName] = useState("");
  const [method, setMethod] = useState("POST");
  const [stepPath, setStepPath] = useState("/");

  // Target system
  const [targets, setTargets] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [showNewTarget, setShowNewTarget] = useState(false);
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetBaseUrl, setNewTargetBaseUrl] = useState("");
  const [newTargetAuthType, setNewTargetAuthType] = useState("apikey");
  const [newTargetCredRef, setNewTargetCredRef] = useState("");

  // API call config
  const [queryParams, setQueryParams] = useState([]);
  const [requestHeaders, setRequestHeaders] = useState([]);
  const [extractMappings, setExtractMappings] = useState([]);

  // Transformation rules (TRANSFORM_POST only)
  const [rules, setRules] = useState([]);

  // Local-only source JSON preview
  const [sourceJson, setSourceJson] = useState(INITIAL_SOURCE);
  const [sourceData, setSourceData] = useState(JSON.parse(INITIAL_SOURCE));
  const [jsonError, setJsonError] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [savedOk, setSavedOk] = useState(false);

  // ── load targets whenever client changes ──────────────────────────────────
  useEffect(() => {
    if (!activeClientId) return;
    listTargets(activeClientId).then(setTargets).catch(() => {});
  }, [activeClientId]);

  // ── load step for edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (!stepPk) return;
    setLoading(true);
    setError(null);
    Promise.all([getStep(stepPk), listFieldMappings(stepPk)])
      .then(([stepData, mappings]) => {
        setStepName(stepData.step_name);
        setMethod(stepData.method);
        setStepPath(stepData.path ?? "/");
        setSelectedTargetId(stepData.target_id ?? "");
        setQueryParams(toKVArray(stepData.query_params));
        setRequestHeaders(toKVArray(stepData.headers));
        setExtractMappings(
          Object.entries(stepData.extract ?? {}).map(([target, source]) => ({ source, target })),
        );
        const sorted = [...mappings].sort((a, b) => a.sort_order - b.sort_order);
        setRules(sorted.map((m) => ({
          id: `rule-${m.mapping_pk}`,
          mapping_pk: m.mapping_pk,
          type: m.transform_type || "RENAME",
          source: m.source_path,
          target: m.target_path,
        })));
        setStepType(stepData.method === "GET" ? STEP_TYPE.GET_STORE : STEP_TYPE.TRANSFORM_POST);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [stepPk]);

  // keep method in sync with step type
  useEffect(() => {
    if (stepType === STEP_TYPE.GET_STORE) setMethod("GET");
    if (stepType === STEP_TYPE.TRANSFORM_POST && method === "GET") setMethod("POST");
  }, [stepType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── rule handlers ─────────────────────────────────────────────────────────
  const handleRuleChange = (index, field, value) =>
    setRules((c) => c.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const addRule = () =>
    setRules((c) => [...c, { id: `rule-new-${Date.now()}`, type: "RENAME", source: "", target: "" }]);
  const removeRule = (index) => setRules((c) => c.filter((_, i) => i !== index));

  // ── pair helpers ──────────────────────────────────────────────────────────
  const updatePair = (setter, index, field, value) =>
    setter((c) => c.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  const addPair = (setter) => setter((c) => [...c, { key: "", value: "" }]);
  const removePair = (setter, index) => setter((c) => c.filter((_, i) => i !== index));

  // ── source JSON preview ───────────────────────────────────────────────────
  const handleSourceJsonChange = (value) => {
    setSourceJson(value);
    try { setSourceData(JSON.parse(value)); setJsonError(""); }
    catch { setJsonError("Invalid JSON — preview uses last valid object."); }
  };

  const previewObject = useMemo(() =>
    rules.reduce((acc, rule, index) => {
      const key = rule.target || `field_${index + 1}`;
      let value;
      if (rule.type === "CONST") {
        value = (rule.source || '"active"').replace(/^"|"$/g, "");
      } else if (rule.type === "CONCAT") {
        value = (rule.source || "").split("+").map((p) => p.trim()).filter(Boolean)
          .map((p) => { const c = p.replace(/^['"]|['"]$/g, ""); return getNestedValue(sourceData, c) ?? c; })
          .join(" ");
      } else if (rule.type === "TRANSFORM") {
        const raw = getNestedValue(sourceData, rule.source) ?? rule.source;
        value = typeof raw === "string" ? raw.toUpperCase() : raw;
      } else {
        value = getNestedValue(sourceData, rule.source) ?? rule.source;
      }
      acc[key] = value;
      return acc;
    }, {}),
  [rules, sourceData]);

  const previewJson = useMemo(() => JSON.stringify(previewObject, null, 2), [previewObject]);

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!stepName.trim()) { setSaveError("Step name is required."); return; }
    if (!activeClientId) { setSaveError("Select a client first."); return; }
    if (!selectedTargetId && !showNewTarget) { setSaveError("Select or create a target system."); return; }
    if (showNewTarget && !newTargetBaseUrl.trim()) { setSaveError("Target base URL is required."); return; }

    setSaving(true); setSaveError(null); setSavedOk(false);
    try {
      // 1. Resolve / create target
      let tgtId = selectedTargetId;
      if (showNewTarget) {
        let hostname = newTargetBaseUrl.trim();
        try { hostname = new URL(hostname).hostname; } catch {}
        const slug = stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
        const newTgt = await createTarget({
          target_id: `${activeClientId.slice(0, 25)}-${slug}-${Date.now()}`.slice(0, 148),
          client_id: activeClientId,
          target_name: newTargetName.trim() || hostname || "api-target",
          base_url: newTargetBaseUrl.trim(),
          auth_type: newTargetAuthType,
          credential_ref: newTargetCredRef.trim() || "placeholder",
          default_headers: {},
          is_active: true,
        });
        tgtId = newTgt.target_id;
        setTargets((c) => [...c, newTgt]);
        setSelectedTargetId(newTgt.target_id);
        setShowNewTarget(false);
      }

      // 2. Build step payload
      const qpObj = fromKVArray(queryParams);
      const hdrsObj = fromKVArray(requestHeaders);
      const extObj = extractMappings.reduce(
        (acc, { source, target }) => (source && target ? { ...acc, [target]: source } : acc), {},
      );
      const stepPayload = {
        target_id: tgtId,
        step_name: stepName.trim(),
        method,
        path: stepPath || "/",
        query_params: Object.keys(qpObj).length ? qpObj : null,
        headers: Object.keys(hdrsObj).length ? hdrsObj : null,
        extract: Object.keys(extObj).length ? extObj : null,
      };

      const savedStep = stepPk
        ? await updateStep(stepPk, stepPayload)
        : await createStep({ ...stepPayload, client_id: activeClientId });

      // 3. Sync field mappings (TRANSFORM_POST only)
      if (stepType === STEP_TYPE.TRANSFORM_POST) {
        const existingPks = rules.filter((r) => r.mapping_pk).map((r) => r.mapping_pk);
        await Promise.all(existingPks.map((pk) => deleteFieldMapping(pk)));
        await Promise.all(
          rules.map((rule, i) =>
            createFieldMapping({
              step_pk: savedStep.step_pk,
              source_path: rule.source || "",
              target_path: rule.target || "",
              transform_type: rule.type,
              sort_order: i,
              is_required: false,
              array_source_path: "",
              array_target_path: "",
              is_singleton_array: false,
            }),
          ),
        );
      }

      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      if (!stepPk) onBack();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── early renders ─────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex w-full items-center justify-center py-20 text-sm text-slate-500">Loading step…</div>;
  }
  if (error) {
    return <div className="w-full rounded-[28px] border border-red-200 bg-red-50 p-8 text-sm text-red-600">{error}</div>;
  }

  // ── type selection screen (create mode only) ──────────────────────────────
  if (!stepType) {
    return (
      <div className="flex w-full flex-col items-center gap-8 py-12">
        <div className="text-center">
          <button onClick={onBack} className="mb-6 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Steps
          </button>
          <h2 className="text-2xl font-semibold text-slate-800">Select Step Type</h2>
          <p className="mt-2 text-sm text-slate-500">Choose how this step should operate within the pipeline.</p>
        </div>
        <div className="grid w-full max-w-2xl grid-cols-2 gap-5">
          <button
            onClick={() => setStepType(STEP_TYPE.GET_STORE)}
            className="flex flex-col items-start gap-3 rounded-[28px] border-2 border-outline-variant bg-white p-6 text-left shadow-sm transition hover:border-primary/50 hover:bg-primary/5 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
              <span className="material-symbols-outlined text-2xl">cloud_download</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900">GET &amp; Store Dependency</p>
              <p className="mt-1 text-xs text-slate-500">
                Fetch data from a target system using GET and store fields from the response for use in downstream steps.
              </p>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">GET only · No transformation</span>
          </button>
          <button
            onClick={() => setStepType(STEP_TYPE.TRANSFORM_POST)}
            className="flex flex-col items-start gap-3 rounded-[28px] border-2 border-outline-variant bg-white p-6 text-left shadow-sm transition hover:border-primary/50 hover:bg-primary/5 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
              <span className="material-symbols-outlined text-2xl">transform</span>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Transformation &amp; POST</p>
              <p className="mt-1 text-xs text-slate-500">
                Apply field mapping rules to transform source data, then send the result to a target system via POST, PUT, or PATCH.
              </p>
            </div>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">POST / PUT / PATCH · Field mapping</span>
          </button>
        </div>
      </div>
    );
  }

  const isGetStore = stepType === STEP_TYPE.GET_STORE;
  const typeBadge = isGetStore
    ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">GET &amp; Store</span>
    : <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">Transform &amp; POST</span>;

  // ── shared header bar ─────────────────────────────────────────────────────
  const headerBar = (
    <div className="flex items-center gap-4 rounded-[28px] border border-outline-variant bg-white px-5 py-4 shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">{typeBadge}</div>
        <input
          value={stepName}
          onChange={(e) => setStepName(e.target.value)}
          className="mt-1 w-full border-0 bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
          placeholder="Enter step name…"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {saveError && <span className="max-w-xs truncate text-xs text-red-600">{saveError}</span>}
        {savedOk && <span className="text-xs font-semibold text-green-600">Saved!</span>}
        {!stepPk && (
          <button onClick={() => setStepType(null)}
            className="rounded-2xl border border-outline-variant bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-surface-container-high">
            Change Type
          </button>
        )}
        <button onClick={onBack}
          className="rounded-2xl border border-outline-variant bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-container-high">
          Back
        </button>
        <button onClick={handleSave} disabled={saving}
          className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">
          {saving ? "Saving…" : "Save Step"}
        </button>
      </div>
    </div>
  );

  // ── inline Target Config panel ────────────────────────────────────────────
  const targetConfigPanel = (
    <div className="flex flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-white shadow-sm">
      <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
        <p className="text-sm font-semibold text-slate-600">Target Config</p>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-5">

        {/* ── Target System selector ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Target System</p>
          {!showNewTarget ? (
            <div className="space-y-2">
              <select
                value={selectedTargetId}
                onChange={(e) => {
                  if (e.target.value === "__new__") { setShowNewTarget(true); setSelectedTargetId(""); }
                  else setSelectedTargetId(e.target.value);
                }}
                className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                <option value="">Select a target…</option>
                {targets.map((t) => (
                  <option key={t.target_id} value={t.target_id}>
                    {t.target_name}
                  </option>
                ))}
                <option value="__new__">＋ New Target…</option>
              </select>
              {selectedTargetId && (() => {
                const tgt = targets.find((t) => t.target_id === selectedTargetId);
                return tgt ? (
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <span className="font-semibold">{tgt.base_url}</span> · {tgt.auth_type}
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-outline-variant bg-slate-50 p-3">
              {targets.length > 0 && (
                <button onClick={() => setShowNewTarget(false)}
                  className="text-xs font-semibold text-primary hover:text-primary/80">
                  ← Use existing target
                </button>
              )}
              <p className="text-xs font-semibold text-slate-600">New Target System</p>
              {[
                { label: "Name", val: newTargetName, set: setNewTargetName, ph: "e.g. Salesforce API" },
                { label: "Base URL", val: newTargetBaseUrl, set: setNewTargetBaseUrl, ph: "https://api.example.com" },
                { label: "Credential Ref", val: newTargetCredRef, set: setNewTargetCredRef, ph: "e.g. vault/sf-key" },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">{label}</p>
                  <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                    className="w-full rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary" />
                </div>
              ))}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Auth Type</p>
                <select value={newTargetAuthType} onChange={(e) => setNewTargetAuthType(e.target.value)}
                  className="w-full rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-primary">
                  <option value="apikey">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="basic">Basic Auth</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Method + Path ── */}
        <div className="grid grid-cols-[80px_1fr] items-end gap-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Method</p>
            {isGetStore ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-500">
                GET
              </div>
            ) : (
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-2xl border border-outline-variant bg-white px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                {["POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
              </select>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Path</p>
            <input value={stepPath} onChange={(e) => setStepPath(e.target.value)}
              placeholder="/v1/resource/{id}"
              className="w-full rounded-2xl border border-outline-variant bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </div>
        </div>

        {/* ── URL Parameters ── */}
        <PairSection label="URL Parameters" pairs={queryParams}
          onAdd={() => addPair(setQueryParams)}
          onUpdate={(i, f, v) => updatePair(setQueryParams, i, f, v)}
          onRemove={(i) => removePair(setQueryParams, i)} />

        {/* ── Request Headers ── */}
        <PairSection label="Headers" pairs={requestHeaders}
          onAdd={() => addPair(setRequestHeaders)}
          onUpdate={(i, f, v) => updatePair(setRequestHeaders, i, f, v)}
          onRemove={(i) => removePair(setRequestHeaders, i)} />

        {/* ── Response Extraction ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Response Extraction</p>
            <button onClick={() => setExtractMappings((c) => [...c, { source: "", target: "" }])}
              className="text-xs font-semibold text-primary hover:text-primary/80">+ Add</button>
          </div>
          {extractMappings.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={item.source}
                onChange={(e) => setExtractMappings((c) => c.map((x, idx) => idx === i ? { ...x, source: e.target.value } : x))}
                placeholder="response.path"
                className="flex-1 rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary" />
              <span className="material-symbols-outlined text-xs text-slate-400">arrow_forward</span>
              <input value={item.target}
                onChange={(e) => setExtractMappings((c) => c.map((x, idx) => idx === i ? { ...x, target: e.target.value } : x))}
                placeholder="var_name"
                className="flex-1 rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary" />
              <button onClick={() => setExtractMappings((c) => c.filter((_, idx) => idx !== i))}
                className="rounded-full p-1 text-slate-400 hover:text-red-500">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ))}
          {extractMappings.length === 0 && (
            <p className="text-xs text-slate-400">No extraction rules — response will not be stored.</p>
          )}
        </div>
      </div>
    </div>
  );

  // ── GET & Store layout ────────────────────────────────────────────────────
  if (isGetStore) {
    const storedPreview = extractMappings.length
      ? JSON.stringify(
          Object.fromEntries(
            extractMappings.filter((m) => m.target).map((m) => [m.target, `<from: ${m.source || "response"}>`]),
          ), null, 2,
        )
      : "// No extraction rules defined.\n// Add rules in Response Extraction above.";

    return (
      <div className="flex w-full flex-col gap-4">
        {headerBar}
        <div className="grid w-full gap-4 xl:grid-cols-2">
          {targetConfigPanel}
          {/* Stored variables preview */}
          <div className="flex flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-white shadow-sm">
            <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <p className="text-sm font-semibold text-slate-600">Stored Variables Preview</p>
              <p className="mt-0.5 text-xs text-slate-400">Variables available to downstream steps after this GET runs.</p>
            </div>
            <div className="flex-1 overflow-auto bg-slate-950 p-5">
              <pre className="min-h-40 overflow-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 font-code-md text-[12px] text-slate-100">
                {storedPreview}
              </pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Transformation & POST layout ──────────────────────────────────────────
  return (
    <div className="flex w-full flex-col gap-4">
      {headerBar}
      <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,0.65fr)_minmax(0,0.35fr)]">

        {/* Left: Source JSON + Transformation Rules */}
        <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
          {/* Source JSON */}
          <div className="flex h-[600px] w-full min-w-0 flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-white shadow-sm">
            <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <span className="text-sm font-semibold text-slate-600">Source JSON (Preview)</span>
            </div>
            <div className="flex-1 p-4">
              <textarea value={sourceJson} onChange={(e) => handleSourceJsonChange(e.target.value)}
                className="h-full min-h-[360px] w-full resize-none rounded-3xl border border-slate-700 bg-slate-950 px-4 py-4 font-code-md text-[13px] text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                spellCheck={false} />
              {jsonError && <p className="mt-3 text-sm text-amber-400">{jsonError}</p>}
            </div>
          </div>

          {/* Transformation Rules */}
          <div className="flex h-[600px] w-full min-w-0 flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3">
              <span className="text-sm font-semibold text-slate-600">Transformation Rules</span>
              <button type="button" onClick={addRule}
                className="rounded-2xl bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95">
                Add Rule
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              {rules.length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
                  No rules yet — add one to start mapping fields.
                </div>
              )}
              {rules.map((rule, index) => (
                <div key={rule.id} className="rounded-3xl border border-outline-variant bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <select value={rule.type} onChange={(e) => handleRuleChange(index, "type", e.target.value)}
                      className="rounded-2xl border border-outline-variant bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                      {["RENAME","CONCAT","TRANSFORM","CONST","VARIABLE","SPLIT"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <button type="button" onClick={() => removeRule(index)}
                      className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-semibold uppercase text-slate-500">
                      {rule.type === "CONST" ? "Constant Value" : "Source path or expression"}
                    </label>
                    <input value={rule.source} onChange={(e) => handleRuleChange(index, "source", e.target.value)}
                      placeholder="Source path or expression"
                      className="w-full rounded-2xl border border-outline bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-slate-400">arrow_forward</span>
                      <label className="block whitespace-nowrap text-[10px] font-semibold uppercase text-slate-500">Target field</label>
                      <input value={rule.target} onChange={(e) => handleRuleChange(index, "target", e.target.value)}
                        placeholder="Target field"
                        className="w-full rounded-2xl border border-outline bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                    </div>
                  </div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getRuleBadgeClass(rule.type)}`}>
                    {getRuleHelpText(rule.type)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Target Config + Output Preview */}
        <div className="flex flex-col gap-4">
          {targetConfigPanel}
          {/* Output Preview */}
          <div className="flex flex-col overflow-hidden rounded-[28px] border border-outline-variant bg-white shadow-sm">
            <div className="border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <span className="text-sm font-semibold text-slate-600">Output Preview</span>
            </div>
            <div className="overflow-auto bg-slate-950 p-4">
              <pre className="min-h-40 overflow-auto rounded-3xl border border-slate-800 bg-slate-950 p-4 font-code-md text-[12px] text-slate-100">
                {previewJson}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── shared sub-component ──────────────────────────────────────────────────────
function PairSection({ label, pairs, onAdd, onUpdate, onRemove }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <button onClick={onAdd} className="text-xs font-semibold text-primary hover:text-primary/80">+ Add</button>
      </div>
      {pairs.map((item, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={item.key} onChange={(e) => onUpdate(i, "key", e.target.value)} placeholder="key"
            className="w-1/3 rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary" />
          <input value={item.value} onChange={(e) => onUpdate(i, "value", e.target.value)} placeholder="value"
            className="flex-1 rounded-2xl border border-outline-variant bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-primary" />
          <button onClick={() => onRemove(i)} className="rounded-full p-1 text-slate-400 hover:text-red-500">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      ))}
      {pairs.length === 0 && <p className="text-xs text-slate-400">None configured.</p>}
    </div>
  );
}

export default CreateUpdateWorkflow;
