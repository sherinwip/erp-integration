# Integration Engine Requirements — v2.0

## Document Information

| Property | Value |
|----------|-------|
| Document Title | Integration Engine Functional Requirements |
| Version | 2.0 |
| Status | Draft for Review |
| Previous Version | 1.0 |
| Last Updated | 2026-07-04 |

### Revision History

| Version | Date | Summary of Changes |
|---------|------|--------------------|
| 1.0 | — | Initial draft |
| 2.0 | 2026-07-04 | Groomed: unified pattern IDs (PAT-01–10), priority definitions, glossary, numbered functional requirements, full JSON examples for every supported pattern, non-functional requirements, open items added |

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Definitions and Glossary](#2-definitions-and-glossary)
3. [Priority Definitions](#3-priority-definitions)
4. [Integration Pattern Catalog](#4-integration-pattern-catalog)
5. [Integration Pattern Details](#5-integration-pattern-details)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [High-Level Architecture](#8-high-level-architecture)
9. [Design Principles](#9-design-principles)
10. [Open Items](#10-open-items)

---

## 1. Purpose and Scope

### 1.1 Purpose

The Integration Engine (Dispatch API) is a generic, configuration-driven middleware layer that:

- Accepts event payloads from Salesforce
- Transforms them into one or more target-system payloads using configurable mapping rules
- Orchestrates the required API calls against one or multiple target systems via JSON/REST
- Handles dependency resolution, error handling, retry, rollback, and structured logging

Because the engine operates purely over JSON and REST, **any system that exposes a REST API and accepts JSON can serve as a target** — including another Salesforce org, an ERP, or any third-party platform. No application code changes are required to onboard new source objects or target systems unless entirely new transformation logic is introduced.

### 1.2 In Scope

> **Primary validated target for this release: Salesforce → Oracle Fusion.**
> All other target systems are supported generically by the engine's design but are not the focus of
> this release's integration testing and acceptance criteria.

| Item | Scope Level | Notes |
|------|-------------|-------|
| Salesforce as source | **Primary** | Platform Events, REST callbacks, webhook payloads |
| Oracle Fusion as target | **Primary** | REST APIs (OCI-hosted); integration tested in this release |
| SAP as target | Generic support | OData v4 REST APIs; supported via config; not integration-tested this release |
| Microsoft Dynamics 365 as target | Generic support | REST APIs; supported via config; not integration-tested this release |
| Salesforce as target | Generic support | A Salesforce org can be a target like any REST system; supported via config |
| Any REST/JSON system as target | Generic support | Any system accepting JSON over REST is configurable as a target |
| JSON payload transformation | **Primary** | Field mapping, nesting, conditionals, defaults, lookups |
| API orchestration | **Primary** | Sequential and parallel GET / POST / PUT / PATCH / DELETE chains |
| Multi-target routing | **Primary** | Fan-out to multiple targets from a single inbound request |
| Dependency resolution | **Primary** | Extract values from prior API responses and inject into later steps |
| Configuration-driven onboarding | **Primary** | Via pipeline configuration files or records |
| Observability | **Primary** | Structured logging, correlation tracking, full audit trail |

### 1.3 Out of Scope

| Item | Rationale |
|------|-----------|
| SOAP / XML-based target APIs | Future extension; not in current design |
| Real-time event streaming | Batch and triggered event integrations only |
| Bi-directional sync (target system → Salesforce) | Write-back / reverse sync is a separate integration concern |
| Admin UI for pipeline configuration | Configuration is file or database driven |
| Data migration or historical loads | Operational event-based integrations only |
| Integration testing of non-Oracle targets (SAP, D365, Salesforce-as-target) in this release | Architecturally supported but validated in a future release |

---

## 2. Definitions and Glossary

| Term | Definition |
|------|-----------|
| **Dispatch API** | The integration engine entry point; receives Salesforce payloads and orchestrates all downstream activity |
| **Pipeline** | A complete integration configuration defining source, transformation, orchestration, and routing rules for one business event type |
| **Pattern** | A classification of integration behavior based on input cardinality, output payload count, API call count, and ERP target count |
| **Transformation** | The process of mapping source fields to target-system fields, including type binding, conditionals, defaults, and computed values |
| **Orchestration Step** | A single configurable API call (GET, POST, PUT, etc.) within a pipeline execution sequence |
| **Dependency** | A value extracted from one step's response that is injected into a subsequent step's URL, headers, query parameters, or body |
| **Fan-out** | Routing the same or adapted payload to multiple target systems, each executing their own independent step sequence |
| **Target System** | Any system that exposes a REST API accepting JSON; includes Oracle Fusion, SAP, Microsoft D365, another Salesforce org, or any other REST-capable platform |
| **Correlation ID** | A unique identifier attached to every log entry for a single inbound Salesforce event, enabling end-to-end tracing across all steps |
| **Transaction ID** | A unique identifier for each individual API call to a target system within a pipeline execution |
| **Retry Policy** | Configuration specifying the maximum number of attempts, backoff strategy, and eligible HTTP status codes for automatic retry |
| **Rollback** | Executing configurable compensating API calls (e.g., DELETE) to reverse previously completed steps after a downstream failure |
| **Mapping Config** | The field-mapping rules block within a pipeline configuration defining source-to-target field translations |

---

## 3. Priority Definitions

| Priority | Meaning | Target Release |
|----------|---------|----------------|
| **P1** | Must-have; core engine functionality. Blocking for MVP | Release 1 (MVP) |
| **P2** | High value; required for the majority of real-world integration scenarios | Release 1 or early Release 2 |
| **P3** | Medium value; needed for complex multi-target scenarios | Release 2 |
| **P4** | Low value; advanced or edge-case functionality | Post-Release 2 |
| **P5** | Deferred; not required for known use cases; kept for completeness | TBD — future roadmap |
| **N/A** | Not supported in current design | Rejected at validation time |

---

## 4. Integration Pattern Catalog

The engine classifies all integration scenarios into 10 patterns based on three dimensions:

- **Output payload count** — Single or Multiple target-system payloads generated from one input
- **API call count** — Single POST, Sequential POSTs, or GET + POST chain
- **ERP target count** — Single target or Multiple targets (fan-out)

### 4.1 Pattern Summary Table

| ID         | Pattern Name                    | Output Payloads | ERP Calls per Target | ERP Targets | Priority | Supported | Example                                                       |
| ---------- | ------------------------------- | --------------- | -------------------- | ----------- | -------- | --------- | ------------------------------------------------------------- |
| **PAT-01** | Simple Transform and POST       | Single          | 1× POST              | Single      | P1       | ✅ Yes     | Salesforce Contract → Oracle Contract (1 POST)                |
| **PAT-02** | Sequential POST Chain           | Single          | N× POST (ordered)    | Single      | P5       | ✅ Yes     | Create Contract Header → Create Project                       |
| **PAT-03** | Lookup then POST                | Single          | 1+ GET → POST        | Single      | P1       | ✅ Yes     | Lookup Project ID → Create Contract                           |
| **PAT-04** | Split Transform + Single POST   | Multiple        | 1× POST each         | Single      | N/A      | ❌ No      | Split Award into Contract & Funding (single POST each)        |
| **PAT-05** | Split Transform + Multiple POST | Multiple        | N× POST (ordered)    | Single      | P5       | ✅ Yes     | Contract flow + Funding flow executed separately              |
| **PAT-06** | Fan-out Simple POST             | Single          | 1× POST              | Multiple    | P1       | ✅ Yes     | Same Contract sent to Oracle and SAP                          |
| **PAT-07** | Fan-out Sequential POST         | Single          | N× POST (ordered)    | Multiple    | P5       | ✅ Yes     | Header → Project executed in Oracle and SAP                   |
| **PAT-08** | Fan-out with Lookup             | Single          | 1+ GET → POST        | Multiple    | P2       | ✅ Yes     | Lookup Project in Oracle & SAP before Contract creation       |
| **PAT-09** | Fan-out Split Single POST       | Multiple        | 1× POST each         | Multiple    | N/A      | ❌ No      | Split Contract & Funding to Oracle and SAP                    |
| **PAT-10** | Fan-out Split Multiple POST     | Multiple        | N× POST (ordered)    | Multiple    | N/A      | ❌ No      | Contract and Funding workflows executed across Oracle and SAP |


> **PAT-04 and PAT-09** are not currently supported. Pipeline configurations referencing these patterns
> are rejected at load time with error `PatternNotSupported: PAT-04` / `PatternNotSupported: PAT-09`.

### 4.2 Pattern Coverage Matrix

| ID | Example Section | Functional Req Scope | Test Case Prefix |
|----|-----------------|----------------------|------------------|
| PAT-01 | §5.1 | FR-TRN, FR-ORC-001/002 | TC-01-xxx |
| PAT-02 | §5.2 | FR-TRN, FR-ORC-006/007 | TC-02-xxx |
| PAT-03 | §5.3 | FR-TRN, FR-DEP-001–006 | TC-03-xxx |
| PAT-04 | §5.4 | N/A | N/A |
| PAT-05 | §5.5 | FR-TRN-010, FR-DEP | TC-05-xxx |
| PAT-06 | §5.6 | FR-ORC-008, FR-RTE | TC-06-xxx |
| PAT-07 | §5.7 | FR-ORC-008, FR-ORC-007 | TC-07-xxx |
| PAT-08 | §5.8 | FR-DEP, FR-ORC-008 | TC-08-xxx |
| PAT-09 | §5.9 | N/A | N/A |
| PAT-10 | §5.10 | FR-TRN-010, FR-ORC-008 | TC-10-xxx |

---

## 5. Integration Pattern Details

Each pattern section uses this standard template:

- **Description** — Plain-language explanation of what the pattern does
- **When to Use** — Business trigger examples
- **Flow Diagram** — Visual sequence of steps
- **Concrete Example** — Full inbound payload, mapping rules, outbound API calls with request and response bodies
- **Failure Scenarios** — What happens when steps fail
- **Acceptance Criteria** — Measurable conditions for sign-off

> **Common Example Context:** Throughout this section, a Salesforce `ContractAward` event is used as the
> inbound source. Oracle Fusion and SAP are used as the ERP targets. All field names, endpoints, and IDs
> are illustrative and representative of real Oracle Fusion and SAP OData REST APIs.

---

### 5.1 PAT-01 — Simple Transform and POST (P1)

#### Description
One inbound Salesforce payload is mapped to one ERP payload using configured field mapping rules. One POST request is executed. No prior lookup calls are needed because all required ERP fields are derivable from the Salesforce payload.

#### When to Use
- Salesforce Contract Award → Oracle Fusion Contract record (no linked project dependency)
- Salesforce Account → SAP Customer master record
- Any event where all required ERP fields are present in the inbound payload

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Dispatch API
      │
      ▼
Pipeline Config Loader  ── Identify pipeline by sourceObject = "ContractAward"
      │
      ▼
Mapping Engine  ── Apply field mapping rules
      │
      ▼
Transformed ERP Payload
      │
      ▼
POST /erp-endpoint
      │
      ├── HTTP 201 → Record ContractId → Status: Completed
      └── HTTP 4xx  → Log validation error → Status: Failed
      └── HTTP 5xx  → Retry (per policy) → Status: Failed-RetryExhausted
```

#### Concrete Example

**Business Scenario:** A Salesforce Contract Award is created. Oracle Fusion requires a new contract record. All fields needed for Oracle are present in the Salesforce payload.

**Step 1 — Inbound Salesforce Payload**
```json
{
  "eventType": "ContractAward",
  "awardId": "SF-AWD-2024-001",
  "contractName": "Government Infrastructure Project",
  "amount": 500000,
  "currency": "USD",
  "startDate": "2024-01-15",
  "endDate": "2026-12-31",
  "accountName": "State Department of Transport"
}
```

**Step 2 — Mapping Rules (from Pipeline Config)**
```json
{
  "mappings": [
    { "source": "contractName", "target": "ContractName" },
    { "source": "amount",       "target": "ContractAmount" },
    { "source": "currency",     "target": "CurrencyCode" },
    { "source": "startDate",    "target": "StartDate" },
    { "source": "endDate",      "target": "EndDate" },
    { "source": "accountName",  "target": "PartyName" }
  ]
}
```

**Step 3 — Outbound Oracle Fusion POST**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
Authorization: Bearer {oracle_token}
Content-Type: application/json
X-Correlation-ID: corr-0a1b2c3d

{
  "ContractName": "Government Infrastructure Project",
  "ContractAmount": 500000,
  "CurrencyCode": "USD",
  "StartDate": "2024-01-15",
  "EndDate": "2026-12-31",
  "PartyName": "State Department of Transport"
}
```

**Success Response**
```
HTTP 201 Created

{
  "ContractId": 300001234567,
  "ContractNumber": "ORA-2024-0001",
  "Status": "DRAFT"
}
```

**Failure Response Example**
```
HTTP 422 Unprocessable Entity

{
  "type": "https://www.oracle.com/error",
  "title": "Validation Failed",
  "detail": "CurrencyCode 'USD' is not enabled for this business unit."
}
```
→ Status set to `Failed`; no retry (4xx is not in the retry-eligible list); error detail logged.

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | Valid payload received; mapping succeeds | POST is executed with correctly mapped fields |
| AC-02 | Oracle returns HTTP 201 | ContractId logged; transaction status = `Completed` |
| AC-03 | Oracle returns HTTP 5xx | Retry per policy; status = `Failed-RetryExhausted` if max attempts reached |
| AC-04 | Oracle returns HTTP 4xx | No retry; status = `Failed`; error detail logged |
| AC-05 | Required mapping field is absent from source | Status = `Failed-ValidationError`; POST not executed |

---

### 5.2 PAT-02 — Sequential POST Chain (P5)

#### Description
One inbound Salesforce payload is transformed into one ERP payload. Multiple sequential POST requests must be executed against the same ERP in order. A later call may depend on a value returned by an earlier call.

#### When to Use
- Oracle Fusion requires a Contract Header to exist before Contract Lines can be submitted
- SAP requires a master record created before dependent sub-records

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Mapping Engine
      │
      ▼
POST /contracts  ─────────────────► Extract ContractId from response
      │
      ▼
POST /contracts/{ContractId}/lines  (ContractId injected from step 1)
      │
      ├── Both succeed     → Status: Completed
      ├── Step 1 fails     → Chain halted; Status: Failed
      └── Step 2 fails     → Retry step 2; if exhausted → Rollback step 1 (DELETE /contracts/{ContractId})
```

#### Concrete Example

**Business Scenario:** Oracle Fusion requires the contract header and contract lines submitted via separate API calls. The line endpoint requires the ContractId assigned by Oracle after the header is created.

**Step 1 — POST Contract Header**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
Authorization: Bearer {oracle_token}
X-Correlation-ID: corr-0a1b2c3d

{
  "ContractName": "Government Infrastructure Project",
  "CurrencyCode": "USD",
  "StartDate": "2024-01-15",
  "EndDate": "2026-12-31"
}
```
**Response**
```
HTTP 201 Created
{ "ContractId": 300001234567, "ContractNumber": "ORA-2024-0001" }
```

**Dependency Extraction Config**
```json
{ "extractFrom": "ContractId", "bindTo": "step1.ContractId" }
```

**Step 2 — POST Contract Line (ContractId injected)**
```
POST /fscmRestApi/resources/11.13.18.05/contracts/300001234567/lines
Authorization: Bearer {oracle_token}
X-Correlation-ID: corr-0a1b2c3d

{
  "LineNumber": 1,
  "LineDescription": "Phase 1 — Design and Planning",
  "Amount": 150000
}
```
**Response**
```
HTTP 201 Created
{ "LineId": 400009876543, "ContractId": 300001234567, "LineNumber": 1 }
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | Step 1 succeeds | ContractId extracted; step 2 is executed with ContractId injected into URL |
| AC-02 | Step 1 fails | Chain is halted; step 2 not called; status = `Failed` |
| AC-03 | Step 2 fails after step 1 succeeded | Retry step 2 per policy; if exhausted, execute DELETE /contracts/{ContractId} rollback; status = `Failed-RetryExhausted` |
| AC-04 | Both steps succeed | Status = `Completed`; ContractId and LineId logged |

---

### 5.3 PAT-03 — Lookup then POST (P1)

#### Description
One inbound Salesforce payload is transformed into one ERP payload. Before the POST is executed, the engine performs one or more GET requests to retrieve values required by the ERP but not present in the Salesforce payload (e.g., a system-generated numeric ID that Salesforce only knows by its external business key).

#### When to Use
- Oracle Fusion project must be resolved from a project number (string) to an internal ProjectId (numeric) before creating a linked contract
- SAP cost centre code must be resolved from a business unit name before creating a purchase order

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Mapping Engine
      │
      ▼
GET /erp-lookup?filter={{source.projectNumber}}
      │
      ├── 0 results   → Status: Failed-DependencyNotFound  (POST not called)
      ├── 1 result    → Extract ProjectId
      └── N results   → Use first result (configurable) or fail (configurable)
               │
               ▼
         Inject ProjectId into POST payload
               │
               ▼
         POST /contracts
               │
               ├── HTTP 201 → Status: Completed
               └── HTTP 5xx → Retry / Status: Failed-RetryExhausted
```

#### Concrete Example

**Business Scenario:** A Salesforce Award references project number `P-2024-100`. Oracle Fusion stores a numeric `ProjectId` (3000012456) internally. The contract POST requires this numeric ID, not the project number.

**Inbound Salesforce Payload**
```json
{
  "awardId": "SF-AWD-2024-001",
  "contractName": "Government Infrastructure Project",
  "projectNumber": "P-2024-100",
  "amount": 500000,
  "currency": "USD"
}
```

**Step 1 — GET Oracle Project by External Number**
```
GET /fscmRestApi/resources/11.13.18.05/projects?q=ProjectNumber='P-2024-100'
Authorization: Bearer {oracle_token}
X-Correlation-ID: corr-0a1b2c3d
```
**Success Response**
```json
{
  "items": [
    {
      "ProjectId": 3000012456,
      "ProjectNumber": "P-2024-100",
      "ProjectName": "Infrastructure Phase 1",
      "ProjectStatus": "APPROVED"
    }
  ],
  "count": 1
}
```

**Dependency Extraction Config**
```json
{
  "extractFrom": "items[0].ProjectId",
  "bindTo": "lookup.ProjectId"
}
```

**Step 2 — POST Oracle Contract (ProjectId injected)**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
Authorization: Bearer {oracle_token}
Content-Type: application/json
X-Correlation-ID: corr-0a1b2c3d

{
  "ProjectId": 3000012456,
  "ContractName": "Government Infrastructure Project",
  "ContractAmount": 500000,
  "CurrencyCode": "USD"
}
```
**Response**
```
HTTP 201 Created
{ "ContractId": 300001234567, "ContractNumber": "ORA-2024-0001" }
```

**Failure Path — Project Not Found**
```json
{ "items": [], "count": 0 }
```
→ Engine halts. Log entry: `DependencyNotFound: ProjectNumber 'P-2024-100' returned 0 results from Oracle Fusion /projects`. Status = `Failed-DependencyNotFound`. No POST is executed.

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | GET returns exactly 1 result | Dependency extracted; POST executed with injected value |
| AC-02 | GET returns 0 results | POST not called; status = `Failed-DependencyNotFound`; reason logged |
| AC-03 | GET returns > 1 result | Engine uses first result OR fails; behavior defined by `onMultipleResults` config (`useFirst` or `fail`) |
| AC-04 | GET itself returns HTTP 5xx | Retry GET per policy; if exhausted, status = `Failed-RetryExhausted`; POST not called |
| AC-05 | POST succeeds | Status = `Completed`; ContractId logged |
| AC-06 | POST fails | Retry per policy; if exhausted, status = `Failed-RetryExhausted` |

---

### 5.4 PAT-04 — Not Supported

**Pattern:** Single input → Multiple ERP payloads → 1× POST per payload → Single ERP

This pattern is reserved for a future release. Any pipeline configuration referencing `"pattern": "PAT-04"` is rejected at load time:

```
ConfigValidationError: pattern 'PAT-04' is not supported in this version.
Supported patterns: PAT-01, PAT-02, PAT-03, PAT-05, PAT-06, PAT-07, PAT-08, PAT-10
```

---

### 5.5 PAT-05 — Split Transform + Multiple POST (P2)

#### Description
One inbound Salesforce payload is split into multiple distinct ERP payloads. Each payload is submitted to the same ERP via its own separate POST request. Payloads may have inter-dependencies (e.g., the second payload requires an ID returned by the first).

#### When to Use
- One Salesforce Award must create a Contract record and a linked Funding Source in Oracle Fusion
- SAP requires separate postings to Contract and Budget modules from a single event

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Mapping Engine  ──  Splits into Payload A (Contract) and Payload B (Funding Source)
      │
      ├────────────────────────────────────┐
      ▼                                    │
Payload A                                  │
POST /contracts                            │
      │                                    │
      ▼                                    │
Extract ContractId ─────────────────────►  │
      │                                    │
      │  ◄─────────────────────────────────┘
      ▼
Payload B (ContractId injected)
POST /contracts/{ContractId}/fundingSources
      │
      ├── Both succeed → Status: Completed
      └── B fails      → Retry B; if exhausted → Rollback A (DELETE /contracts/{ContractId})
```

#### Concrete Example

**Business Scenario:** One Salesforce Award must create a Contract and a linked Funding Source in Oracle Fusion. The Funding Source API requires the ContractId assigned by the Contract POST.

**Inbound Salesforce Payload**
```json
{
  "awardId": "SF-AWD-2024-001",
  "contractName": "Government Infrastructure Project",
  "fundingSource": "Federal Grant FY2024",
  "fundingAmount": 500000,
  "currency": "USD"
}
```

**POST A — Contract**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
Authorization: Bearer {oracle_token}

{
  "ContractName": "Government Infrastructure Project",
  "CurrencyCode": "USD"
}
```
**Response**
```
HTTP 201 Created
{ "ContractId": 300001234567 }
```

**POST B — Funding Source (ContractId injected into URL)**
```
POST /fscmRestApi/resources/11.13.18.05/contracts/300001234567/fundingSources
Authorization: Bearer {oracle_token}

{
  "FundingSourceName": "Federal Grant FY2024",
  "FundedAmount": 500000,
  "CurrencyCode": "USD"
}
```
**Response**
```
HTTP 201 Created
{ "FundingSourceId": 500009876543, "ContractId": 300001234567 }
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | POST A succeeds | ContractId stored; POST B executed with ContractId injected |
| AC-02 | POST A fails | POST B not called; status = `Failed` |
| AC-03 | POST B fails after A succeeded | Retry B; if exhausted, execute DELETE /contracts/{ContractId}; status = `Failed-RetryExhausted` |
| AC-04 | Both POSTs succeed | Status = `Completed`; ContractId and FundingSourceId logged |

---

### 5.6 PAT-06 — Fan-out Simple POST (P1)

#### Description
One inbound Salesforce payload is transformed into one ERP payload per target (each target may use different field names). The same business data is posted independently to multiple ERP systems. ERP calls execute in parallel where possible.

#### When to Use
- A contract award must be registered in both Oracle Fusion and SAP simultaneously
- A new customer account must be created in Oracle, SAP, and Microsoft D365

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Dispatch API
      │
      ▼
Mapping Engine  ──  Produces ERP-specific payload per target
      │
      ├──────────────────────────────────────────┐
      ▼                                          ▼
Oracle Fusion Payload                     SAP Payload
POST /contracts                           POST /ContractSet
Authorization: Bearer {oracle_token}      Authorization: Bearer {sap_token}
      │                                          │
      ▼                                          ▼
HTTP 201  ✓                               HTTP 201  ✓
      │                                          │
      └──────────────────┬───────────────────────┘
                         ▼
              All targets succeed → Status: Completed
              Some targets fail   → Status: PartialFailure (per-ERP status logged)
              All targets fail    → Status: Failed
```

#### Concrete Example

**Business Scenario:** A Salesforce Contract Award must be synced to both Oracle Fusion and SAP. Each system requires different field names and different authentication.

**Inbound Salesforce Payload**
```json
{
  "awardId": "SF-AWD-2024-001",
  "contractName": "Government Infrastructure Project",
  "amount": 500000,
  "currency": "USD",
  "startDate": "2024-01-15"
}
```

**Oracle Fusion POST**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
Authorization: Bearer {oracle_token}
X-Correlation-ID: corr-0a1b2c3d

{
  "ContractName": "Government Infrastructure Project",
  "ContractAmount": 500000,
  "CurrencyCode": "USD",
  "StartDate": "2024-01-15"
}
```
**Response:** `HTTP 201 { "ContractId": 300001234567 }`

**SAP POST**
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractSet
Authorization: Bearer {sap_token}
X-Correlation-ID: corr-0a1b2c3d
Content-Type: application/json

{
  "ContractDesc": "Government Infrastructure Project",
  "TotalValue": "500000.00",
  "Waers": "USD",
  "BegDA": "20240115"
}
```
**Response:** `HTTP 201 { "ContractNo": "4600000123" }`

> Each ERP uses its own authentication credentials, base URL, and field naming convention — all
> defined independently within the pipeline configuration.

**Partial Failure Example:** Oracle returns HTTP 201; SAP returns HTTP 503 and all retries fail.

```json
{
  "correlationId": "corr-0a1b2c3d",
  "overallStatus": "PartialFailure",
  "targets": [
    { "erp": "OracleFusion", "status": "Completed", "contractId": 300001234567 },
    { "erp": "SAP",          "status": "Failed-RetryExhausted", "error": "HTTP 503 after 3 attempts" }
  ]
}
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | All ERP targets return HTTP 201 | Status = `Completed`; all response IDs logged |
| AC-02 | Oracle succeeds, SAP fails after retry | Overall status = `PartialFailure`; per-ERP status recorded |
| AC-03 | All ERPs fail | Status = `Failed` |
| AC-04 | Pipeline has no ERP targets configured | Status = `Failed-ConfigError`; no API calls made |

---

### 5.7 PAT-07 — Fan-out Sequential POST (P5)

#### Description
One Salesforce payload is transformed. Each ERP target receives multiple sequential POST requests forming an independent API chain. Each ERP manages its own ordering and dependency resolution. All ERP chains execute in parallel with each other.

#### When to Use
- Oracle and SAP both require a parent record created before linked child records from a single event
- Both ERPs enforce a strict API submission order

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Dispatch API
      │
      ├──────────────────────────────────────────────────┐
      ▼                                                  ▼
Oracle Fusion                                           SAP

POST /contracts ─────► ContractId             POST /ContractSet ─────► ContractNo
      │                                                  │
POST /contracts/{ContractId}/lines             POST /ContractItemSet (ContractNo)
      │                                                  │
All Oracle steps complete                      All SAP steps complete
```

#### Concrete Example

**Oracle Sequence**

Step 1:
```
POST /fscmRestApi/resources/11.13.18.05/contracts
{ "ContractName": "Government Infrastructure Project", "CurrencyCode": "USD" }
→ HTTP 201  { "ContractId": 300001234567 }
```
Step 2 (ContractId injected from step 1):
```
POST /fscmRestApi/resources/11.13.18.05/contracts/300001234567/lines
{ "LineNumber": 1, "LineDescription": "Phase 1 — Design", "Amount": 150000 }
→ HTTP 201  { "LineId": 400009876543 }
```

**SAP Sequence (runs in parallel with Oracle)**

Step 1:
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractSet
{ "ContractDesc": "Government Infrastructure Project", "Waers": "USD" }
→ HTTP 201  { "ContractNo": "4600000123" }
```
Step 2 (ContractNo injected from step 1):
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractItemSet
{ "ContractNo": "4600000123", "ItemDesc": "Phase 1 — Design", "NetValue": "150000.00" }
→ HTTP 201  { "ItemNo": "10", "ContractNo": "4600000123" }
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | All steps on all ERPs succeed | Status = `Completed` |
| AC-02 | Oracle step 1 fails | Oracle chain halted; SAP proceeds; overall status = `PartialFailure` |
| AC-03 | SAP step 2 fails, step 1 succeeded | Retry SAP step 2; if exhausted, rollback SAP step 1 (if configured); SAP = `Failed-RetryExhausted` |
| AC-04 | Both ERP chains complete independently | Final status reflects aggregate of all per-ERP statuses |

---

### 5.8 PAT-08 — Fan-out with Lookup (P2)

#### Description
One Salesforce payload is transformed. Each ERP target independently performs one or more GET lookups to resolve system-specific dependency values, then executes its own POST chain. Each ERP's lookup and POST sequence is independent; failure in one ERP's lookup does not stop the other ERPs.

#### When to Use
- Oracle and SAP both store their own internal project IDs which must be resolved independently before creating a contract
- The same external business key (e.g., project number) resolves to different internal IDs per ERP

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Dispatch API
      │
      ├────────────────────────────────────────────────────────┐
      ▼                                                        ▼
Oracle Fusion                                                 SAP

GET /projects?q=ProjectNumber='P-2024-100'     GET /ProjectSet?$filter=Pspid eq 'P-2024-100'
      │                                                        │
Extract ProjectId (integer: 3000012456)         Extract WbsElement (string: "A.0001.0001")
      │                                                        │
POST /contracts { ProjectId: 3000012456 }       POST /ContractSet { WbsElement: "A.0001.0001" }
      │                                                        │
Complete                                                  Complete
```

#### Concrete Example

**Inbound Salesforce Payload**
```json
{
  "awardId": "SF-AWD-2024-001",
  "contractName": "Government Infrastructure Project",
  "projectNumber": "P-2024-100",
  "amount": 500000,
  "currency": "USD"
}
```

**Oracle Fusion — GET Lookup**
```
GET /fscmRestApi/resources/11.13.18.05/projects?q=ProjectNumber='P-2024-100'
→ { "items": [{ "ProjectId": 3000012456, "ProjectNumber": "P-2024-100" }], "count": 1 }
```
**Oracle Fusion — POST Contract**
```
POST /fscmRestApi/resources/11.13.18.05/contracts
{ "ProjectId": 3000012456, "ContractName": "Government Infrastructure Project",
  "ContractAmount": 500000, "CurrencyCode": "USD" }
→ HTTP 201 { "ContractId": 300001234567 }
```

**SAP — GET Lookup**
```
GET /sap/opu/odata/sap/ZPS_PROJECT_SRV/ProjectSet?$filter=Pspid eq 'P-2024-100'
→ { "d": { "results": [{ "Pspid": "P-2024-100", "WbsElement": "A.0001.0001" }] } }
```
**SAP — POST Contract**
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractSet
{ "WbsElement": "A.0001.0001", "ContractDesc": "Government Infrastructure Project",
  "TotalValue": "500000.00", "Waers": "USD" }
→ HTTP 201 { "ContractNo": "4600000123" }
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | Both GETs return results; both POSTs succeed | Status = `Completed`; all IDs logged |
| AC-02 | Oracle GET returns 0 results | Oracle POST not called; Oracle = `Failed-DependencyNotFound`; SAP chain proceeds independently |
| AC-03 | SAP POST fails after successful GET | Retry SAP POST; if exhausted, SAP = `Failed-RetryExhausted`; Oracle unaffected |
| AC-04 | Both GETs fail | Status = `Failed` |
| AC-05 | Oracle success + SAP dependency not found | Status = `PartialFailure` with per-ERP breakdown |

---

### 5.9 PAT-09 — Not Supported

**Pattern:** Single input → Multiple ERP payloads → 1× POST per payload → Multiple ERPs

Reserved for a future release. Configurations referencing `"pattern": "PAT-09"` are rejected at load time with `PatternNotSupported: PAT-09`.

---

### 5.10 PAT-10 — Fan-out Split Multiple POST (P3)

#### Description
One Salesforce payload is split into multiple distinct ERP payloads. Each ERP target receives multiple sequential POST requests (one per split payload). This is the most complex supported pattern: it combines fan-out routing, split transformation, and multi-step dependency-chained orchestration.

#### When to Use
- A Salesforce Award must create Contract, Funding Source, and Billing records in both Oracle Fusion and SAP
- Maximum payload and API complexity across multiple ERP targets

#### Flow Diagram

```
Salesforce Event
      │
      ▼
Dispatch API
      │
      ▼
Mapping Engine  ──  Generates multiple payloads per ERP
      │
      ├────────────────────────────────────────────────────────┐
      ▼                                                        ▼
Oracle Fusion                                                 SAP

POST /contracts ─────────────► ContractId        POST /ContractSet ───► ContractNo
POST /contracts/{id}/fundingSources (ContractId)  POST /FundingSet (ContractNo)
POST /contracts/{id}/billingDetails (ContractId)  POST /BillingSet (ContractNo)

All Oracle steps complete                         All SAP steps complete
           │                                                   │
           └────────────────────┬──────────────────────────────┘
                                ▼
                     Aggregate final status
```

#### Concrete Example

**Oracle Fusion Sequence**

Step 1 — Contract:
```
POST /fscmRestApi/resources/11.13.18.05/contracts
{ "ContractName": "Government Infrastructure Project", "CurrencyCode": "USD" }
→ HTTP 201 { "ContractId": 300001234567 }
```
Step 2 — Funding Source (ContractId from step 1):
```
POST /fscmRestApi/resources/11.13.18.05/contracts/300001234567/fundingSources
{ "FundingSourceName": "Federal Grant FY2024", "FundedAmount": 500000 }
→ HTTP 201 { "FundingSourceId": 500000001 }
```
Step 3 — Billing Details (ContractId from step 1):
```
POST /fscmRestApi/resources/11.13.18.05/contracts/300001234567/billingDetails
{ "BillingType": "MILESTONE", "InvoiceFrequency": "MONTHLY" }
→ HTTP 201 { "BillingId": 600000001 }
```

**SAP Sequence (runs in parallel)**

Step 1 — Contract:
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/ContractSet
{ "ContractDesc": "Government Infrastructure Project", "Waers": "USD" }
→ HTTP 201 { "ContractNo": "4600000123" }
```
Step 2 — Funding (ContractNo from step 1):
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/FundingSet
{ "ContractNo": "4600000123", "FundDesc": "Federal Grant FY2024", "Amount": "500000.00" }
→ HTTP 201 { "FundItem": "F001" }
```
Step 3 — Billing (ContractNo from step 1):
```
POST /sap/opu/odata/sap/ZCM_CONTRACT_SRV/BillingSet
{ "ContractNo": "4600000123", "BillingType": "M", "Frequency": "M" }
→ HTTP 201 { "BillItem": "B001" }
```

#### Acceptance Criteria

| # | Condition | Expected Outcome |
|---|-----------|-----------------|
| AC-01 | All steps on all ERPs succeed | Status = `Completed`; all IDs logged per ERP |
| AC-02 | Oracle step 2 fails | Retry step 2; if exhausted, rollback Oracle step 1; Oracle = `Failed-RetryExhausted`; SAP unaffected |
| AC-03 | SAP step 1 fails | All subsequent SAP steps skipped; SAP chain = `Failed`; Oracle proceeds |
| AC-04 | Oracle completes; SAP exhausts retries | Overall status = `PartialFailure`; per-ERP status breakdown in logs |

---

## 6. Functional Requirements

All requirements follow the naming convention `FR-{module}-{sequence}`.

Modules: `TRN` (Transformation), `ORC` (Orchestration), `DEP` (Dependency), `RTE` (Routing), `ERR` (Error Handling), `LOG` (Logging), `CFG` (Configuration).

---

### 6.1 Payload Transformation (FR-TRN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TRN-001 | The engine shall accept and parse valid JSON payloads from Salesforce | P1 |
| FR-TRN-002 | The engine shall support configurable field-to-field mapping using dot-notation path expressions (e.g., `source: "contract.name"` → `target: "ContractName"`) | P1 |
| FR-TRN-003 | The engine shall support mapping Salesforce flat fields to nested ERP objects | P1 |
| FR-TRN-004 | The engine shall support mapping array fields and their child elements | P1 |
| FR-TRN-005 | The engine shall support conditional mapping rules (e.g., map field X only if source field Y equals value Z) | P1 |
| FR-TRN-006 | The engine shall apply configurable default values when a source field is null or absent | P1 |
| FR-TRN-007 | The engine shall support calculated fields derived from source fields (e.g., `totalAmount = unitPrice * quantity`) | P2 |
| FR-TRN-008 | The engine shall support value conversion: type binding, date format transformation (format, parse, dateAdd), split n pick, substitue (replace) , trim, round of, max, and string case transformation | P1 |
| FR-TRN-009 | The engine shall support static lookup tables to translate code values (e.g., Salesforce status code `A` → Oracle code `ACTIVE`) | P2 |
| FR-TRN-010 | The engine shall support generating multiple distinct output payloads from a single input (required by PAT-05, PAT-10) | P2 |

---

### 6.2 API Orchestration (FR-ORC)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ORC-001 | The engine shall support HTTP GET | P1 |
| FR-ORC-002 | The engine shall support HTTP POST | P1 |
| FR-ORC-003 | The engine shall support HTTP PUT | P2 |
| FR-ORC-004 | The engine shall support HTTP PATCH | P2 |
| FR-ORC-005 | The engine shall support HTTP DELETE (used for rollback) | P3 |
| FR-ORC-006 | Each API step shall have independently configurable endpoint path, HTTP method, headers, query parameters, and request body | P1 |
| FR-ORC-007 | The engine shall support sequential API chains where later steps depend on earlier responses | P1 |
| FR-ORC-008 | The engine shall support parallel fan-out execution across multiple ERP targets | P1 |
| FR-ORC-009 | Per-ERP authentication credentials (OAuth 2.0, Basic Auth, API Key) shall be independently configurable | P1 |
| FR-ORC-010 | API call timeout shall be configurable per step; default value is 30 seconds | P1 |

---

### 6.3 Dependency Handling (FR-DEP)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DEP-001 | The engine shall support extracting values from previous API response bodies using configurable JSON path expressions (e.g., `items[0].ProjectId`) | P1 |
| FR-DEP-002 | Extracted values shall be injectable into subsequent request URL paths (e.g., `/contracts/{{step1.ContractId}}/lines`) | P1 |
| FR-DEP-003 | Extracted values shall be injectable into subsequent request query parameters | P1 |
| FR-DEP-004 | Extracted values shall be injectable into subsequent request bodies | P1 |
| FR-DEP-005 | Extracted values shall be injectable into subsequent request headers | P2 |
| FR-DEP-006 | If a dependency value cannot be extracted (missing field or empty result set), the engine shall halt the dependent call chain and log the failure with a descriptive reason | P1 |
| FR-DEP-007 | Dependency chains shall be configurable to arbitrary depth (step N may depend on step N-1, which may depend on step N-2) | P2 |

---

### 6.4 Target Routing (FR-RTE)

> **Primary validated target: Oracle Fusion (P1).**
> SAP, Microsoft D365, and Salesforce-as-target are generically supported through the same
> configuration mechanism but are not integration-tested in this release.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-RTE-001 | The engine shall support routing to Oracle Fusion | P1 | Primary release target; integration-tested |
| FR-RTE-002 | The engine shall support routing to SAP via configuration | P5 | Generic support; not integration-tested this release |
| FR-RTE-003 | The engine shall support routing to Microsoft Dynamics 365 via configuration | P5 | Generic support; not integration-tested this release |
| FR-RTE-004 | The engine shall support routing to another Salesforce org as a target via configuration | P5 | Treated as any REST/JSON target; no special code path required |
| FR-RTE-005 | The engine shall support routing to any system that exposes a REST API accepting JSON, via configuration and without code changes | P1 | Core design principle — target is ERP-agnostic. Integration test only with Oracle Fusion Ref:FR-RTE-001 |
| FR-RTE-006 | A pipeline configuration shall support one or more target systems | P1 | |
| FR-RTE-007 | Each target system shall have independently configurable base URL, target end points, authentication, and default request headers | P1 | |

---

### 6.5 Error Handling (FR-ERR)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ERR-001 | The engine shall capture and persist the full request payload for every API call | P1 |
| FR-ERR-002 | The engine shall capture and persist the full response payload for every API call | P1 |
| FR-ERR-003 | The engine shall capture and persist the HTTP status code for every API call | P1 |
| FR-ERR-004 | The engine shall capture and persist the execution time for every API call | P1 |
| FR-ERR-005 | The engine shall validate pipeline configuration and payload before any API calls are made; validation failures produce a `Failed-ValidationError` status | P1 |
| FR-ERR-006 | The engine shall support configurable retry with: maximum attempt count, backoff strategy (`fixed` or `exponential`), and a list of eligible HTTP status codes (e.g., 500, 502, 503, 504) | P1 |
| FR-ERR-007 | The engine shall support rollback by executing configurable compensating API calls when a step fails after prior steps have succeeded | P2 |
| FR-ERR-008 | Each transaction shall terminate in exactly one of the following statuses: `Completed`, `PartialFailure`, `Failed`, `Failed-ValidationError`, `Failed-DependencyNotFound`, `Failed-RetryExhausted`, `Failed-ConfigError` | P1 |
| FR-ERR-009 | A failed pipeline execution shall not affect other concurrent pipeline executions | P1 |

---

### 6.6 Observability and Logging (FR-LOG)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LOG-001 | Every log entry shall include a Correlation ID tied to the originating Salesforce event | P1 |
| FR-LOG-002 | Every API call log entry shall include a Transaction ID unique to that call | P1 |
| FR-LOG-003 | The engine shall log: Source Object, Destination ERP, Pipeline ID, API Step ID, Endpoint, HTTP Method | P1 |
| FR-LOG-004 | The engine shall log: Request Payload, Response Payload, Response Code, Processing Time (ms) | P1 |
| FR-LOG-005 | The engine shall log: Retry Count, Error Details, and Final Transaction Status | P1 |
| FR-LOG-006 | Log entries shall be structured JSON to support ingestion by log aggregation tools (e.g., CloudWatch, Splunk, Datadog) | P2 |
| FR-LOG-007 | Sensitive values (tokens, passwords, secrets) shall be masked in all log entries | P1 |
| FR-LOG-008 | The Correlation ID shall be propagated to all downstream ERP API calls via a configurable request header (e.g., `X-Correlation-ID`) | P2 |

---

### 6.7 Configuration-Driven Architecture (FR-CFG)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CFG-001 | All integration behaviour shall be fully defined by a pipeline configuration; no code changes are required for new integrations, Integration testing with Oracle Fusion only | P1 |
| FR-CFG-002 | Pipeline configuration shall define: source object, target ERP(s), pattern ID, field mapping rules, orchestration steps, retry policy, and rollback steps | P1 |
| FR-CFG-003 | Pipeline configurations shall be validated at load time; invalid configurations shall be rejected with descriptive error messages | P1 |
| FR-CFG-004 | A new ERP integration shall be onboardable by adding a new pipeline configuration without application redeployment | P1 |
| FR-CFG-005 | Configuration changes shall not require application redeployment (hot-reload or scheduled refresh) | P2 |

**Example Pipeline Configuration (PAT-03 — Lookup then POST)**
```json
{
  "pipelineId": "award-to-oracle-contract-v1",
  "version": "1.0",
  "pattern": "PAT-03",
  "clientId": "PAT-03",
  "source": {
    "system": "Salesforce",
    "objectType": "ContractAward"
  },
  "targets": [
    {
      "erp": "OracleFusion",
      "baseUrl": "https://oracle-instance.oraclecloud.com",
      "auth": {
        "type": "oauth2",
        "tokenEndpoint": "/oauth/token",
        "credentialRef": "oracle-prod-creds"
      },
      "steps": [
        {
          "stepId": "lookup-project",
          "method": "GET",
          "path": "/fscmRestApi/resources/11.13.18.05/projects",
          "queryParams": {
            "q": "ProjectNumber='{{source.projectNumber}}'"
          },
          "onMultipleResults": "useFirst",
          "extract": {
            "ProjectId": "items[0].ProjectId"
          },
          "onNotFound": "fail"
        },
        {
          "stepId": "create-contract",
          "method": "POST",
          "path": "/fscmRestApi/resources/11.13.18.05/contracts",
          "body": {
            "ProjectId":       "{{steps.lookup-project.ProjectId}}",
            "ContractName":    "{{source.contractName}}",
            "ContractAmount":  "{{source.amount}}",
            "CurrencyCode":    "{{source.currency}}"
          }
        }
      ]
    }
  ],
  "retryPolicy": {
    "maxAttempts": 3,
    "backoff": "exponential",
    "backoffBaseMs": 2000,
    "retryOn": [500, 502, 503, 504]
  },
  "rollback": {
    "onStepFailure": "create-contract",
    "steps": []
  }
}
```

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target / Constraint |
|----|----------|-------------|---------------------|
| NFR-001 | Performance | Engine-internal processing overhead per step (excluding ERP network time) | ≤ 500ms |
| NFR-002 | Availability | Dispatch API uptime | ≥ 99.9% per calendar month |
| NFR-003 | Scalability | Concurrent pipeline executions without performance degradation | ≥ 100 concurrent |
| NFR-004 | Idempotency | Retried requests shall not create duplicate ERP records | Idempotency key support required per ERP API |
| NFR-005 | Security | All credentials stored in a managed secrets service; never in plain-text configuration files | AWS Secrets Manager or HashiCorp Vault |
| NFR-006 | Security | All inbound and outbound HTTP traffic encrypted | TLS 1.2 minimum |
| NFR-007 | Security | Sensitive field values (tokens, passwords) masked in all log outputs | FR-LOG-007 |
| NFR-008 | Auditability | All transaction records persisted for a minimum of 90 days | Configurable retention period |
| NFR-009 | Observability | Correlation ID propagated to all downstream ERP API requests via configurable header | e.g., `X-Correlation-ID` |
| NFR-010 | Maintainability | New ERP onboardable by pipeline configuration alone; no code changes or redeployment | FR-CFG-004 |
| NFR-011 | Cloud Readiness | Engine deployable as a containerised workload on AWS ECS or Lambda; no persistent local state | Docker-based packaging |

---

## 8. High-Level Architecture

```
Salesforce
      │
      │  Webhook / Platform Event / REST callback
      ▼
┌──────────────────────────────────────────────┐
│                  Dispatch API                │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  1. Authentication Layer               │  │  Validates inbound request signature / token
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  2. Pipeline Config Loader             │  │  Loads & validates pipeline by sourceObject
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  3. Mapping Engine                     │  │  Transforms Salesforce → ERP payload(s)
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  4. Orchestration Engine               │  │  Executes configured API step sequence
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  5. Dependency Resolver                │  │  Extracts + injects values between steps
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  6. ERP Router                         │  │  Fan-out to one or multiple ERP targets
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  7. Error Handler + Retry + Rollback   │  │  Applies retry policy; triggers rollback
│  └────────────────────┬───────────────────┘  │
│                       │                      │
│  ┌────────────────────▼───────────────────┐  │
│  │  8. Structured Logger                  │  │  Writes Correlation ID, request, response
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
         │                │               │
         ▼                ▼               ▼
   Oracle Fusion         SAP       Microsoft D365
    (GET / POST)      (GET / POST)   (GET / POST)
```

---

## 9. Design Principles

| Principle | Description |
|-----------|-------------|
| **Configuration-Driven** | All integration behaviour is defined in pipeline configuration. No source code changes are required for new Salesforce objects or ERP targets. |
| **ERP-Agnostic** | The engine has no embedded knowledge of any specific ERP's data model, API conventions, or authentication scheme. All such knowledge lives in configuration. |
| **Generic** | The same engine runtime handles all 10 patterns and all ERP targets. No pattern-specific code paths. |
| **Extensible** | New patterns, ERP adapters, and transformation functions can be added without redesigning existing components. |
| **Reusable** | Pipeline configuration templates are composable and adaptable across multiple Salesforce object types. |
| **Scalable** | The engine is stateless. All execution state is held in the transaction record. Horizontal scaling requires no code changes. |
| **Secure** | Credentials are never stored in configuration files. All traffic is encrypted. Secrets are externalized to a secrets manager. Sensitive values are masked in logs. |
| **Auditable** | Every transaction produces a complete, immutable audit trail including all request and response payloads, timing, and final status. |
| **Observable** | Structured JSON logging with propagated Correlation IDs enables end-to-end tracing across all ERP calls and log aggregation tools. |
| **Cloud-Ready** | Containerised, stateless deployment. External secrets management. Compatible with AWS ECS, Lambda, and managed Kubernetes. |

---

## 10. Open Items

| # | Item | Owner | Status |
|---|------|-------|--------|
| OI-01 | Confirm priority scale (P1–P5) maps to specific release milestones and delivery dates | Product Owner | Open |
| OI-02 | Confirm rollback is required for PAT-02 and PAT-05 failure scenarios, and which ERP targets support compensating DELETEs | Architect | Open |
| OI-03 | Define minimum NFR targets: throughput (requests per minute), maximum end-to-end latency | Engineering Lead | Open |
| OI-04 | Confirm idempotency strategy for retry scenarios — idempotency key header, deduplication window | Engineering Lead | Open |
| OI-05 | Confirm whether PAT-04 and PAT-09 should remain in the backlog or be removed from this document | Product Owner | Open |
| OI-06 | Define token refresh strategy for long-running fan-out operations (PAT-10) where ERP tokens may expire mid-execution | Security / Engineering | Open |
| OI-07 | Confirm log retention period (currently defaulted to 90 days) and whether PII data handling rules apply to logged payloads | Compliance | Open |
