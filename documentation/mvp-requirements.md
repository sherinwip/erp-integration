# Integration Engine — MVP Requirements (P1 Only)

## Document Information

| Property | Value |
|----------|-------|
| Document Title | Integration Engine MVP Functional Requirements |
| Version | 1.0 |
| Status | Draft for Review |
| Derived From | integration-engine-requirements-v2.md, pipeline-routing-config-db-requirements.md |
| Scope Rule | Only items tagged **P1** ("Must-have; blocking for MVP") in the source docs are included here |
| Last Updated | 2026-07-04 |

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Priority Definition](#2-priority-definition)
3. [Supported Integration Patterns (MVP)](#3-supported-integration-patterns-mvp)
4. [Functional Requirements](#4-functional-requirements)
5. [Pipeline Identification and Routing](#5-pipeline-identification-and-routing)
6. [Configuration Model](#6-configuration-model)
7. [Database Schema](#7-database-schema)
8. [Non-Functional Requirements (MVP)](#8-non-functional-requirements-mvp)
9. [Explicitly Deferred (Not in MVP)](#9-explicitly-deferred-not-in-mvp)

---

## 1. Purpose and Scope

Minimum viable version of the Integration Engine (Dispatch API). Covers only what's needed
to accept a Salesforce event, transform it, call Oracle Fusion (single or fan-out target),
resolve dependencies via lookup, handle errors/retry, and log — the smallest slice that is
independently shippable and demoable.

**Primary validated target: Salesforce → Oracle Fusion.** Other ERPs (SAP, D365) are
architecturally reachable via config but are P5/out-of-scope for MVP integration testing.

## 2. Priority Definition

| Priority | Meaning | MVP? |
|----------|---------|------|
| **P1** | Must-have; core engine functionality; blocking for MVP | ✅ Included in this document |
| P2–P5 | Deferred to later releases | ❌ Not in this document — see §9 |

---

## 3. Supported Integration Patterns (MVP)

Only 3 of the 10 catalog patterns are P1. The rest (sequential chains, split payloads,
fan-out with lookup, fan-out split) are deferred.

| ID | Pattern Name | Description | Priority |
|----|---------------|--------------|----------|
| **PAT-01** | Simple Transform and POST | 1 inbound payload → 1 ERP payload → 1 POST → 1 target | P1 |
| **PAT-03** | Lookup then POST | GET lookup to resolve a dependency, then 1 POST → 1 target | P1 |
| **PAT-06** | Fan-out Simple POST | 1 payload → 1 POST per target → multiple targets in parallel | P1 |

Full flow diagrams, concrete request/response examples, and acceptance criteria for these
three patterns are unchanged from `integration-engine-requirements-v2.md` §5.1, §5.3, §5.6 —
not duplicated here to avoid drift. Refer to those sections directly.

**Not supported at all (any release):** PAT-04, PAT-09 — rejected at config load time.

---

## 4. Functional Requirements

Only P1 rows from the source FR tables. IDs preserved for traceability back to the parent doc.

### 4.1 Payload Transformation (FR-TRN)

| ID | Requirement |
|----|-------------|
| FR-TRN-001 | Accept and parse valid JSON payloads from Salesforce |
| FR-TRN-002 | Configurable field-to-field mapping via dot-notation path expressions |
| FR-TRN-003 | Support mapping Salesforce flat fields to nested ERP objects |
| FR-TRN-004 | Support mapping array fields and their child elements |
| FR-TRN-005 | Support conditional mapping rules (map field X only if field Y = Z) |
| FR-TRN-006 | Apply configurable default values when a source field is null/absent |
| FR-TRN-008 | Support value conversion: type binding, date format transform, split-n-pick, substitute/replace, trim, round, max, case transform |

### 4.2 API Orchestration (FR-ORC)

| ID | Requirement |
|----|-------------|
| FR-ORC-001 | Support HTTP GET |
| FR-ORC-002 | Support HTTP POST |
| FR-ORC-006 | Each API step independently configurable: endpoint, method, headers, query params, body |
| FR-ORC-007 | Support sequential API chains where later steps depend on earlier responses |
| FR-ORC-008 | Support parallel fan-out execution across multiple ERP targets |
| FR-ORC-009 | Per-ERP auth credentials (OAuth 2.0, Basic Auth, API Key) independently configurable |
| FR-ORC-010 | API call timeout configurable per step; default 30s |

### 4.3 Dependency Handling (FR-DEP)

| ID | Requirement |
|----|-------------|
| FR-DEP-001 | Extract values from previous API response bodies via JSON path expressions |
| FR-DEP-002 | Extracted values injectable into subsequent request URL paths |
| FR-DEP-003 | Extracted values injectable into subsequent request query parameters |
| FR-DEP-004 | Extracted values injectable into subsequent request bodies |
| FR-DEP-006 | Missing/empty dependency halts the dependent call chain; failure logged with reason |

### 4.4 Target Routing (FR-RTE)

| ID | Requirement |
|----|-------------|
| FR-RTE-001 | Support routing to Oracle Fusion (primary, integration-tested) |
| FR-RTE-005 | Support routing to any REST/JSON-accepting system via config, no code changes (design principle; only Oracle integration-tested in MVP) |
| FR-RTE-006 | A pipeline configuration shall support one or more target systems |
| FR-RTE-007 | Each target system independently configurable: base URL, endpoints, auth, default headers |

### 4.5 Error Handling (FR-ERR)

| ID | Requirement |
|----|-------------|
| FR-ERR-001 | Capture and persist full request payload for every API call |
| FR-ERR-002 | Capture and persist full response payload for every API call |
| FR-ERR-003 | Capture and persist HTTP status code for every API call |
| FR-ERR-004 | Capture and persist execution time for every API call |
| FR-ERR-005 | Validate pipeline config and payload before any API calls; failures → `Failed-ValidationError` |
| FR-ERR-006 | Configurable retry: max attempts, backoff (fixed/exponential), eligible status codes |
| FR-ERR-008 | Transaction terminates in exactly one of: `Completed`, `PartialFailure`, `Failed`, `Failed-ValidationError`, `Failed-DependencyNotFound`, `Failed-RetryExhausted`, `Failed-ConfigError` |
| FR-ERR-009 | A failed pipeline execution shall not affect other concurrent pipeline executions |

### 4.6 Observability and Logging (FR-LOG)

| ID | Requirement |
|----|-------------|
| FR-LOG-001 | Every log entry includes a Correlation ID tied to the originating Salesforce event |
| FR-LOG-002 | Every API call log entry includes a Transaction ID unique to that call |
| FR-LOG-003 | Log: Source Object, Destination ERP, Pipeline ID, API Step ID, Endpoint, HTTP Method |
| FR-LOG-004 | Log: Request Payload, Response Payload, Response Code, Processing Time (ms) |
| FR-LOG-005 | Log: Retry Count, Error Details, Final Transaction Status |
| FR-LOG-007 | Sensitive values (tokens, passwords, secrets) masked in all log entries |

### 4.7 Configuration-Driven Architecture (FR-CFG)

| ID | Requirement |
|----|-------------|
| FR-CFG-001 | All integration behaviour fully defined by pipeline configuration; no code changes for new integrations |
| FR-CFG-002 | Pipeline config defines: source object, target ERP(s), pattern ID, field mapping rules, orchestration steps, retry policy, rollback steps |
| FR-CFG-003 | Pipeline configs validated at load time; invalid configs rejected with descriptive errors |
| FR-CFG-004 | New ERP integration onboardable by adding a pipeline config, no redeployment |

---

## 5. Pipeline Identification and Routing

All P1 in the parent doc — this is foundational and not trimmable for MVP.

### 5.1 Routing Endpoint

```
POST /dispatch/{sourceSystem}/{objectType}?eventType={eventType}
```

Routing resolved via single indexed DB lookup on `(client_id, source_system, object_type, event_type)`,
exact `event_type` match ranked above wildcard `*`.

### 5.2 FR-PID (Pipeline Identification) — all P1

| ID | Requirement |
|----|-------------|
| FR-PID-001 | Expose routing endpoint at `POST /dispatch/{sourceSystem}/{objectType}` |
| FR-PID-002 | `eventType` query param optional; omitted → matches `event_type = '*'` |
| FR-PID-003 | Exact `event_type` match takes precedence over wildcard |
| FR-PID-004 | No active pipeline found → HTTP 404 with descriptive error; event logged |
| FR-PID-005 | Caller-supplied `X-Correlation-ID` used as-is; if absent, engine generates UUID v4 |
| FR-PID-006 | Pipeline resolution completes in a single indexed DB query |

---

## 6. Configuration Model

Structure unchanged from parent doc (all P1):

```
Client  (tenant; owns pipelines, targets, and steps)
   ├── Target(s)          (destination system: base URL, auth — reusable per client)
   ├── Step(s)            (single API-call definition — reusable per client)
   └── Pipeline(s)        (routing key + retry policy + metadata)
           └── attaches N steps via pipeline_step (junction; carries seq)
```

Key rules (all P1):
- 1 client → N pipelines; 1 pipeline → exactly 1 client.
- 1 client → N steps, N targets — both reusable across that client's pipelines.
- 1 step → exactly 1 target.
- Step's request body is built entirely from `field_mapping` rows (no inline JSON body).
- Fan-out (PAT-06) = pipeline attaches steps referencing more than one target.

### FR-CFM (Configuration Model) — P1 rows only

| ID | Requirement |
|----|-------------|
| FR-CFM-001 | A pipeline defines exactly one source system, object type, event type, client ID |
| FR-CFM-002 | A pipeline belongs to exactly one client; a client may own many pipelines |
| FR-CFM-003rev | Each step references exactly one target; a target may be referenced by many steps of the same client |
| FR-CFM-003b | A client may define one or more targets, reusable across steps/pipelines |
| FR-CFM-003c | A client may define one or more steps, reusable across pipelines via `pipeline_step`, each attachment with its own `seq` |
| FR-CFM-004 | Each step has a unique `stepName` within its client; a pipeline attaches a given step at most once |
| FR-CFM-005 | `{{steps.X.Y}}` expressions may only reference a `stepName` attached earlier (by `seq`) in the same pipeline |
| FR-CFM-006 | `auth.credentialRef` is a secrets-manager reference, never a literal credential |
| FR-CFM-007 | A pipeline's attached steps support any combination of GET/POST/PUT/PATCH/DELETE, each independently targeted |
| FR-CFM-009 | `onNotFound` and `onMultipleResults` configurable per step independently |

---

## 7. Database Schema

Unchanged from parent doc — schema is foundational infrastructure, not feature-gated by
pattern priority. Six tables: `client`, `target`, `step`, `pipeline`, `pipeline_step`, `field_mapping`.

Full DDL: see `pipeline-routing-config-db-requirements.md` §4.2–§4.6 (used as-is for MVP).

### FR-DBS (Database Schema) — P1 rows only

| ID | Requirement |
|----|-------------|
| FR-DBS-001rev2 | Schema consists of six tables: `client`, `target`, `step`, `pipeline`, `pipeline_step`, `field_mapping` |
| FR-DBS-002 | `pipeline` routing index on `(client_id, source_system, object_type, event_type)` unique for active pipelines |
| FR-DBS-003rev2 | Steps stored one row per step in `step`, FK to `target_id`; attachment/order stored in `pipeline_step` |
| FR-DBS-004rev | `field_mapping` is flat, FK'd to `step_pk`, loadable from CSV without transformation |
| FR-DBS-005 | Deactivating a pipeline (`status='inactive'`) does not delete rows; history preserved |
| FR-DBS-007rev | A `target`/`step` belongs to exactly one client; `pipeline_step` valid only if pipeline and step share a client |
| FR-DBS-008 | A step may attach to multiple pipelines; a pipeline may attach multiple steps; `seq` is per-pipeline |
| FR-DBS-009 | `step` has no `body` column; request body assembled entirely from `field_mapping` rows at runtime |

### FR-CLM (Config Load and Management) — P1 rows only

| ID | Requirement |
|----|-------------|
| FR-CLM-001rev | Pipeline JSON loadable via CLI/API; upserts `client`, `target`, `step`, `pipeline`, `pipeline_step` in one transaction |
| FR-CLM-002rev | Field mapping CSV loadable via CLI/API; replaces all existing mappings for given `client_id` + `step_name` |
| FR-CLM-003 | Pipeline/mapping configs validatable without applying changes (`--dry-run`) |
| FR-CLM-004 | Validation rejects `pattern = PAT-04 or PAT-09` with `PatternNotSupported` |
| FR-CLM-005 | Validation rejects template expressions referencing a `stepId` not earlier in the same sequence |
| FR-CLM-006 | Validation rejects `credentialRef` matching a known secret pattern (e.g. `Bearer `, `password=`) |

---

## 8. Non-Functional Requirements (MVP)

The parent doc's NFR table has no explicit priority column; the following are load-bearing
for the P1 functional scope above and carried into MVP as-is:

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-004 | Idempotency | Retried requests shall not create duplicate ERP records |
| NFR-005 | Security | All credentials stored in a managed secrets service; never in plain-text config |
| NFR-006 | Security | All inbound/outbound HTTP traffic encrypted (TLS 1.2 minimum) |
| NFR-007 | Security | Sensitive field values masked in all log outputs (ties to FR-LOG-007) |
| NFR-010 | Maintainability | New ERP onboardable by pipeline config alone; no code changes/redeploy (ties to FR-CFG-004) |

Remaining NFRs (throughput targets, 99.9% uptime, 100 concurrent executions, 90-day audit
retention, containerized deployment) are not blocking for an MVP demo/pilot and should be
confirmed with Product/Engineering before Release 1 hardening.

---

## 9. Explicitly Deferred (Not in MVP)

Called out so nothing gets assumed-in-scope by omission.

| Deferred Item | Priority | Why deferred |
|----------------|----------|--------------|
| PAT-02 Sequential POST Chain | P5 | Not blocking; single-target multi-step ordering not needed for first ERP calls |
| PAT-05 Split Transform + Multiple POST | P5 | Split-payload logic adds complexity beyond MVP demo scope |
| PAT-07 Fan-out Sequential POST | P5 | Combines fan-out + chaining; higher complexity |
| PAT-08 Fan-out with Lookup | P2 | Valuable but not core-blocking |
| PAT-10 Fan-out Split Multiple POST | P3 | Most complex supported pattern |
| Calculated fields (FR-TRN-007) | P2 | Nice-to-have transform |
| Static lookup tables (FR-TRN-009) | P2 | Nice-to-have transform |
| Multi-payload generation (FR-TRN-010) | P2 | Needed only for split patterns (deferred) |
| HTTP PUT/PATCH (FR-ORC-003/004) | P2 | POST/GET cover MVP patterns |
| HTTP DELETE / rollback (FR-ORC-005, FR-ERR-007, FR-CFM-008) | P2/P3 | Compensating calls not needed until multi-step chains ship |
| Dependency injection into headers (FR-DEP-005) | P2 | Edge case |
| Arbitrary-depth dependency chains (FR-DEP-007) | P2 | MVP patterns only need 1-level lookup |
| SAP / D365 / Salesforce-as-target routing (FR-RTE-002/003/004) | P5 | Oracle Fusion only for MVP |
| Structured JSON logs for aggregation tools (FR-LOG-006) | P2 | Logging still happens; just not pre-formatted for CloudWatch/Splunk/Datadog |
| Correlation ID via configurable header (FR-LOG-008) | P2 | Fixed header acceptable for MVP |
| Hot-reload config changes (FR-CFG-005) | P2 | Redeploy-on-change acceptable for MVP |
| `target.is_active` / `step.is_active` granular disable (FR-DBS-006rev) | P2 | Deactivate whole pipeline instead |
| Version-control + CI validation gate (FR-CLM-007) | P2 | Manual review acceptable for MVP |
| Config export command (FR-CLM-008rev) | P2 | Not needed until multiple BAs are editing configs |

---

## Traceability Note

This document does not restate example payloads, flow diagrams, or acceptance criteria —
those live in the parent documents and are referenced by section number above. If a P1 item's
detail is needed, go to:
- Patterns/FRs → `integration-engine-requirements-v2.md`
- Routing/config model/DB schema → `pipeline-routing-config-db-requirements.md`
