# Pipeline Routing, Configuration, and Database Requirements

## Document Information

| Property | Value |
|----------|-------|
| Document Title | Pipeline Routing, Configuration, and Database Design Requirements |
| Version | 1.0 |
| Status | Draft for Review |
| Parent Document | integration-engine-requirements-v2.md |
| Last Updated | 2026-07-04 |

### Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-07-04 | Initial draft: pipeline identification, configuration model, and DB schema |

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Pipeline Identification](#2-pipeline-identification)
3. [Pipeline Configuration Model](#3-pipeline-configuration-model)
4. [Database Schema](#4-database-schema)
5. [Configuration Management — JSON and CSV](#5-configuration-management--json-and-csv)
6. [Functional Requirements](#6-functional-requirements)
7. [Open Items](#7-open-items)

---

## 1. Purpose

This document defines:

- How the Dispatch API identifies which pipeline to execute for a given inbound request
- How a pipeline and its workflows (targets + steps) are structured and configured
- The database schema that stores pipeline routing, target config, steps, and field mappings
- How configurations are loaded and updated using JSON (pipeline/steps) and CSV (field mappings)

This document supplements the Integration Engine Functional Requirements (v2.0) and covers
the implementation-level design decisions for the configuration and routing layer.

---

## 2. Pipeline Identification

### 2.1 Design Decision — URL-Path Routing Key

The Dispatch API identifies the pipeline to execute from the inbound HTTP request URL.
No body inspection is required before routing.

**URL convention:**

```
POST /dispatch/{sourceSystem}/{objectType}?eventType={eventType}
```

| Segment | Required | Example | Notes |
|---------|----------|---------|-------|
| `sourceSystem` | Yes | `salesforce` | Lowercase; identifies the originating platform |
| `objectType` | Yes | `ContractAward` | The Salesforce object or event type |
| `clientId` | Yes | `AV`, `AKIMA` | Request body node, should be part of configuration |
| `eventType` | No | `create`, `update`, `delete` | Query parameter; defaults to wildcard `*` if omitted |

**Examples:**

```
POST /dispatch/salesforce/ContractAward?eventType=create
POST /dispatch/salesforce/Account?eventType=update
POST /dispatch/salesforce/ContractAward            ← matches wildcard pipeline
POST /dispatch/salesforce/Opportunity?eventType=close
```

### 2.2 Routing Lookup Logic

The Dispatch API performs a single indexed database lookup to find the active pipeline:

```sql
SELECT *
FROM   pipeline
WHERE  source_system = 'salesforce'
  AND  object_type   = 'ContractAward'
  AND  event_type    IN ('create', '*')
  AND  status        = 'active'
  AND  client_id        = 'AV'
ORDER BY event_type DESC          -- exact match ('create') ranked above wildcard ('*')
LIMIT  1;
```

**Matching priority:**

| Priority | Rule | Example |
|----------|------|---------|
| 1 (highest) | Exact match on all three segments | `salesforce + ContractAward + create` |
| 2 | Wildcard event type | `salesforce + ContractAward + *` |
| 3 (none) | No match found | Return `404 Pipeline Not Found` |

### 2.3 No-Match Behaviour

If no active pipeline is found:

```
HTTP 404 Not Found

{
  "error": "PipelineNotFound",
  "detail": "No active pipeline for sourceSystem='salesforce', objectType='ContractAward', eventType='create'",
  "correlationId": "corr-0a1b2c3d"
}
```

No downstream API calls are made. The event is logged and discarded.

### 2.4 Request Header — Correlation ID

Every inbound request must include or be assigned a Correlation ID before routing:

| Header | Source | Behaviour |
|--------|--------|-----------|
| `X-Correlation-ID` | Caller-supplied (preferred) | Used as-is; logged against all downstream calls |
| `X-Correlation-ID` | Not supplied | Dispatch API generates a UUID v4 and attaches it |

---

## 3. Pipeline Configuration Model

### 3.1 Overview

**Revised 2026-07-04, twice.** First pass flattened pipeline/target/step; second pass
(same day) made `step` reusable across pipelines, matching how `target` already works. A
pipeline is a complete end-to-end integration definition, owned by a client:

```
Client  (tenant; owns pipelines, targets, and steps)
   ├── Target(s)          (destination system: base URL, auth — reusable per client)
   ├── Step(s)            (single API-call definition — reusable per client;
   │                        each step points at exactly one target)
   └── Pipeline(s)        (routing key + retry policy + metadata)
           └── attaches N steps via pipeline_step (junction; carries seq)
```

- **1 client → N pipelines.** Each pipeline belongs to exactly one client.
- **1 client → N steps.** Steps are defined once per client (like targets) and attached to
  any number of that client's pipelines via the `pipeline_step` junction table.
- **1 pipeline → N steps** (via `pipeline_step`), and **1 step → N pipelines** (via the same
  junction) — a step defined once (e.g. "create contract in Oracle Fusion") can be reused
  by every pipeline that needs that exact call. `pipeline_step.seq` gives that step's
  execution order within each pipeline independently.
- **1 step → 1 target.** Every step references exactly one target system.
- **1 client → N targets.** A client's target systems (e.g. its Oracle Fusion connection, its
  SAP connection) are defined once and referenced by any of that client's steps.

Fan-out (PAT-06 through PAT-10) is expressed by a pipeline attaching steps that reference more
than one target; steps against different targets execute independently/in parallel, steps
against the same target execute in their `seq` order. Single-target patterns (PAT-01 through
PAT-05) have all attached steps referencing one target.

Editing a shared step (e.g. changing the Oracle contract-create body) updates it for every
pipeline that has attached it — this is the point of reuse, and the BA view `v_step_usage`
shows the blast radius before editing.

### 3.2 Template Expression Syntax

Steps use template expressions to inject dynamic values at runtime.

| Expression | Resolves To | Example |
|------------|-------------|---------|
| `{{source.fieldName}}` | Field from the inbound Salesforce payload | `{{source.contractName}}` |
| `{{steps.stepId.fieldName}}` | Value extracted from a prior step's response | `{{steps.lookup-project.ProjectId}}` |
| `{{target.fieldName}}` | Target-level config value | `{{target.baseUrl}}` |

### 3.3 Full Pipeline Configuration — Annotated JSON

**Note on `body` — superseded 2026-07-04 (third revision).** The JSON examples in this
section (§3.3–§3.5) show `body` authored inline on the step, as originally designed. As of
this revision, `step.body` is **removed** from the schema. A step's outbound request body is
built entirely from `field_mapping` rows (source_path → target_path, with transforms),
FK'd to the specific `step_pk` they feed — see §4.5b/§4.6. This keeps every field placement
editable as a flat, grid-friendly row instead of hand-authored JSON, and removes the
duplication risk of the same field being expressible in two places. The `body` blocks below
are kept as illustrations of the *resulting* payload shape, not as literal config.

The following example covers PAT-03 (Lookup then POST) targeting Oracle Fusion.
All config fields are shown with inline comments explaining their purpose.

```json
{
  "pipelineId": "award-to-oracle-contract-v1",
  "version": "1.0",
  "pattern": "PAT-03",
  "clientId": "AV",
  "status": "active",

  "source": {
    "system": "salesforce",
    "objectType": "ContractAward",
    "eventType": "create"
  },

  "retryPolicy": {
    "maxAttempts": 3,
    "backoff": "exponential",
    "backoffBaseMs": 2000,
    "retryOn": [500, 502, 503, 504]
  },

  "targets": [
    {
      "targetName": "OracleFusion",
      "baseUrl": "https://oracle-instance.oraclecloud.com",

      "auth": {
        "type": "oauth2",
        "tokenEndpoint": "/oauth/token",
        "credentialRef": "oracle-prod-creds"
      },

      "defaultHeaders": {
        "Content-Type": "application/json",
        "X-Correlation-ID": "{{correlationId}}"
      },

      "steps": [

        {
          "stepId": "lookup-project",
          "method": "GET",
          "path": "/fscmRestApi/resources/11.13.18.05/projects",
          "queryParams": {
            "q": "ProjectNumber='{{source.projectNumber}}'"
          },
          "extract": {
            "ProjectId": "items[0].ProjectId"
          },
          "onNotFound": "fail",
          "onMultipleResults": "useFirst"
        },

        {
          "stepId": "create-contract",
          "method": "POST",
          "path": "/fscmRestApi/resources/11.13.18.05/contracts",
          "body": {
            "ProjectId":      "{{steps.lookup-project.ProjectId}}",
            "ContractName":   "{{source.contractName}}",
            "ContractAmount": "{{source.amount}}",
            "CurrencyCode":   "{{source.currency}}"
          },
          "rollback": {
            "method": "DELETE",
            "path": "/fscmRestApi/resources/11.13.18.05/contracts/{{steps.create-contract.ContractId}}"
          }
        }

      ]
    }
  ]
}
```

### 3.4 Pipeline Config Field Reference

#### Pipeline (top-level)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pipelineId` | string | Yes | Unique identifier; used as DB primary key |
| `version` | string | Yes | Config version; informational |
| `pattern` | string | Yes | PAT-01 through PAT-10 |
| `clientId` | string | Yes | Client id received in request (header or body. TBD) |
| `status` | string | Yes | `active` or `inactive` |
| `source.system` | string | Yes | `salesforce` |
| `source.objectType` | string | Yes | Salesforce object name |
| `source.eventType` | string | No | `create`, `update`, `delete`, `*` (default) |
| `retryPolicy.maxAttempts` | int | Yes | Maximum retry attempts per step |
| `retryPolicy.backoff` | string | Yes | `exponential` or `fixed` |
| `retryPolicy.backoffBaseMs` | int | Yes | Base interval in milliseconds |
| `retryPolicy.retryOn` | int[] | Yes | HTTP status codes eligible for retry |

#### Target (workflow)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetName` | string | Yes | Display name; e.g., `OracleFusion`, `SAP`, `Salesforce-Org2` |
| `baseUrl` | string | Yes | Base URL for all steps in this target |
| `auth.type` | string | Yes | `oauth2`, `basic`, or `apikey` |
| `auth.credentialRef` | string | Yes | Key name in secrets manager (never a literal secret) |
| `defaultHeaders` | object | No | Headers applied to all steps unless overridden per step |
| `steps` | array | Yes | Ordered array of step objects |

#### Step

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stepId` | string | Yes | Unique within the pipeline; used in `{{steps.stepId.field}}` references |
| `method` | string | Yes | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `path` | string | Yes | URL path appended to `baseUrl`; supports template expressions |
| `queryParams` | object | No | Key-value query parameters; values support template expressions |
| ~~`body`~~ | ~~object~~ | ~~No~~ | **Removed.** Request body is built from `field_mapping` rows FK'd to this step (see §4.5b/§4.6), not authored inline |
| `headers` | object | No | Per-step header overrides |
| `extract` | object | No | JSON path expressions to extract values from the response; e.g., `"ProjectId": "items[0].ProjectId"` |
| `onNotFound` | string | No | Behaviour when `extract` path is empty: `fail` (default) or `skip` |
| `onMultipleResults` | string | No | Behaviour when array has > 1 item: `useFirst` or `fail` |
| `rollback.method` | string | No | HTTP method for the compensating call if a later step fails |
| `rollback.path` | string | No | URL path for the compensating call; supports template expressions |

### 3.5 Multi-Target Example — PAT-06 (Fan-out)

For patterns with multiple targets, the `targets` array contains one entry per destination system.
Each target executes independently and in parallel.

```json
{
  "pipelineId": "award-fanout-oracle-sap-v1",
  "pattern": "PAT-06",
  "status": "active",
  "source": { "system": "salesforce", "objectType": "ContractAward", "eventType": "create" },
  "retryPolicy": { "maxAttempts": 3, "backoff": "exponential", "backoffBaseMs": 2000, "retryOn": [500, 502, 503, 504] },
  "targets": [
    {
      "targetName": "OracleFusion",
      "baseUrl": "https://oracle-instance.oraclecloud.com",
      "auth": { "type": "oauth2", "credentialRef": "oracle-prod-creds" },
      "steps": [
        {
          "stepId": "create-contract",
          "method": "POST",
          "path": "/fscmRestApi/resources/11.13.18.05/contracts",
          "body": {
            "ContractName":   "{{source.contractName}}",
            "ContractAmount": "{{source.amount}}",
            "CurrencyCode":   "{{source.currency}}"
          }
        }
      ]
    },
    {
      "targetName": "SAP",
      "baseUrl": "https://sap-instance.example.com",
      "auth": { "type": "oauth2", "credentialRef": "sap-prod-creds" },
      "steps": [
        {
          "stepId": "create-contract",
          "method": "POST",
          "path": "/sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractSet",
          "body": {
            "ContractDesc": "{{source.contractName}}",
            "TotalValue":   "{{source.amount}}",
            "Waers":        "{{source.currency}}"
          }
        }
      ]
    }
  ]
}
```

---

## 4. Database Schema

### 4.1 Design Philosophy — Revised 2026-07-04 (twice)

- **Client-owned catalogs, junction-based attachment.** `client` owns `target`, `step`, and
  `pipeline` directly. `pipeline` attaches to `step` via the `pipeline_step` junction — a
  step is defined once per client and reused by any number of that client's pipelines.
- Steps are a **row-per-step table** (`step`), not a JSONB blob — grid-editable, one row per
  API call, referencing exactly one `target_id`.
- Targets are a **client-level table** (`target`) — a client's Oracle/SAP/etc. connection is
  defined once and referenced by any of that client's steps.
- Field mappings remain a **flat table** — CSV-loadable, BA-manageable in Excel.
- Pipeline routing uses a **single indexed lookup**, now including `client_id`.

### 4.2 Table: `client`

One row per client (tenant). Referenced by both `pipeline` and `target`.

```sql
CREATE TABLE client (
    client_id   VARCHAR(50)  PRIMARY KEY,     -- e.g. 'AV', 'AKIMA'; appears in dispatch request
    client_name VARCHAR(200) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

### 4.3 Table: `target`

One row per destination system per client. A client typically has one row per ERP
(OracleFusion, SAP, ...); any number of that client's steps may reference it.

```sql
CREATE TABLE target (
    target_id       VARCHAR(150)  PRIMARY KEY,        -- e.g., 'AV-oracle-fusion'
    client_id       VARCHAR(50)   NOT NULL REFERENCES client(client_id),
    target_name     VARCHAR(100)  NOT NULL,            -- 'OracleFusion','SAP','Salesforce-Org2'
    base_url        VARCHAR(500)  NOT NULL,
    auth_type       VARCHAR(20)   NOT NULL,            -- 'oauth2','basic','apikey'
    credential_ref  VARCHAR(200)  NOT NULL,            -- key in secrets manager
    default_headers JSONB         NOT NULL DEFAULT '{}',
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, target_name)
);

CREATE INDEX idx_target_client ON target (client_id) WHERE is_active = TRUE;
```

### 4.4 Table: `pipeline`

Stores the routing key (now including `client_id`), retry policy, and pipeline metadata.
One row per pipeline.

```sql
CREATE TABLE pipeline (
    pipeline_id          VARCHAR(100)  PRIMARY KEY,
    client_id            VARCHAR(50)   NOT NULL REFERENCES client(client_id),
    version              VARCHAR(20)   NOT NULL DEFAULT '1.0',
    source_system        VARCHAR(50)   NOT NULL,          -- e.g., 'salesforce'
    object_type          VARCHAR(100)  NOT NULL,          -- e.g., 'ContractAward'
    event_type           VARCHAR(50)   NOT NULL DEFAULT '*', -- 'create','update','delete','*'
    pattern_id           VARCHAR(10)   NOT NULL,          -- 'PAT-01' through 'PAT-10'
    status               VARCHAR(20)   NOT NULL DEFAULT 'active',  -- 'active','inactive'
    retry_max_attempts   INT           NOT NULL DEFAULT 3,
    retry_backoff        VARCHAR(20)   NOT NULL DEFAULT 'exponential', -- 'exponential','fixed'
    retry_backoff_base_ms INT          NOT NULL DEFAULT 2000,
    retry_on_status_codes VARCHAR(100) NOT NULL DEFAULT '500,502,503,504',
    created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Routing lookup index: the only query path for pipeline resolution
CREATE UNIQUE INDEX idx_pipeline_routing
    ON pipeline (client_id, source_system, object_type, event_type)
    WHERE status = 'active';
```

**Sample rows:**

| pipeline_id | client_id | source_system | object_type | event_type | pattern_id | status |
|-------------|-----------|---------------|-------------|------------|------------|--------|
| award-to-oracle-contract-v1 | AV | salesforce | ContractAward | create | PAT-03 | active |
| award-fanout-oracle-sap-v1 | AV | salesforce | ContractAward | update | PAT-06 | active |
| account-to-oracle-v1 | AKIMA | salesforce | Account | * | PAT-01 | active |

---

### 4.5 Table: `step`

One row per distinct API call, owned by a **client** (not a pipeline) — REUSABLE. References
exactly one target. Attached to any number of pipelines via `pipeline_step`.

**No `body` column** — superseded 2026-07-04 (third revision). The step's outbound request
body is assembled entirely from `field_mapping` rows FK'd to `step_pk` (§4.6); it is never
authored as a JSON blob on the step itself. This keeps every field placement grid-editable
and removes the risk of `body` and `field_mapping` drifting out of sync.

```sql
CREATE TABLE step (
    step_pk             BIGSERIAL     PRIMARY KEY,
    client_id           VARCHAR(50)   NOT NULL REFERENCES client(client_id),
    target_id           VARCHAR(150)  NOT NULL REFERENCES target(target_id),
    step_name           VARCHAR(100)  NOT NULL,   -- 'lookup-project'; used in {{steps.stepName.field}}
    method              VARCHAR(10)   NOT NULL,   -- 'GET','POST','PUT','PATCH','DELETE'
    path                VARCHAR(500)  NOT NULL,   -- supports {{...}} templates
    query_params        JSONB,
    headers             JSONB,
    extract             JSONB,                    -- {"ProjectId": "items[0].ProjectId"}
    on_not_found        VARCHAR(20)   NOT NULL DEFAULT 'fail',      -- 'fail','skip'
    on_multiple_results VARCHAR(20)   NOT NULL DEFAULT 'useFirst',  -- 'useFirst','fail'
    rollback_method     VARCHAR(10),
    rollback_path       VARCHAR(500),
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, step_name)
);

CREATE INDEX idx_step_client ON step (client_id) WHERE is_active = TRUE;
CREATE INDEX idx_step_target ON step (target_id);
```

### 4.5b Table: `pipeline_step` — junction (reuse point)

Attaches a client's steps to a client's pipelines. One row per attachment. `seq` gives that
step's execution order **within this pipeline** — the same step can hold a different `seq` in
a different pipeline.

```sql
CREATE TABLE pipeline_step (
    pipeline_step_pk BIGSERIAL     PRIMARY KEY,
    pipeline_id      VARCHAR(100)  NOT NULL REFERENCES pipeline(pipeline_id),
    step_pk          BIGINT        NOT NULL REFERENCES step(step_pk),
    seq              INT           NOT NULL,   -- execution order within this pipeline
    UNIQUE (pipeline_id, step_pk),
    UNIQUE (pipeline_id, seq)
);

CREATE INDEX idx_pipeline_step_pipeline ON pipeline_step (pipeline_id, seq);
```

Validation: `pipeline_step.pipeline_id` and the attached `step.client_id` must resolve to the
same client (enforced at load time; see §5.2).

**Sample rows — PAT-03 (Lookup then POST) against `AV-oracle-fusion`:**

`step` (defined once, client `AV`):

| step_pk | client_id | target_id | step_name | method | path |
|---|---|---|---|---|---|
| 1 | AV | AV-oracle-fusion | lookup-project | GET | /fscmRestApi/.../projects |
| 2 | AV | AV-oracle-fusion | create-contract | POST | /fscmRestApi/.../contracts |

`pipeline_step` (attaches both to one pipeline, in order):

| pipeline_id | step_pk | seq |
|---|---|---|
| award-to-oracle-contract-v1 | 1 | 1 |
| award-to-oracle-contract-v1 | 2 | 2 |

**Reuse example — a second pipeline reuses `create-contract` (step_pk 2) without
redefining it, giving it `seq=1` since this pipeline has no lookup step:**

| pipeline_id | step_pk | seq |
|---|---|---|
| award-direct-oracle-v1 | 2 | 1 |

**Fan-out (PAT-06) example — one pipeline attaches two steps against two different targets,
both `seq=1` (they execute in parallel because their targets differ):**

| pipeline_id | step_pk | seq | (step's target_id) |
|---|---|---|---|
| award-fanout-oracle-sap-v1 | 2 | 1 | AV-oracle-fusion |
| award-fanout-oracle-sap-v1 | 20 | 1 | AV-sap |

---

### 4.6 Table: `field_mapping`

**Revised 2026-07-04 (third revision) — now the sole source of a step's request body.**
Flat table storing one row per field mapping rule, FK'd to the exact `step_pk` it feeds.
Designed to be bulk-loaded via CSV. Replaces the previous `pipeline_id + target_name` shape:
a pipeline can have several steps against the same target with different bodies, which
`target_name` alone could not disambiguate — `step_pk` can.

```sql
CREATE TABLE field_mapping (
    mapping_pk       BIGSERIAL     PRIMARY KEY,
    step_pk          BIGINT        NOT NULL REFERENCES step(step_pk),  -- which step's body this feeds
    source_path      VARCHAR(200)  NOT NULL,  -- dot-notation source field, e.g., 'contract.name'
                                                --   or 'steps.lookup-project.ProjectId' for a prior-step value
    target_path      VARCHAR(200)  NOT NULL,  -- dot-notation target field, e.g., 'ContractName'
    transform_type   VARCHAR(50)   NOT NULL DEFAULT 'none',
        -- 'none' | 'date_format' | 'uppercase' | 'lowercase' | 'lookup' | 'calculate'
    transform_params VARCHAR(500)  NULL,      -- JSON string, e.g., '{"format":"DD-MON-YYYY"}'
    default_value    VARCHAR(500)  NULL,      -- applied when source is null or absent
    is_required      BOOLEAN       NOT NULL DEFAULT FALSE,
    sort_order       INT           NOT NULL DEFAULT 0,
    UNIQUE (step_pk, target_path)
);

CREATE INDEX idx_field_mapping_step ON field_mapping (step_pk, sort_order);
```

**`transform_type` values:**

| Value | Behaviour | `transform_params` example |
|-------|-----------|---------------------------|
| `none` | Pass value through unchanged | — |
| `date_format` | Reformat date string | `{"inputFormat":"yyyy-MM-dd","outputFormat":"DD-MON-YYYY"}` |
| `uppercase` | Convert string to upper case | — |
| `lowercase` | Convert string to lower case | — |
| `lookup` | Translate value via a static lookup table | `{"table":"currency_codes","key":"USD","valueField":"code"}` |
| `calculate` | Evaluate a simple expression | `{"expression":"{{source.unitPrice}} * {{source.quantity}}"}` |

**Sample rows — the exact `create-contract` body from §3.3, now expressed as mapping rows
instead of inline JSON (`step_pk = 2` from the §4.5b example):**

| mapping_pk | step_pk | source_path | target_path | transform_type | is_required | sort_order |
|---|---|---|---|---|---|---|
| 1 | 2 | `steps.lookup-project.ProjectId` | `ProjectId` | none | true | 1 |
| 2 | 2 | `contract.name` | `ContractName` | none | true | 2 |
| 3 | 2 | `amount` | `ContractAmount` | none | true | 3 |
| 4 | 2 | `currency` | `CurrencyCode` | none | false | 4 |

The engine builds the POST body at runtime by evaluating each row's `source_path` against
the inbound payload / prior step outputs and writing it to `target_path`, in `sort_order`.
A BA edits row 4 in a grid (or the CSV) to point `CurrencyCode` at a different source field —
no JSON, no redeploy.

---

### 4.7 Schema Relationships

```
client    (1)
    ├──── (N)  target         ← client's reusable destination systems
    ├──── (N)  step           ← client's reusable API-call definitions; each FKs to 1 target
    │           └──── (N)  field_mapping   ← builds this step's request body, row per field
    └──── (N)  pipeline
                  └──── (N)  pipeline_step  ← junction: attaches N reusable steps, each with its own seq

step      (1) ──── (N)  pipeline_step   ← one step attached to many pipelines (REUSE)
step      (1) ──── (N)  field_mapping   ← one step's body defined by many mapping rows
```

---

### 4.8 Full Runtime Query — What the Engine Runs

**Step 1 — Resolve pipeline from URL:**

```sql
SELECT pipeline_id, pattern_id,
       retry_max_attempts, retry_backoff, retry_backoff_base_ms, retry_on_status_codes
FROM   pipeline
WHERE  client_id     = $1           -- 'AV'
  AND  source_system = $2           -- 'salesforce'
  AND  object_type   = $3           -- 'ContractAward'
  AND  event_type    IN ($4, '*')   -- 'create' or wildcard
  AND  status        = 'active'
ORDER BY event_type DESC            -- exact match before wildcard
LIMIT  1;
```

**Step 2 — Load attached steps (via junction) and their targets:**

```sql
SELECT ps.seq, s.step_pk, s.step_name, s.method, s.path, s.query_params, s.headers,
       s.extract, s.on_not_found, s.on_multiple_results, s.rollback_method, s.rollback_path,
       t.target_id, t.target_name, t.base_url, t.auth_type, t.credential_ref, t.default_headers
FROM   pipeline_step ps
JOIN   step s   ON s.step_pk = ps.step_pk
JOIN   target t ON t.target_id = s.target_id
WHERE  ps.pipeline_id = $1
ORDER BY ps.seq;
```

**Step 3 — Load field mappings for every step returned above (one query, keyed by step_pk):**

```sql
SELECT step_pk, source_path, target_path, transform_type, transform_params,
       default_value, is_required
FROM   field_mapping
WHERE  step_pk = ANY($1)            -- array of step_pk values from Step 2
ORDER BY step_pk, sort_order;
```

All three queries use indexed lookups (step 2's target join is covered by `target`'s primary
key; step 3's lookup is covered by `idx_field_mapping_step`). Total DB round trips per
pipeline execution: **3**.

---

## 5. Configuration Management — JSON and CSV

### 5.1 When to Use Each Format

| Use Case | Format | Why |
|----------|--------|-----|
| Create or update a pipeline with its targets and steps | **JSON** | Hierarchical structure; steps are nested inside targets |
| Bulk-update field mappings | **CSV** | Flat tabular data; manageable in Excel; easily diff-ed in version control |
| Export a full pipeline for review or audit | **JSON** | Single document shows the complete end-to-end config |
| Onboard a new ERP target to an existing pipeline | **JSON** | Add a new target object to the targets array |
| Adjust field mapping rules without changing steps | **CSV** | A business analyst can edit without touching the pipeline JSON |

---

### 5.2 JSON Load — Pipeline Upsert

The Dispatch API (or a CLI tool) accepts a pipeline JSON file and upserts `client`, `target`,
`step`, `pipeline`, and `pipeline_step` rows in a single transaction. Steps referenced by
`stepName` that already exist for the client are reused, not duplicated.

**Load order:**
1. Upsert `client` row (if not already present)
2. Upsert `target` rows referenced by the pipeline (client-scoped; created once, reused across pipelines)
3. Upsert `step` rows by `(clientId, stepName)` (client-scoped; created once, reused across pipelines — existing steps are updated in place, which changes behaviour for every pipeline attaching them)
4. Upsert `pipeline` row from top-level fields, tagged with `clientId`
5. Upsert `pipeline_step` rows attaching each referenced `stepName` to this pipeline with its `seq`
6. Leave `field_mapping` unchanged unless a `fieldMappings[]` array is also present in the JSON — each mapping row is keyed to a `stepName`, not the pipeline, so it is loaded/updated the same way regardless of which pipeline triggered the load (see §5.3)

**Validation performed before any DB write:**
- `pattern` must be a known supported pattern (PAT-01 through PAT-10, excluding PAT-04 and PAT-09)
- Each `stepName` must be unique within the client; a pipeline may attach a given step at most once
- Every step's `targetId` must reference a `target` row belonging to the same `clientId`
- Every attached step must belong to the same `clientId` as the pipeline attaching it
- Template expressions `{{steps.X.Y}}` must reference a `stepName` attached earlier (by `seq`) in the same pipeline
- `auth.credentialRef` must not be a literal secret value (rejected if it contains common secret patterns)

**Example CLI usage:**
```bash
dispatch-cli pipeline load --file award-to-oracle-contract-v1.json --env prod
dispatch-cli pipeline deactivate --id award-to-oracle-contract-v1 --env prod
dispatch-cli pipeline show --id award-to-oracle-contract-v1
```

---

### 5.3 CSV Load — Field Mapping Bulk Update

**Revised 2026-07-04 (third revision).** Field mappings are managed as a CSV keyed by
`(client_id, step_name)` rather than `(pipeline_id, target_name)` — mappings now belong to a
reusable **step**, not a pipeline. The CSV replaces all existing mappings for the specified
step on each load (upsert by `target_path`; rows absent from the CSV for that step are
deleted). Because a step may be attached to several pipelines, editing its mapping CSV
changes the request body for every pipeline that uses it — the point of reuse.

**CSV column specification:**

| Column | Required | Valid Values / Format |
|--------|----------|-----------------------|
| `client_id` | Yes | Must match an existing `client.client_id` |
| `step_name` | Yes | Must match an existing `step.step_name` for that client |
| `source_path` | Yes | Dot-notation path into the source JSON, e.g., `contract.name`, or `steps.<stepName>.<field>` for a prior-step value |
| `target_path` | Yes | Dot-notation path into the request body, e.g., `ContractName` |
| `transform_type` | No | `none`, `date_format`, `uppercase`, `lowercase`, `lookup`, `calculate` |
| `transform_params` | No | JSON string (double-quote escaped in CSV) |
| `default_value` | No | Any string; applied when source is null or absent |
| `is_required` | No | `true` or `false` (default: `false`) |
| `sort_order` | No | Integer; lower numbers applied first (default: `0`) |

**Sample CSV — `AV-create-contract-mappings.csv`:**

```csv
client_id,step_name,source_path,target_path,transform_type,transform_params,default_value,is_required,sort_order
AV,create-contract,steps.lookup-project.ProjectId,ProjectId,none,,,true,1
AV,create-contract,contract.name,ContractName,none,,,true,2
AV,create-contract,amount,ContractAmount,none,,,true,3
AV,create-contract,currency,CurrencyCode,none,,USD,false,4
AV,create-contract,startDate,StartDate,date_format,"{""inputFormat"":""yyyy-MM-dd"",""outputFormat"":""DD-MON-YYYY""}",,true,5
```

**Example CLI usage:**
```bash
dispatch-cli mappings load --file award-to-oracle-contract-v1-mappings.csv --env prod
dispatch-cli mappings export --pipeline award-to-oracle-contract-v1 --env prod --out mappings.csv
```

---

### 5.4 Version Control Recommendation

Store all pipeline JSON files and mapping CSV files in the same Git repository.

```
config/
  pipelines/
    award-to-oracle-contract-v1.json
    award-fanout-oracle-sap-v1.json
    account-to-oracle-v1.json
  mappings/
    award-to-oracle-contract-v1-mappings.csv
    award-fanout-oracle-sap-v1-mappings.csv
    account-to-oracle-v1-mappings.csv
```

Changes to any config file go through a pull request review before being promoted to production.
The CI pipeline runs the validation step (schema + template expression checks) before merge.

---

## 6. Functional Requirements

All requirements follow `FR-{module}-{sequence}`.
Modules: `PID` (Pipeline Identification), `CFM` (Configuration Model), `DBS` (Database Schema), `CLM` (Config Load and Management).

---

### 6.1 Pipeline Identification (FR-PID)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PID-001 | The Dispatch API shall expose a routing endpoint at `POST /dispatch/{sourceSystem}/{objectType}` | P1 |
| FR-PID-002 | The `eventType` query parameter shall be optional; omitting it shall match pipelines with `event_type = '*'` | P1 |
| FR-PID-003 | An exact `event_type` match shall take precedence over a wildcard `*` match when both exist | P1 |
| FR-PID-004 | If no active pipeline is found for the routing key, the engine shall return HTTP 404 with a descriptive error and log the unmatched event | P1 |
| FR-PID-005 | If the caller supplies an `X-Correlation-ID` header, it shall be used as-is; if absent, the engine shall generate a UUID v4 and attach it to the request | P1 |
| FR-PID-006 | Pipeline resolution shall complete in a single indexed database query | P1 |

---

### 6.2 Configuration Model (FR-CFM)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CFM-001 | A pipeline configuration shall define exactly one source system, object type, event type, and client ID | P1 |
| FR-CFM-002 | A pipeline shall belong to exactly one client; a client may own many pipelines | P1 |
| FR-CFM-003rev | Each step shall reference exactly one target (`targetId`); a target may be referenced by many steps belonging to the same client | P1 |
| FR-CFM-003b | A client may define one or more targets (`targetName`, `baseUrl`, `auth`); targets are reusable across all of that client's steps and pipelines | P1 |
| FR-CFM-003c | A client may define one or more steps; a step is reusable and may be attached to any number of that client's pipelines via `pipeline_step`, each attachment carrying its own execution order (`seq`) | P1 |
| FR-CFM-004 | Each step shall have a unique `stepName` within its client; each pipeline shall attach a given step at most once | P1 |
| FR-CFM-005 | Template expressions `{{steps.X.Y}}` shall only reference a `stepName` attached earlier (by `seq`) in the same pipeline's step sequence | P1 |
| FR-CFM-006 | `auth.credentialRef` shall be a reference to a secrets manager key, never a literal credential value | P1 |
| FR-CFM-007 | A pipeline's attached steps shall support any combination of GET, POST, PUT, PATCH, and DELETE in any order, each independently targeted | P1 |
| FR-CFM-008 | A step's `rollback` block shall define the compensating API call to execute if a downstream step against the same target fails | P2 |
| FR-CFM-009 | `onNotFound` and `onMultipleResults` behaviours shall be configurable per step independently | P1 |

> **Superseded 2026-07-04 (twice):** the original FR-CFM-002/003 described targets as
> workflow containers owning an ordered `steps` array. A same-day revision flattened this to
> `pipeline → step → target`; a second same-day revision (this version) made `step` a
> client-level reusable catalog attached to pipelines via `pipeline_step`, mirroring how
> `target` already works (see §3.1).

---

### 6.3 Database Schema (FR-DBS)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DBS-001rev2 | The schema shall consist of six tables: `client`, `target`, `step`, `pipeline`, `pipeline_step`, `field_mapping` | P1 |
| FR-DBS-002 | The `pipeline` table routing index on `(client_id, source_system, object_type, event_type)` shall be unique for active pipelines | P1 |
| FR-DBS-003rev2 | Steps shall be stored one row per step in the client-owned `step` table, each with a `target_id` foreign key; attachment to pipelines (and execution order) shall be stored in `pipeline_step`, not duplicated per pipeline | P1 |
| FR-DBS-004rev | The `field_mapping` table shall be flat (no nested structures), FK'd to `step_pk`, and loadable from a CSV file without transformation | P1 |
| FR-DBS-009 | A `step` row shall not have a `body` column; a step's request body shall be assembled entirely from its `field_mapping` rows at runtime | P1 |
| FR-DBS-005 | Deactivating a pipeline (`status = 'inactive'`) shall not delete any rows; all history is preserved | P1 |
| FR-DBS-006rev | `target.is_active` and `step.is_active` shall allow individual client targets/steps to be disabled without deactivating any pipeline that references them | P2 |
| FR-DBS-007rev | A `target` and a `step` shall each belong to exactly one client; a `pipeline_step` attachment shall only be valid when its pipeline and its step belong to the same client | P1 |
| FR-DBS-008 | A given step may be attached to more than one pipeline; a given pipeline may attach more than one step; the same step may hold a different `seq` in each pipeline that attaches it | P1 |

> **Superseded 2026-07-04 (twice):** original FR-DBS-001/003/006 assumed the 3-table
> `pipeline`/`pipeline_target`/`field_mapping` model with JSONB steps. A same-day revision
> flattened `step` into `pipeline` (one row per step per pipeline). This version (same day)
> promotes `step` to a client-level reusable catalog with a `pipeline_step` junction table,
> so one step definition can serve many pipelines. See §4 for the current schema.

---

### 6.4 Configuration Load and Management (FR-CLM)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CLM-001rev | A pipeline JSON file shall be loadable via a CLI command or API endpoint that upserts `client`, `target`, `step`, `pipeline`, and `pipeline_step` in a single transaction | P1 |
| FR-CLM-002rev | A field mapping CSV file shall be loadable via a CLI command or API endpoint; the load shall replace all existing mappings for the given `client_id` and `step_name` | P1 |
| FR-CLM-003 | Pipeline and mapping configs shall be validatable without applying changes (`--dry-run` mode) | P1 |
| FR-CLM-004 | Validation shall reject configs where `pattern` is PAT-04 or PAT-09 with error `PatternNotSupported` | P1 |
| FR-CLM-005 | Validation shall reject configs where a template expression references a `stepId` that does not exist earlier in the same step sequence | P1 |
| FR-CLM-006 | Validation shall reject configs where `credentialRef` contains a value that matches a known secret pattern (e.g., starts with `Bearer `, contains `password=`) | P1 |
| FR-CLM-007 | All pipeline and mapping config files shall be storable in version control; the CI pipeline shall run validation before merge | P2 |
| FR-CLM-008rev | An export command shall produce a pipeline's current config (including its attached steps and their targets) as a JSON file, and each attached step's field mappings as a CSV file | P2 |

> **Superseded 2026-07-04 (third revision):** `step.body` is removed. FR-CLM-002 originally
> scoped mapping replacement to `pipeline_id + target_name`; mappings are now scoped to
> `step_pk` (loaded/exported by `client_id + step_name`), since the step — not the pipeline —
> is the reusable owner of its request body.

---

## 7. Open Items

| # | Item | Owner | Status |
|---|------|-------|--------|
| OI-01 | Confirm whether `event_type` wildcard `*` is sufficient or if regex/glob patterns are needed for event type matching | Architect | Open |
| OI-02 | Confirm whether `pipeline_target.steps` JSONB is acceptable for the target DB engine (PostgreSQL recommended; MySQL JSON support is more limited) | Engineering Lead | Open |
| OI-03 | Define the access control model for the config load CLI/API — who is authorised to push pipeline changes to production | Security / DevOps | Open |
| OI-04 | Confirm whether field mapping CSV loads should be additive (upsert only) or replace-all for the given pipeline + target; replace-all is currently specified | Engineering Lead | Open |
| OI-05 | Define naming convention for `credentialRef` keys in the secrets manager (e.g., `{env}/{targetName}/{type}`) | Security | Open |
