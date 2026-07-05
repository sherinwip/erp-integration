# erp-config-api

FastAPI CRUD API over the pipeline routing/config schema defined in
`../database/changelog` and `../documentation/pipeline-routing-config-db-requirements.md`.
Manages `client`, `target`, `step`, `pipeline`, `pipeline_step`, `field_mapping`.

## Structure

```
app/
  core/       config, DB session, exception handlers
  models/     SQLAlchemy ORM (mirrors Liquibase schema; no migrations here)
  schemas/    Pydantic request/response models per entity
  crud/       DB access + business validation (FK checks, uniqueness, pattern rules)
  api/v1/     versioned routers, one module per entity
  main.py     app factory, mounts /api/v1
tests/        pytest + SQLite in-memory, one file per entity/flow
postman/      collection + environment for manual/CI testing
```

Adding a new API version means adding `app/api/v2/` and mounting it in `main.py` --
`app/crud` and `app/models` are version-agnostic and reused.

## Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # points at the same Postgres as ../database and ../transformation-svc
uvicorn app.main:app --reload --port 8010
```

Docs: `http://localhost:8010/docs`

## Test

```bash
pytest -q
```

## Postman

Import `postman/erp-config-api.postman_collection.json` and
`postman/erp-config-api.postman_environment.json`. Covers all 14 routes:
clients, targets, steps, pipelines (+ ordered steps), pipeline-steps (junction),
field-mappings.

## Error format

All errors: `{"error": "<Code>", "detail": "<message>"}`.

| Code | Status | When |
|---|---|---|
| `NotFound` | 404 | referenced row doesn't exist |
| `Conflict` | 409 | duplicate PK / unique constraint / DB integrity violation |
| `ValidationError` | 422 | cross-entity rule violated (e.g. step's target belongs to a different client, unsupported pattern) |
| `InternalError` | 500 | unhandled |

Validation rules enforced beyond the DB schema (per the requirements doc):
- `pattern_id` must not be `PAT-04` or `PAT-09` (FR-CLM-004)
- a step's `target_id` must belong to the step's own `client_id` (FR-DBS-007rev)
- a `pipeline_step` attachment requires the step and pipeline to share the same `client_id`
- a pipeline may attach a given step at most once; `seq` is unique per pipeline (FR-CFM-004)
