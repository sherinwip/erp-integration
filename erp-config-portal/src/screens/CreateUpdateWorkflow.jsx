import React, { useEffect, useMemo, useState } from "react";
import { useClient } from "../common/ClientContext.jsx";
import { getStep, createStep, updateStep } from "../common/api/steps.js";
import { listTargets, createTarget } from "../common/api/targets.js";
import { listFieldMappings, createFieldMapping, deleteFieldMapping } from "../common/api/fieldMappings.js";

// ── constants ─────────────────────────────────────────────────────────────────
const STEP_TYPE = { GET_STORE: "GET_STORE", TRANSFORM_POST: "TRANSFORM_POST" };

// Real transform_type values -- must stay in sync with erp-config-api's
// TransformType Literal (app/schemas/field_mapping.py) and the engine's
// SUPPORTED_TRANSFORM_TYPES (transformation-svc/erp_transform/transform.py).
// "CONST" is a UI-only rule kind: it doesn't send transform_type="CONST" --
// it serializes as source_path="__literal.<value>" with transform_type="none",
// which is how the engine actually resolves literal values.
const TRANSFORM_TYPES = [
  "none", "type_cast", "date_format", "date_add", "split_pick",
  "replace", "trim", "round", "uppercase", "lowercase", "titlecase",
];
const UI_RULE_KINDS = ["CONST", ...TRANSFORM_TYPES];
const LITERAL_PREFIX = "__literal.";

// transform_type values that need a transform_params JSON object.
const TYPES_WITH_PARAMS = new Set(["type_cast", "date_format", "date_add", "split_pick", "replace", "round"]);

