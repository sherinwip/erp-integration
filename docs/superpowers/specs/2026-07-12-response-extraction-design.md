# Config-Driven Response Extraction — Design

## Problem

Pipeline steps (e.g. `fetchToken`) need to extract named values out of their
HTTP response body (e.g. `access_token`) and make them available to later
steps in the same pipeline run (e.g. as an `Authorization` header). The
config-portal UI for defining extraction rules per step already exists
(`CreateUpdateWorkflow.jsx`, "Response Extraction" section) and saves rules
into `step.extract` as `{var_name: source_path}`. Nothing in
`transformation-svc` currently reads or applies this field, and
`auth.py`'s oauth2 handling instead calls Secrets-Manager-stored
`tokenUrl`/`clientId`/`clientSecret` directly, bypassing step config
entirely. Additionally, `pipeline_run` and `raw_payload` — the tables that
would let an extraction result be scoped to "this run" — have no code
writing to them at all.

## Scope

One combined feature, in this order of dependency:

1. Minimal run/ingestion plumbing (`raw_payload` + `pipeline_run` rows),
   just enough to give extraction a `run_id` to scope to. Real webhook
   ingestion (deriving idempotency keys from inbound request headers,
   dedup/replay policy, quarantine handling) is explicitly **not** designed
   here — this uses a cheap synthetic idempotency key derived from
   `(pipeline_id, payload)` so CLI-driven runs work end-to-end.
2. Response extraction: JSONPath rules per step, applied to that step's
   real HTTP response, persisted per-run, made available to later steps.
3. Replacing `auth.py`'s inline oauth2 token fetch with a real `fetchToken`
   pipeline step + extraction, so oauth2 credentials are entirely
   config-driven like the user asked.

## Data Model

### `pipeline_run_extract` (new table)

| column   | type | notes |
|----------|------|-------|
| run_id   | uuid | FK `pipeline_run.run_id` |
| step_pk  | bigint | FK `step.step_pk` — which step produced this value |
| var_name | varchar(100) | the name the config defines, e.g. `access_token` |
| value    | text | extracted value, stringified |

PK: `(run_id, var_name)`. `var_name` is unique per run (not per step) since
that's the namespace later steps reference it by.

### `step.extract` (existing column, no shape change)

`{var_name: jsonpath_expr}`, e.g. `{"access_token": "$.access_token"}`.
Currently a free-form dict already; this design just starts writing valid
JSONPath strings into it and starts reading it.

## Config Portal Change

`src/screens/CreateUpdateWorkflow.jsx`, Response Extraction section: change
the `source` input's placeholder from `"response.path"` to `"$.access_token"`
to reflect JSONPath syntax. No other change — the existing `{source, target}`
row model and save/load mapping to `extract: {target: source}` is correct
as-is.

## Ingestion / Run Lifecycle (transformation-svc)

New `run_pipeline(pipeline_id: str, source: dict) -> dict` in
`orchestrator.py`, used for real (HTTP-sending) runs:

1. `idempotency_key = sha256(pipeline_id + json.dumps(source, sort_keys=True)).hexdigest()`.
2. Insert `raw_payload` row (`pipeline_id`, `idempotency_key`, `payload=source`).
   On unique-constraint conflict, look up and reuse the existing
   `raw_payload_id` instead of erroring (cheap dedup only — no replay/skip
   semantics beyond that).
3. Insert `pipeline_run` row: `raw_payload_id`, `pipeline_id`,
   `status='in_progress'`.
4. Run each attached `pipeline_step` in `seq` order for real (see next
   section).
5. On success: `pipeline_run.status='completed'`, `completed_at=now()`.
6. On any exception: `pipeline_run.status='failed'`, `completed_at=now()`,
   re-raise after updating the row.

`cli.py` gets a new `--send` flag. Without it, behavior is unchanged
(existing dry-run `transform_pipeline`, no HTTP, no DB writes beyond
reads). With `--send`, it calls `run_pipeline` instead.

## Extraction + Auth Flow

Per step, in seq order, within `run_pipeline`:

1. **Resolve credential:**
   - `auth_type` is `basic` or `apikey`: unchanged — `auth.get_credential(target)`
     (Secrets Manager path, untouched).
   - `auth_type` is `oauth2`: `auth._oauth2_client_credentials` is **removed**.
     Instead, the credential is expected to already be present as
     `extracted_scope["access_token"]`, populated by an earlier step in the
     same pipeline (e.g. `fetchToken` at seq=1). If missing when a step
     needing oauth2 executes, raise `AuthError("no access_token extracted
     before this step")`.
2. **Render templates:** `send._render_template` gets one new branch: a bare
   `{{var_name}}` (no dot, distinct from `{{source.x}}` / `{{steps.x.y}}`)
   resolves by direct lookup in `extracted_scope`. Applies to `path`,
   `query_params` values, and `headers` values.
3. **Execute:** `send.execute_step(...)` as today (real HTTP call).
4. **Extract:** if `step.extract` is set, for each `(var_name, jsonpath)`
   evaluate against the parsed JSON response body using `jsonpath-ng`.
   - Any path that resolves to nothing, or a non-JSON response body when
     extract rules exist → raise `ExtractionError`. This aborts the run
     (`pipeline_run.status='failed'`) — later steps are assumed to depend
     on the value (e.g. no token means auth will fail anyway), so failing
     loudly here beats a confusing downstream error.
   - All resolved `(var_name, value)` pairs are merged into the in-memory,
     run-scoped `extracted_scope` dict and inserted into
     `pipeline_run_extract`.
5. Continue to next step with the updated `extracted_scope`.

New small module `erp_transform/extract.py`: `ExtractionError` and
`apply_extract_rules(response_body: Any, rules: dict[str, str]) -> dict[str, Any]`.

New dependency: `jsonpath-ng`, added to `requirements.txt`.

## Testing

- `extract.py` unit tests: single match, nested path, array index, no-match
  (raises), non-dict response body (raises).
- `send._render_template` unit test: new bare `{{var}}` branch, alongside
  existing `{{source.x}}` / `{{steps.x.y}}` cases.
- `orchestrator.run_pipeline` integration test (real test DB, mirroring the
  `vaibhav1-DEMO` fixture: `fetchToken` seq=1 → `create-oracle-contract-demo`
  seq=2):
  - Happy path: `fetchToken`'s response yields `access_token`, business step
    receives it via `{{access_token}}` in its `Authorization` header;
    `pipeline_run` ends `completed`; `pipeline_run_extract` has the row.
  - Failure path: `fetchToken`'s extract rule references a JSONPath that
    doesn't exist in the response → `pipeline_run` ends `failed`, business
    step never runs.
