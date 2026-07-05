# transformation-svc

Python port of the DB-side `transform_payload()`/`apply_field_transform()`
Postgres functions (`database/changelog/changes/010`, `011`), split into
independent, generically-dispatched stages so the same code runs locally
today and becomes Step Functions states later with minimal rework:

```
erp_transform/
  config.py        env-driven DB/HTTP config (local .env now, Lambda env vars later)
  db.py             read-only fetch of step/target/field_mapping (psycopg2, no ORM)
  transform.py      pure function: source JSON + field_mapping rows -> target JSON
  auth.py           credential resolution, dispatched by target.auth_type
  send.py           HTTP call to a target, dispatched by step.method
  orchestrator.py   chains db -> transform -> auth -> send for one step
cli.py              local CLI: transform-only, never sends a live HTTP request
```

## Why split this way

Each module maps to one Step Functions state later:
`FetchConfig -> Transform -> ResolveAuth -> SendRequest`. `transform.py` has
zero DB/HTTP dependency, so it's pure-function testable without mocks and
portable to any runtime (Lambda, container, local script) unchanged.

`auth.py`/`send.py` dispatch on `auth_type`/`method` strings read from the
`target`/`step` tables — adding a new auth mechanism or HTTP verb is a new
branch, not new code paths through the whole pipeline.

## Local setup

```bash
cd transformation-svc
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # adjust if your local Postgres differs from docker-compose defaults
```

Requires the local Docker Postgres from `../database` to be up and migrated
(see repo root `database/README` / `liquibase update`).

## Running the transform stage only (no HTTP call, safe against any config)

```bash
python cli.py --step-pk 3 --input ../documentation/sample-payloads/salesforce-contract-award-input.json
```

## Running tests

```bash
python -m pytest tests/ -v
```

`tests/test_transform.py` is pure unit tests, no DB needed.
`tests/test_db_integration.py` requires the local Postgres container; it
skips automatically (not fails) if the DB isn't reachable.

## Sending a live request (opt-in, not run by default)

`orchestrator.run_step(step_pk, source, send_request=True)` performs the
full round trip including the HTTP call. This is never invoked by the CLI or
test suite automatically — sending to a real target (client Oracle instance
or otherwise) is a deliberate, explicit call your own script/notebook makes,
requiring the target's `CRED_*` secret env var to be set first (see
`.env.example`). There is intentionally no CLI flag for this yet.

## Moving to Step Functions

Each function in `auth.py` (`get_credential`), `transform.py`
(`transform_payload`), and `send.py` (`execute_step`) takes and returns
plain dicts/dataclasses — no framework coupling — so each becomes one Lambda
handler's body, with the orchestration (currently `orchestrator.run_step`)
replaced by the state machine definition. `db.py`'s config fetch would run
either as its own Lambda/state, or get pre-resolved into the state machine's
input payload if pipeline config is looked up once per execution rather than
per step.
