# Oracle Fusion Contract Creation — Sample Payloads

Source: `Contract Creation Steps.docx` (2-step curl flow: OAuth2 client-credentials
token, then `POST /fscmRestApi/resources/11.13.18.05/contracts`).

- `salesforce-contract-award-input.json` — assumed inbound Salesforce payload (no
  real Salesforce schema was provided, so field names/shape are inferred to cover
  every field the Oracle payload needs).
- `oracle-fusion-contract-output.json` — the exact Oracle request body from the doc
  (sanitized: bearer token / auth removed, `Authorization` handled by the pipeline's
  `target.auth` config, not hardcoded).

## Pipeline

Seeded via `database/changelog/changes/009-seed-oracle-contract-pipeline.xml`:

| Field | Value |
|---|---|
| `pipeline_id` | `award-to-oracle-contract-full-v1` |
| `pattern_id` | PAT-01 (Simple Transform and POST) |
| routing key | `salesforce` / `ContractAward` / `createFull` |
| target | `AV-oracle-fusion-contracts` → `https://ewnj-test.fa.us8.oraclecloud.com` |
| step | `create-oracle-contract-full` → `POST /fscmRestApi/resources/11.13.18.05/contracts` |

`event_type` is `createFull` (not `create`) to avoid colliding with the existing
seeded PAT-03 demo pipeline on the same routing key.

## Why this needed a schema change

The Oracle payload has three nested array blocks the original flat
`field_mapping` (single `source_path` → `target_path` per row) couldn't express:

- `ContractHeaderFlexfieldVA[1]` — a **singleton** array; source is a single
  `headerAttributes` object, Oracle still wants it wrapped in a 1-element array.
- `ContractParty[]` — a **true repeating** array driven by source `parties[]`.
- `ContractLine[]` — a true repeating array driven by source `lines[]`, each with
  its own nested singleton `ContractAllLineDesFlexVA[1]` built from
  `lines[].lineAttributes`.

Changeset `008-alter-field-mapping-add-array-support.xml` adds three columns to
`field_mapping`:

| Column | Purpose |
|---|---|
| `array_source_path` | Source array to iterate (empty string = flat scalar mapping, unchanged behavior) |
| `array_target_path` | Target array this row belongs to (empty string = flat scalar mapping) |
| `is_singleton_array` | `true` = source is one object, not an array, but must still produce exactly one target array element |

For array rows, `source_path`/`target_path` are **relative to one item** of the
array, not absolute from the payload root — so the same relative name
(e.g. `ContractLine.ItemName` vs. some other array's `ItemName`) can't collide;
the uniqueness constraint was widened to `(step_pk, array_target_path, target_path)`.

A literal-value pseudo-source `__literal.<value>` is used for the two constant
`__FLEX_Context` / `__FLEX_Context_DisplayValue` fields Oracle requires on every
flexfield block — these aren't in the Salesforce payload at all, they're fixed by
the Oracle descriptive flexfield definition.

## Verifying the seed

```sql
select array_target_path, count(*) from field_mapping where step_pk = 3 group by array_target_path;
```

Expect: `` (empty, header scalars) = 14, `ContractHeaderFlexfieldVA` = 22,
`ContractParty` = 3, `ContractLine` = 13, `ContractLine.ContractAllLineDesFlexVA` = 15
— 67 rows total, matching the Oracle payload field-for-field.

Postman coverage: `documentation/postman/erp-integration.postman_collection.json`,
folder **"07 - Entity Testing: Full Oracle Contract Pipeline"**.