// ── helpers ───────────────────────────────────────────────────────────────────
function toKVArray(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}
function fromKVArray(pairs) {
  return pairs.reduce((acc, { key, value }) => (key ? { ...acc, [key]: value } : acc), {});
}
const getRuleBadgeClass = (kind) => {
  switch (kind) {
    case "CONST": return "bg-tertiary-fixed/30 text-on-tertiary-fixed-variant";
    case "none": return "bg-slate-200 text-slate-600";
    default: return "bg-primary/10 text-primary";
  }
};
const getRuleHelpText = (kind) => {
  switch (kind) {
    case "CONST": return "Set a constant value for the target field.";
    case "none": return "Copy a source field through unchanged (rename only).";
    case "type_cast": return "Convert to int, float, bool, or string. e.g. \"42\" → 42";
    case "date_format": return "Reformat a date string.";
    case "date_add": return "Add/subtract days, months, or years from a date.";
    case "split_pick": return "Split on a delimiter, take the Nth part.";
    case "replace": return "Substitute a substring or regex match.";
    case "trim": return "Strip leading/trailing whitespace.";
    case "round": return "Round a number to N decimals.";
    case "uppercase": return "Convert to UPPER CASE.";
    case "lowercase": return "Convert to lower case.";
    case "titlecase": return "Convert To Title Case.";
    default: return "";
  }
};
const getParamsPlaceholder = (kind) => {
  switch (kind) {
    case "type_cast": return '{"targetType":"int"}';
    case "date_format": return '{"inputFormat":"yyyy-MM-dd","outputFormat":"MM-dd-yyyy"}';
    case "date_add": return '{"unit":"days","amount":30,"inputFormat":"yyyy-MM-dd","outputFormat":"yyyy-MM-dd"}';
    case "split_pick": return '{"delimiter":"-","index":0}';
    case "replace": return '{"find":"-","replace":"/","regex":false}';
    case "round": return '{"decimals":2}';
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
  const [showPreview, setShowPreview] = useState(false);

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
        setRules(sorted.map((m) => {
          const isLiteral = (m.source_path || "").startsWith(LITERAL_PREFIX);
          return {
            id: `rule-${m.mapping_pk}`,
            mapping_pk: m.mapping_pk,
            kind: isLiteral ? "CONST" : (m.transform_type || "none"),
            source: isLiteral ? m.source_path.slice(LITERAL_PREFIX.length) : m.source_path,
            target: m.target_path,
            params: m.transform_params || "",
          };
        }));
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

  // close full-screen preview on Escape
  useEffect(() => {
    if (!showPreview) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setShowPreview(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPreview]);

  // ── rule handlers ─────────────────────────────────────────────────────────
  const handleRuleChange = (index, field, value) =>
    setRules((c) => c.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  const addRule = () =>
    setRules((c) => [...c, { id: `rule-new-${Date.now()}`, kind: "none", source: "", target: "", params: "" }]);
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

  // Best-effort JS mirror of apply_field_transform() (transformation-svc/erp_transform/transform.py)
  // for live preview only -- the actual transform always runs server-side.
  const applyPreviewTransform = (raw, kind, paramsStr) => {
    if (raw === undefined || raw === null) return raw;
    let params = {};
    try { params = paramsStr ? JSON.parse(paramsStr) : {}; } catch { /* ignore invalid params in preview */ }
    switch (kind) {
      case "uppercase": return String(raw).toUpperCase();
      case "lowercase": return String(raw).toLowerCase();
      case "titlecase": return String(raw).replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
      case "trim": return String(raw).trim();
      case "round": return Number(Number(raw).toFixed(params.decimals ?? 0));
      case "type_cast":
        if (params.targetType === "int") return parseInt(raw, 10);
        if (params.targetType === "float") return parseFloat(raw);
        if (params.targetType === "bool") return ["true", "1", "yes"].includes(String(raw).toLowerCase());
        return String(raw);
      case "replace": {
        const find = params.find ?? "", repl = params.replace ?? "";
        return params.regex ? String(raw).replace(new RegExp(find, "g"), repl) : String(raw).split(find).join(repl);
      }
      case "split_pick": {
        const parts = String(raw).split(params.delimiter ?? ",");
        return parts[params.index ?? 0] ?? null;
      }
      case "date_format":
      case "date_add":
        return raw; // date math intentionally not mirrored in preview -- see server response after save
      default:
        return raw;
    }
  };

  const previewObject = useMemo(() =>
    rules.reduce((acc, rule, index) => {
      const key = rule.target || `field_${index + 1}`;
      let value;
      if (rule.kind === "CONST") {
        value = rule.source || "";
      } else {
        const raw = getNestedValue(sourceData, rule.source) ?? rule.source;
        value = applyPreviewTransform(raw, rule.kind, rule.params);
      }
      acc[key] = value;
      return acc;
    }, {}),
  [rules, sourceData]);

  const previewJson = useMemo(() => JSON.stringify(previewObject, null, 2), [previewObject]);

  const storedPreview = useMemo(
    () =>
      extractMappings.length
        ? JSON.stringify(
            Object.fromEntries(
              extractMappings
                .filter((m) => m.target)
                .map((m) => [m.target, `<from: ${m.source || "response"}>` ]),
            ),
            null,
            2,
          )
        : "// No extraction rules defined.\n// Add rules in Response Extraction above.",
    [extractMappings],
  );

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
              // "CONST" is UI-only -- the engine reads a literal value from
              // source_path prefixed with "__literal." (see transform.py),
              // not from transform_type.
              source_path: rule.kind === "CONST" ? `${LITERAL_PREFIX}${rule.source || ""}` : (rule.source || ""),
              target_path: rule.target || "",
              transform_type: rule.kind === "CONST" ? "none" : rule.kind,
              transform_params: TYPES_WITH_PARAMS.has(rule.kind) && rule.params ? rule.params : null,
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
        <button
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1.5 rounded-2xl border border-outline-variant bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-surface-container-high">
          <span className="material-symbols-outlined text-sm">preview</span>
          Preview
        </button>
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

  // ── full-screen preview overlay ───────────────────────────────────────────
  const previewOverlay = showPreview ? (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950">
      {/* Overlay header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-slate-400">preview</span>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {stepName || "Untitled Step"} — Full Preview
            </p>
            <p className="text-xs text-slate-500">
              Press{" "}
              <kbd className="rounded border border-slate-700 px-1 font-mono text-slate-400">Esc</kbd>
              {" "}or click × to close
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPreview(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
      {/* Overlay body: two columns */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Source JSON — editable */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-slate-800">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Source JSON</p>
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300">editable</span>
          </div>
          <textarea
            value={sourceJson}
            onChange={(e) => handleSourceJsonChange(e.target.value)}
            className="flex-1 resize-none bg-slate-950 px-6 py-5 font-mono text-sm leading-relaxed text-slate-100 outline-none focus:bg-[#0d1117]"
            spellCheck={false}
          />
          {jsonError && (
            <div className="shrink-0 border-t border-slate-800 bg-amber-900/30 px-5 py-2 text-xs text-amber-400">
              {jsonError}
            </div>
          )}
        </div>
        {/* Right: Output */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center border-b border-slate-800 bg-slate-900 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isGetStore ? "Stored Variables" : "Output Preview"}
            </p>
          </div>
          <pre className="flex-1 overflow-auto bg-slate-950 px-6 py-5 font-mono text-sm leading-relaxed text-slate-100">
            {isGetStore ? storedPreview : previewJson}
          </pre>
        </div>
      </div>
    </div>
  ) : null;

  // ── GET & Store layout ────────────────────────────────────────────────────
  if (isGetStore) {
    return (
      <>
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
        {previewOverlay}
      </>
    );
  }

  // ── Transformation & POST layout ──────────────────────────────────────────
  return (
    <>
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
                    <select value={rule.kind} onChange={(e) => handleRuleChange(index, "kind", e.target.value)}
                      className="rounded-2xl border border-outline-variant bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                      {UI_RULE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <button type="button" onClick={() => removeRule(index)}
                      className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-semibold uppercase text-slate-500">
                      {rule.kind === "CONST" ? "Constant Value" : "Source path"}
                    </label>
                    <input value={rule.source} onChange={(e) => handleRuleChange(index, "source", e.target.value)}
                      placeholder={rule.kind === "CONST" ? "e.g. active" : "e.g. contract.name"}
                      className="w-full rounded-2xl border border-outline bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-slate-400">arrow_forward</span>
                      <label className="block whitespace-nowrap text-[10px] font-semibold uppercase text-slate-500">Target field</label>
                      <input value={rule.target} onChange={(e) => handleRuleChange(index, "target", e.target.value)}
                        placeholder="Target field"
                        className="w-full rounded-2xl border border-outline bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                    </div>
                    {TYPES_WITH_PARAMS.has(rule.kind) && (
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-slate-500">Params (JSON)</label>
                        <input value={rule.params} onChange={(e) => handleRuleChange(index, "params", e.target.value)}
                          placeholder={getParamsPlaceholder(rule.kind)}
                          className="w-full rounded-2xl border border-outline bg-white px-2.5 py-2 font-mono text-[11px] text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      </div>
                    )}
                  </div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${getRuleBadgeClass(rule.kind)}`}>
                    {getRuleHelpText(rule.kind)}
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
    {previewOverlay}
    </>
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
