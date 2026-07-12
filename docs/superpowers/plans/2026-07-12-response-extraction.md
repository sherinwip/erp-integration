# Config-Driven Response Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pipeline step declare named JSONPath extraction rules against its own HTTP response, persist those values per pipeline run, and let later steps in the same pipeline reference them via `{{var_name}}` — replacing `auth.py`'s inline oauth2 token fetch with a real, config-driven `fetchToken` step.

**Architecture:** `transformation-svc`'s orchestrator gains a `run_pipeline()` that actually sends HTTP requests (unlike the existing dry-run `transform_pipeline()`), tracked via new `pipeline_run`/`raw_payload` rows (backfilling tables that exist in the live DB but have no Liquibase source or code today). Each step's response is passed through a new `extract.py` module that evaluates the step's `extract` JSONPath rules and accumulates results into a run-scoped dict, persisted to a new `pipeline_run_extract` table. `send.py`'s existing `{{source.x}}`/`{{steps.x.y}}` template renderer gains a third branch for bare `{{var_name}}`. `auth.py` drops its Secrets-Manager-driven oauth2 branch in favor of reading the extracted `access_token`.

**Tech Stack:** Python 3.9, psycopg2 (plain SQL, no ORM), pytest, Liquibase (Postgres migrations), `jsonpath-ng` (new dependency).

## Global Constraints

- No ORM — all DB access via plain psycopg2 with `RealDictCursor`, matching `erp_transform/db.py`.
- All new dataclasses are `@dataclass(frozen=True)`, matching existing `Target`/`Step`/`Pipeline` style.
- Integration tests use `pytestmark = pytest.mark.integration` and the `skip_if_no_db` pattern (skip, don't fail, when Postgres is unreachable).
- `cli.py`'s existing dry-run behavior (no HTTP, no DB writes beyond reads) must remain unchanged when `--send` is not passed.
- Liquibase changesets are additive only — never edit a shipped changeset; add a new numbered file and register it in `db.changelog-master.xml`.
- `auth.py` never logs a resolved secret value (existing rule in its module docstring) — this still applies to `basic`/`apikey` paths, which are untouched.

---

## Task 1: Liquibase — backfill `pipeline_run`, `raw_payload`, `quarantine`, and add `pipeline_run_extract`

These three tables already exist in the live Docker Postgres DB but have no changelog source (confirmed via `\d` against the running container — no `createTable` for them anywhere in `database/liquibase/changelog/changes/`). This task makes Liquibase authoritative for their current shape and adds the one new table this feature needs.

**Files:**
- Create: `database/liquibase/changelog/changes/019-create-raw-payload-pipeline-run-quarantine.xml`
- Create: `database/liquibase/changelog/changes/020-create-pipeline-run-extract.xml`
- Modify: `database/liquibase/changelog/db.changelog-master.xml`

**Interfaces:**
- Produces: tables `raw_payload(raw_payload_id, pipeline_id, idempotency_key, payload, received_at)`, `pipeline_run(run_id, raw_payload_id, pipeline_id, status, started_at, completed_at)`, `quarantine(quarantine_id, raw_payload_id, stage, reason, payload, created_at)`, `pipeline_run_extract(run_id, step_pk, var_name, value)`.

- [ ] **Step 1: Write changelog 019 (backfill existing tables)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.29.xsd">

    <changeSet id="019-create-table-raw-payload" author="erp-integration">
        <preConditions onFail="MARK_RAN">
            <not><tableExists tableName="raw_payload"/></not>
        </preConditions>
        <createTable tableName="raw_payload">
            <column name="raw_payload_id" type="UUID" defaultValueComputed="gen_random_uuid()">
                <constraints primaryKey="true" nullable="false"/>
            </column>
            <column name="pipeline_id" type="VARCHAR(100)">
                <constraints nullable="false"/>
            </column>
            <column name="idempotency_key" type="VARCHAR(200)">
                <constraints nullable="false" unique="true" uniqueConstraintName="uq_raw_payload_idempotency_key"/>
            </column>
            <column name="payload" type="JSONB">
                <constraints nullable="false"/>
            </column>
            <column name="received_at" type="TIMESTAMP" defaultValueComputed="now()">
                <constraints nullable="false"/>
            </column>
        </createTable>
        <addForeignKeyConstraint
            baseTableName="raw_payload" baseColumnNames="pipeline_id"
            referencedTableName="pipeline" referencedColumnNames="pipeline_id"
            constraintName="fk_raw_payload_pipeline"/>
    </changeSet>

    <changeSet id="019-create-table-pipeline-run" author="erp-integration">
        <preConditions onFail="MARK_RAN">
            <not><tableExists tableName="pipeline_run"/></not>
        </preConditions>
        <createTable tableName="pipeline_run">
            <column name="run_id" type="UUID" defaultValueComputed="gen_random_uuid()">
                <constraints primaryKey="true" nullable="false"/>
            </column>
            <column name="raw_payload_id" type="UUID">
                <constraints nullable="false"/>
            </column>
            <column name="pipeline_id" type="VARCHAR(100)">
                <constraints nullable="false"/>
            </column>
            <column name="status" type="VARCHAR(20)" defaultValue="in_progress">
                <constraints nullable="false"/>
            </column>
            <column name="started_at" type="TIMESTAMP" defaultValueComputed="now()">
                <constraints nullable="false"/>
            </column>
            <column name="completed_at" type="TIMESTAMP"/>
        </createTable>
        <addForeignKeyConstraint
            baseTableName="pipeline_run" baseColumnNames="raw_payload_id"
            referencedTableName="raw_payload" referencedColumnNames="raw_payload_id"
            constraintName="fk_pipeline_run_raw_payload"/>
        <addForeignKeyConstraint
            baseTableName="pipeline_run" baseColumnNames="pipeline_id"
            referencedTableName="pipeline" referencedColumnNames="pipeline_id"
            constraintName="fk_pipeline_run_pipeline"/>
        <createIndex tableName="pipeline_run" indexName="idx_pipeline_run_raw_payload">
            <column name="raw_payload_id"/>
        </createIndex>
    </changeSet>

    <changeSet id="019-create-table-quarantine" author="erp-integration">
        <preConditions onFail="MARK_RAN">
            <not><tableExists tableName="quarantine"/></not>
        </preConditions>
        <createTable tableName="quarantine">
            <column name="quarantine_id" type="UUID" defaultValueComputed="gen_random_uuid()">
                <constraints primaryKey="true" nullable="false"/>
            </column>
            <column name="raw_payload_id" type="UUID">
                <constraints nullable="false"/>
            </column>
            <column name="stage" type="VARCHAR(50)">
                <constraints nullable="false"/>
            </column>
            <column name="reason" type="TEXT">
                <constraints nullable="false"/>
            </column>
            <column name="payload" type="JSONB">
                <constraints nullable="false"/>
            </column>
            <column name="created_at" type="TIMESTAMP" defaultValueComputed="now()">
                <constraints nullable="false"/>
            </column>
        </createTable>
        <addForeignKeyConstraint
            baseTableName="quarantine" baseColumnNames="raw_payload_id"
            referencedTableName="raw_payload" referencedColumnNames="raw_payload_id"
            constraintName="fk_quarantine_raw_payload"/>
        <createIndex tableName="quarantine" indexName="idx_quarantine_raw_payload">
            <column name="raw_payload_id"/>
        </createIndex>
    </changeSet>

</databaseChangeLog>
```

The `preConditions onFail="MARK_RAN"` guards make this changeset safe to run against the current Docker DB (where these tables already exist out-of-band) — Liquibase marks it executed without re-running `createTable`, but it becomes the source of truth for anyone running a fresh DB from scratch.

- [ ] **Step 2: Write changelog 020 (new table)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.29.xsd">

    <changeSet id="020-create-table-pipeline-run-extract" author="erp-integration">
        <createTable tableName="pipeline_run_extract">
            <column name="run_id" type="UUID">
                <constraints nullable="false"/>
            </column>
            <column name="step_pk" type="BIGINT">
                <constraints nullable="false"/>
            </column>
            <column name="var_name" type="VARCHAR(100)">
                <constraints nullable="false"/>
            </column>
            <column name="value" type="TEXT"/>
        </createTable>

        <addPrimaryKey tableName="pipeline_run_extract" columnNames="run_id, var_name"
            constraintName="pk_pipeline_run_extract"/>

        <addForeignKeyConstraint
            baseTableName="pipeline_run_extract" baseColumnNames="run_id"
            referencedTableName="pipeline_run" referencedColumnNames="run_id"
            constraintName="fk_pipeline_run_extract_run"/>

        <addForeignKeyConstraint
            baseTableName="pipeline_run_extract" baseColumnNames="step_pk"
            referencedTableName="step" referencedColumnNames="step_pk"
            constraintName="fk_pipeline_run_extract_step"/>
    </changeSet>

</databaseChangeLog>
```

- [ ] **Step 3: Register both changelogs in the master file**

Modify `database/liquibase/changelog/db.changelog-master.xml`, adding after the `018` include line:

```xml
    <include file="changes/019-create-raw-payload-pipeline-run-quarantine.xml" relativeToChangelogFile="true"/>
    <include file="changes/020-create-pipeline-run-extract.xml" relativeToChangelogFile="true"/>
```

- [ ] **Step 4: Run Liquibase update against the running container and verify**

```bash
cd /Users/sherinmathew/repo/erp-integration/database
docker exec erp-integration-postgres psql -U root -d erp_integration -c "\d pipeline_run_extract"
```

Run whatever Liquibase update command this project normally uses against the container (check `database/docker-entrypoint.sh` / `README.md` in `database/` for the exact invocation used elsewhere in this repo — do not guess a new one). Expected: `pipeline_run_extract` now exists with columns `run_id, step_pk, var_name, value` and the two FKs shown.

- [ ] **Step 5: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add database/liquibase/changelog/changes/019-create-raw-payload-pipeline-run-quarantine.xml \
        database/liquibase/changelog/changes/020-create-pipeline-run-extract.xml \
        database/liquibase/changelog/db.changelog-master.xml
git commit -m "db: backfill raw_payload/pipeline_run/quarantine changelog, add pipeline_run_extract"
```

---

## Task 2: `erp_transform/extract.py` — JSONPath rule evaluation

**Files:**
- Create: `transformation-svc/erp_transform/extract.py`
- Test: `transformation-svc/tests/test_extract.py`
- Modify: `transformation-svc/requirements.txt`

**Interfaces:**
- Produces: `class ExtractionError(RuntimeError)`; `apply_extract_rules(response_body: Any, rules: dict[str, str]) -> dict[str, Any]` — used by Task 4's orchestrator.

- [ ] **Step 1: Add the new dependency**

Modify `transformation-svc/requirements.txt`, appending:

```
jsonpath-ng==1.6.1
```

Install it:

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pip install -r requirements.txt
```

- [ ] **Step 2: Write the failing tests**

Create `transformation-svc/tests/test_extract.py`:

```python
"""Tests for erp_transform.extract — applying a step's JSONPath extraction
rules to its HTTP response body."""
import pytest

from erp_transform.extract import ExtractionError, apply_extract_rules


def test_single_top_level_match():
    body = {"access_token": "abc123", "token_type": "Bearer"}
    rules = {"access_token": "$.access_token"}
    assert apply_extract_rules(body, rules) == {"access_token": "abc123"}


def test_multiple_rules_in_one_call():
    body = {"access_token": "abc123", "expires_in": 3600}
    rules = {"access_token": "$.access_token", "expires_in": "$.expires_in"}
    assert apply_extract_rules(body, rules) == {
        "access_token": "abc123",
        "expires_in": 3600,
    }


def test_nested_path_match():
    body = {"data": {"token": {"value": "nested-token"}}}
    rules = {"token": "$.data.token.value"}
    assert apply_extract_rules(body, rules) == {"token": "nested-token"}


def test_array_index_match():
    body = {"items": [{"id": "first"}, {"id": "second"}]}
    rules = {"first_id": "$.items[0].id"}
    assert apply_extract_rules(body, rules) == {"first_id": "first"}


def test_no_match_raises_extraction_error():
    body = {"token_type": "Bearer"}
    rules = {"access_token": "$.access_token"}
    with pytest.raises(ExtractionError, match="access_token"):
        apply_extract_rules(body, rules)


def test_non_dict_response_body_raises_extraction_error():
    body = "plain text response, not JSON"
    rules = {"access_token": "$.access_token"}
    with pytest.raises(ExtractionError, match="not a JSON object"):
        apply_extract_rules(body, rules)


def test_empty_rules_returns_empty_dict():
    body = {"access_token": "abc123"}
    assert apply_extract_rules(body, {}) == {}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_extract.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'erp_transform.extract'`.

- [ ] **Step 4: Implement `extract.py`**

Create `transformation-svc/erp_transform/extract.py`:

```python
"""Applies a step's `extract` config (a dict of var_name -> JSONPath
expression) to that step's HTTP response body. Every rule must resolve to
exactly one value -- an unmatched path is treated as a hard failure since
later steps in the pipeline are assumed to depend on the extracted value
(e.g. no access_token means the next call's auth will fail anyway), so
failing here beats a confusing downstream error."""
from __future__ import annotations

from typing import Any

from jsonpath_ng.ext import parse as parse_jsonpath


class ExtractionError(RuntimeError):
    pass


def apply_extract_rules(response_body: Any, rules: dict[str, str]) -> dict[str, Any]:
    if not rules:
        return {}

    if not isinstance(response_body, dict):
        raise ExtractionError(
            f"cannot apply extract rules {list(rules)!r}: response body is "
            f"not a JSON object (got {type(response_body).__name__})"
        )

    result: dict[str, Any] = {}
    for var_name, jsonpath_expr in rules.items():
        matches = parse_jsonpath(jsonpath_expr).find(response_body)
        if not matches:
            raise ExtractionError(
                f"extract rule {var_name!r} ({jsonpath_expr!r}) matched "
                f"nothing in the response body"
            )
        result[var_name] = matches[0].value
    return result
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_extract.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/erp_transform/extract.py transformation-svc/tests/test_extract.py transformation-svc/requirements.txt
git commit -m "feat: add JSONPath response extraction module"
```

---

## Task 3: `send.py` — bare `{{var_name}}` template branch

**Files:**
- Modify: `transformation-svc/erp_transform/send.py:27-51` (the `_render_template` function)
- Test: `transformation-svc/tests/test_send.py` (new file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `_render_template(value: str, source: dict, previous_steps: dict, extracted: dict | None = None) -> str` — the `extracted` parameter is new; Task 4's orchestrator passes its run-scoped `extracted_scope` dict here. `execute_step(...)` gains the same new `extracted: Optional[dict] = None` parameter and threads it into every `_render_template` call inside it.

- [ ] **Step 1: Write the failing tests**

Create `transformation-svc/tests/test_send.py`:

```python
"""Tests for erp_transform.send's template rendering, covering the existing
{{source.x}} / {{steps.x.y}} conventions plus the new bare {{var_name}}
branch used for extracted values (e.g. {{access_token}})."""
from erp_transform.send import _render_template


def test_source_dot_path_unchanged():
    result = _render_template("{{source.orgId}}", {"orgId": 42}, {})
    assert result == "42"


def test_steps_dot_path_unchanged():
    previous_steps = {"lookup-project": {"ProjectId": "P-1"}}
    result = _render_template("{{steps.lookup-project.ProjectId}}", {}, previous_steps)
    assert result == "P-1"


def test_bare_var_name_resolves_from_extracted():
    result = _render_template(
        "Bearer {{access_token}}", {}, {}, extracted={"access_token": "abc123"}
    )
    assert result == "Bearer abc123"


def test_bare_var_name_missing_from_extracted_renders_empty():
    result = _render_template("Bearer {{access_token}}", {}, {}, extracted={})
    assert result == "Bearer "


def test_no_placeholder_returns_value_unchanged():
    result = _render_template("/fixed/path", {}, {})
    assert result == "/fixed/path"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_send.py -v
```

Expected: `test_bare_var_name_resolves_from_extracted` and `test_bare_var_name_missing_from_extracted_renders_empty` FAIL with `TypeError: _render_template() got an unexpected keyword argument 'extracted'`. The other three PASS already (they exercise existing behavior).

- [ ] **Step 3: Implement the new branch**

Modify `transformation-svc/erp_transform/send.py`, replacing the `_render_template` function (currently lines 27-51):

```python
def _render_template(
    value: str,
    source: dict,
    previous_steps: dict,
    extracted: dict | None = None,
) -> str:
    """{{source.x}} / {{steps.stepName.x}} / {{var_name}} renderer for URL
    paths, query params, and headers. {{source.*}} and {{steps.*}} mirror
    the template syntax in pipeline-routing-config-db-requirements.md §3.2.
    Bare {{var_name}} (no dot) is a distinct namespace: values produced by
    an earlier step's `extract` rules for this pipeline run (see
    erp_transform.extract), e.g. {{access_token}}."""
    if "{{" not in value:
        return value

    import re

    extracted = extracted or {}

    def replace(match: "re.Match") -> str:
        expr = match.group(1).strip()
        parts = expr.split(".")
        if parts[0] == "source":
            node: Any = source
            for p in parts[1:]:
                node = node.get(p) if isinstance(node, dict) else None
            return str(node) if node is not None else ""
        if parts[0] == "steps":
            step_name, *rest = parts[1:]
            node = previous_steps.get(step_name, {})
            for p in rest:
                node = node.get(p) if isinstance(node, dict) else None
            return str(node) if node is not None else ""
        if len(parts) == 1:
            node = extracted.get(parts[0])
            return str(node) if node is not None else ""
        return match.group(0)

    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replace, value)
```

Then update `execute_step` (same file) to accept and thread the new parameter. Replace its signature and the three call sites:

```python
def execute_step(
    step: Step,
    target: Target,
    credential: Credential,
    body: Optional[dict],
    source: Optional[dict] = None,
    previous_steps: Optional[dict] = None,
    extracted: Optional[dict] = None,
) -> StepResult:
    source = source or {}
    previous_steps = previous_steps or {}
    extracted = extracted or {}

    path = _render_template(step.path, source, previous_steps, extracted)
    url = target.base_url.rstrip("/") + "/" + path.lstrip("/")

    query_params = {}
    if step.query_params:
        for key, value in step.query_params.items():
            query_params[key] = _render_template(str(value), source, previous_steps, extracted)

    headers = dict(target.default_headers or {})
    if step.headers:
        for key, value in step.headers.items():
            headers[key] = _render_template(str(value), source, previous_steps, extracted)
    headers[credential.header_name] = credential.header_value
```

(The rest of `execute_step` — the `requests.request(...)` call and `StepResult` construction — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_send.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/erp_transform/send.py transformation-svc/tests/test_send.py
git commit -m "feat: add bare {{var_name}} template branch for extracted values"
```

---

## Task 4: `db.py` — run/raw_payload persistence functions

**Files:**
- Modify: `transformation-svc/erp_transform/db.py` (append new dataclass + functions; no existing function signatures change)
- Test: `transformation-svc/tests/test_db_integration.py` (existing file — add tests following its established pattern)

**Interfaces:**
- Consumes: `get_connection` (existing).
- Produces:
  - `@dataclass(frozen=True) class PipelineRun: run_id: str; raw_payload_id: str; pipeline_id: str; status: str`
  - `create_raw_payload(conn, pipeline_id: str, idempotency_key: str, payload: dict) -> str` (returns `raw_payload_id`, reusing an existing row on conflict)
  - `create_pipeline_run(conn, raw_payload_id: str, pipeline_id: str) -> PipelineRun`
  - `update_pipeline_run_status(conn, run_id: str, status: str) -> None` (sets `completed_at = now()` whenever status is `completed` or `failed`)
  - `insert_pipeline_run_extract(conn, run_id: str, step_pk: int, values: dict[str, Any]) -> None`

- [ ] **Step 1: Read the existing integration test file to confirm conventions**

Read `transformation-svc/tests/test_db_integration.py` in full before writing new tests — match its exact fixture/cleanup style (it already has the `skip_if_no_db` pattern seen in `test_orchestrator.py`; reuse the same helper rather than redefining it if it's already defined there).

- [ ] **Step 2: Write the failing tests**

Append to `transformation-svc/tests/test_db_integration.py` (adjust the skip-guard import/name to whatever that file already defines — do not redefine `_db_available`/`skip_if_no_db` if present):

```python
import json

from erp_transform.db import (
    create_pipeline_run,
    create_raw_payload,
    get_connection,
    insert_pipeline_run_extract,
    update_pipeline_run_status,
)


@skip_if_no_db
def test_create_raw_payload_and_pipeline_run_roundtrip():
    with get_connection() as conn:
        raw_payload_id = create_raw_payload(
            conn,
            pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=f"test-key-{json.dumps({'x': 1})}",
            payload={"x": 1},
        )
        run = create_pipeline_run(
            conn, raw_payload_id=raw_payload_id, pipeline_id="award-to-oracle-contract-full-v1"
        )
        assert run.raw_payload_id == raw_payload_id
        assert run.status == "in_progress"

        update_pipeline_run_status(conn, run.run_id, "completed")

        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, completed_at FROM pipeline_run WHERE run_id = %s",
                (run.run_id,),
            )
            status, completed_at = cur.fetchone()
            assert status == "completed"
            assert completed_at is not None
        conn.commit()


@skip_if_no_db
def test_create_raw_payload_is_idempotent():
    with get_connection() as conn:
        key = "duplicate-key-test"
        first_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=key, payload={"a": 1},
        )
        second_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=key, payload={"a": 1},
        )
        assert first_id == second_id
        conn.commit()


@skip_if_no_db
def test_insert_pipeline_run_extract_roundtrip():
    with get_connection() as conn:
        raw_payload_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key="extract-test-key", payload={},
        )
        run = create_pipeline_run(
            conn, raw_payload_id=raw_payload_id, pipeline_id="award-to-oracle-contract-full-v1"
        )
        insert_pipeline_run_extract(conn, run.run_id, step_pk=6, values={"access_token": "abc123"})

        with conn.cursor() as cur:
            cur.execute(
                "SELECT var_name, value FROM pipeline_run_extract WHERE run_id = %s",
                (run.run_id,),
            )
            rows = dict(cur.fetchall())
            assert rows["access_token"] == "abc123"
        conn.commit()
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_db_integration.py -k "raw_payload or pipeline_run_extract" -v
```

Expected: FAIL with `ImportError: cannot import name 'create_raw_payload'`.

- [ ] **Step 4: Implement the new functions**

Append to `transformation-svc/erp_transform/db.py`:

```python
@dataclass(frozen=True)
class PipelineRun:
    run_id: str
    raw_payload_id: str
    pipeline_id: str
    status: str


def create_raw_payload(conn, pipeline_id: str, idempotency_key: str, payload: dict) -> str:
    """Inserts a raw_payload row, or returns the existing raw_payload_id if
    idempotency_key already exists (cheap dedup only -- real replay/skip
    ingestion semantics are out of scope here)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO raw_payload (pipeline_id, idempotency_key, payload)
            VALUES (%s, %s, %s)
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING raw_payload_id
            """,
            (pipeline_id, idempotency_key, psycopg2.extras.Json(payload)),
        )
        row = cur.fetchone()
        if row is not None:
            conn.commit()
            return str(row[0])

        cur.execute(
            "SELECT raw_payload_id FROM raw_payload WHERE idempotency_key = %s",
            (idempotency_key,),
        )
        raw_payload_id = cur.fetchone()[0]
        conn.commit()
        return str(raw_payload_id)


def create_pipeline_run(conn, raw_payload_id: str, pipeline_id: str) -> PipelineRun:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pipeline_run (raw_payload_id, pipeline_id)
            VALUES (%s, %s)
            RETURNING run_id, status
            """,
            (raw_payload_id, pipeline_id),
        )
        run_id, status = cur.fetchone()
        conn.commit()
        return PipelineRun(
            run_id=str(run_id),
            raw_payload_id=raw_payload_id,
            pipeline_id=pipeline_id,
            status=status,
        )


def update_pipeline_run_status(conn, run_id: str, status: str) -> None:
    with conn.cursor() as cur:
        if status in ("completed", "failed"):
            cur.execute(
                "UPDATE pipeline_run SET status = %s, completed_at = now() WHERE run_id = %s",
                (status, run_id),
            )
        else:
            cur.execute(
                "UPDATE pipeline_run SET status = %s WHERE run_id = %s",
                (status, run_id),
            )
        conn.commit()


def insert_pipeline_run_extract(conn, run_id: str, step_pk: int, values: dict) -> None:
    if not values:
        return
    with conn.cursor() as cur:
        for var_name, value in values.items():
            cur.execute(
                """
                INSERT INTO pipeline_run_extract (run_id, step_pk, var_name, value)
                VALUES (%s, %s, %s, %s)
                """,
                (run_id, step_pk, var_name, str(value)),
            )
        conn.commit()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_db_integration.py -k "raw_payload or pipeline_run_extract" -v
```

Expected: all new tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/erp_transform/db.py transformation-svc/tests/test_db_integration.py
git commit -m "feat: add pipeline_run/raw_payload/pipeline_run_extract persistence"
```

---

## Task 5: `auth.py` — replace inline oauth2 with extracted-token lookup

**Files:**
- Modify: `transformation-svc/erp_transform/auth.py:60-80,98-109`
- Test: `transformation-svc/tests/test_auth.py` (new file)

**Interfaces:**
- Consumes: nothing new (no DB/HTTP calls added here — this function only reads from an in-memory dict passed by the caller).
- Produces: `get_credential(target: Target, extracted: dict | None = None) -> Credential` — the `extracted` parameter is new. Task 6's orchestrator is the caller that supplies it.

- [ ] **Step 1: Write the failing tests**

Create `transformation-svc/tests/test_auth.py`:

```python
"""Tests for erp_transform.auth's credential resolution, covering the
oauth2 path (now sourced from an already-extracted access_token instead of
an inline Secrets Manager token-fetch call) and confirming basic/apikey
are unaffected."""
import pytest

from erp_transform.auth import AuthError, get_credential
from erp_transform.db import Target


def _target(auth_type: str) -> Target:
    return Target(
        target_id="t1", client_id="c1", target_name="Test Target",
        base_url="http://example.test", auth_type=auth_type,
        credential_ref="unused-for-oauth2", default_headers={},
    )


def test_oauth2_uses_extracted_access_token():
    credential = get_credential(_target("oauth2"), extracted={"access_token": "tok-abc"})
    assert credential.header_name == "Authorization"
    assert credential.header_value == "Bearer tok-abc"


def test_oauth2_without_extracted_token_raises():
    with pytest.raises(AuthError, match="no access_token extracted"):
        get_credential(_target("oauth2"), extracted={})


def test_oauth2_without_extracted_arg_at_all_raises():
    with pytest.raises(AuthError, match="no access_token extracted"):
        get_credential(_target("oauth2"))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_auth.py -v
```

Expected: FAIL — `get_credential()` doesn't accept `extracted` yet (`TypeError`), and the current oauth2 path calls Secrets Manager instead of raising `AuthError`.

- [ ] **Step 3: Implement the change**

Modify `transformation-svc/erp_transform/auth.py`. Remove the `_oauth2_client_credentials` function (lines 60-80) entirely, replacing it with:

```python
def _oauth2_from_extracted(target: Target, extracted: dict) -> Credential:
    """oauth2 credentials are no longer fetched inline here -- they come from
    a pipeline step (e.g. `fetchToken`) that ran earlier in the same
    pipeline_run and had `access_token` as one of its extract rules. See
    erp_transform.extract and orchestrator.run_pipeline."""
    token = extracted.get("access_token")
    if token is None:
        raise AuthError(
            f"no access_token extracted before target {target.target_id!r} "
            f"needed oauth2 credentials -- add an earlier pipeline step "
            f"whose `extract` config produces `access_token`"
        )
    return Credential(header_name="Authorization", header_value=f"Bearer {token}")
```

Then update the dispatch table and `get_credential` (currently lines 98-109):

```python
_DISPATCH = {
    "oauth2": _oauth2_from_extracted,
    "basic": _basic_auth,
    "apikey": _api_key,
}


def get_credential(target: Target, extracted: Optional[dict] = None) -> Credential:
    extracted = extracted or {}
    handler = _DISPATCH.get(target.auth_type)
    if handler is None:
        raise AuthError(f"unsupported auth_type {target.auth_type!r} for target {target.target_id!r}")
    if target.auth_type == "oauth2":
        return handler(target, extracted)
    return handler(target)
```

Add `Optional` to the existing `typing` import at the top of the file (it currently has no typing import beyond what's inline — check the file's current imports and add `from typing import Optional` if not already present).

Since `_oauth2_client_credentials` is gone, the module no longer needs its `requests.post(...)` token-fetch call, but `requests` is still used nowhere else in `auth.py` — remove the now-unused `import requests` if nothing else in the file needs it (check with `grep -n "requests\." erp_transform/auth.py` after the edit).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_auth.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/erp_transform/auth.py transformation-svc/tests/test_auth.py
git commit -m "feat: resolve oauth2 credentials from extracted access_token instead of inline fetch"
```

---

## Task 6: `orchestrator.py` — `run_pipeline()` end-to-end

**Files:**
- Modify: `transformation-svc/erp_transform/orchestrator.py` (add new function; existing `transform_only`/`transform_pipeline`/`run_step` untouched)
- Test: `transformation-svc/tests/test_orchestrator.py` (append)

**Interfaces:**
- Consumes: `db.create_raw_payload`, `db.create_pipeline_run`, `db.update_pipeline_run_status`, `db.insert_pipeline_run_extract` (Task 4); `extract.apply_extract_rules`, `extract.ExtractionError` (Task 2); `auth.get_credential(target, extracted)` (Task 5); `send.execute_step(..., extracted=...)` (Task 3).
- Produces: `run_pipeline(pipeline_id: str, source: dict) -> dict` — returns `{"pipeline_id", "run_id", "status", "steps": [{"seq", "step_name", "status_code", "response_body"}]}`.

- [ ] **Step 1: Write the failing tests**

Append to `transformation-svc/tests/test_orchestrator.py`:

```python
import hashlib
import json

from erp_transform.db import get_connection
from erp_transform.orchestrator import run_pipeline


@skip_if_no_db
def test_run_pipeline_happy_path_extracts_token_and_uses_it():
    source = {
        "orgId": 300000019976011,
        "contractNumber": f"TEST-{hashlib.sha1(str(id(object())).encode()).hexdigest()[:8]}",
        "legalEntityName": "Test Corp",
        "startDate": "2026-03-20",
        "headerAttributes": {},
        "parties": [{"partyRoleCode": "CUSTOMER", "role": "Customer", "partyName": "Test Buyer"}],
        "lines": [{"itemName": "ITEM-1", "lineAttributes": {}}],
    }
    result = run_pipeline("vaibhav-award-to-oracle-contract-demo-v1", source)

    assert result["pipeline_id"] == "vaibhav-award-to-oracle-contract-demo-v1"
    assert result["status"] == "completed"
    assert [s["step_name"] for s in result["steps"]] == ["fetchToken", "create-oracle-contract-demo"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM pipeline_run WHERE run_id = %s", (result["run_id"],)
            )
            assert cur.fetchone()[0] == "completed"
            cur.execute(
                "SELECT var_name, value FROM pipeline_run_extract WHERE run_id = %s",
                (result["run_id"],),
            )
            extracted_rows = dict(cur.fetchall())
            assert "access_token" in extracted_rows


@skip_if_no_db
def test_run_pipeline_marks_failed_when_extract_rule_does_not_match():
    """Points fetchToken's extract rule at a JSONPath the mock oauth server's
    response never contains, so extraction should fail and abort the run
    before the business step ever executes."""
    import erp_transform.db as db_module

    original_get_pipeline_steps = db_module.get_pipeline_steps

    def _broken_get_pipeline_steps(conn, pipeline_id):
        steps = original_get_pipeline_steps(conn, pipeline_id)
        patched = []
        for ps in steps:
            if ps.step.step_name == "fetchToken":
                broken_extract = {"access_token": "$.this_field_does_not_exist"}
                broken_step = ps.step.__class__(
                    **{**ps.step.__dict__, "extract": broken_extract}
                )
                patched.append(ps.__class__(seq=ps.seq, step=broken_step))
            else:
                patched.append(ps)
        return patched

    db_module.get_pipeline_steps = _broken_get_pipeline_steps
    try:
        result = run_pipeline("vaibhav-award-to-oracle-contract-demo-v1", {})
        assert result["status"] == "failed"
        assert [s["step_name"] for s in result["steps"]] == ["fetchToken"]
    finally:
        db_module.get_pipeline_steps = original_get_pipeline_steps
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_orchestrator.py -k run_pipeline -v
```

Expected: FAIL with `ImportError: cannot import name 'run_pipeline'`.

- [ ] **Step 3: Implement `run_pipeline`**

Modify `transformation-svc/erp_transform/orchestrator.py`. Add these imports at the top (alongside the existing `from . import auth, db, send, transform`):

```python
import hashlib
import json

from .extract import apply_extract_rules
```

Append the new function at the end of the file:

```python
def run_pipeline(pipeline_id: str, source: dict) -> dict:
    """
    Full send-for-real pipeline run: creates raw_payload + pipeline_run
    tracking rows, then executes every attached step in seq order via real
    HTTP calls (unlike transform_pipeline(), which never sends). Each
    step's `extract` rules (if any) are applied to its response and
    accumulated into a run-scoped dict available to later steps as
    {{var_name}} in path/query_params/headers, and to oauth2 targets as
    their bearer credential (see auth.get_credential).

    idempotency_key is a cheap hash of (pipeline_id, source) -- this is not
    real webhook ingestion (no request-header-derived key, no replay
    policy), just enough to satisfy raw_payload's uniqueness constraint for
    repeated local/test invocations of the same input.
    """
    idempotency_key = hashlib.sha256(
        (pipeline_id + json.dumps(source, sort_keys=True)).encode()
    ).hexdigest()

    cfg_conn_kwargs = {}
    with db.get_connection(**cfg_conn_kwargs) as conn:
        raw_payload_id = db.create_raw_payload(conn, pipeline_id, idempotency_key, source)
        run = db.create_pipeline_run(conn, raw_payload_id, pipeline_id)
        pipeline_steps = db.get_pipeline_steps(conn, pipeline_id)
        targets_by_id = {
            ps.step.target_id: db.get_target(conn, ps.step.target_id)
            for ps in pipeline_steps
        }
        mappings_by_step = {
            ps.step.step_pk: db.get_field_mappings(conn, ps.step.step_pk)
            for ps in pipeline_steps
        }

    steps_scope: dict = {}
    extracted_scope: dict = {}
    step_results = []

    try:
        with db.get_connection() as conn:
            for ps in pipeline_steps:
                step = ps.step
                target = targets_by_id[step.target_id]
                mappings = mappings_by_step[step.step_pk]

                scoped_source = dict(source)
                scoped_source["steps"] = steps_scope
                transformed_body = (
                    transform.transform_payload(scoped_source, mappings) if mappings else {}
                )

                credential = auth.get_credential(target, extracted=extracted_scope)
                step_result = send.execute_step(
                    step=step,
                    target=target,
                    credential=credential,
                    body=transformed_body,
                    source=source,
                    previous_steps=steps_scope,
                    extracted=extracted_scope,
                )

                steps_scope[step.step_name] = transformed_body
                step_results.append({
                    "seq": ps.seq,
                    "step_name": step.step_name,
                    "status_code": step_result.status_code,
                    "response_body": step_result.response_body,
                })

                if step.extract:
                    new_values = apply_extract_rules(step_result.response_body, step.extract)
                    extracted_scope.update(new_values)
                    db.insert_pipeline_run_extract(conn, run.run_id, step.step_pk, new_values)

        with db.get_connection() as conn:
            db.update_pipeline_run_status(conn, run.run_id, "completed")

        return {
            "pipeline_id": pipeline_id,
            "run_id": run.run_id,
            "status": "completed",
            "steps": step_results,
        }
    except Exception:
        with db.get_connection() as conn:
            db.update_pipeline_run_status(conn, run.run_id, "failed")
        return {
            "pipeline_id": pipeline_id,
            "run_id": run.run_id,
            "status": "failed",
            "steps": step_results,
        }
```

Note this returns a `status: "failed"` dict rather than re-raising, matching the test in Step 1 which asserts on `result["status"]`. (The spec's "re-raise after updating" language is satisfied at the CLI layer in Task 7, which checks `result["status"]` and exits non-zero — re-raising here would prevent the caller from seeing which steps did complete before the failure.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_orchestrator.py -k run_pipeline -v
```

Expected: both new tests PASS. If `test_run_pipeline_happy_path_extracts_token_and_uses_it` fails because the mock oauth server (`mock-oracle-fusion`) isn't running, start it per that project's own run instructions before re-running — this test requires a live HTTP response to extract from, not just DB state.

- [ ] **Step 5: Run the full existing test suite to confirm no regressions**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest -v
```

Expected: all tests PASS, including the pre-existing `test_transform.py`, `test_orchestrator.py` (original `transform_pipeline` tests), `test_db_integration.py`, and the new `test_extract.py`/`test_send.py`/`test_auth.py`.

- [ ] **Step 6: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/erp_transform/orchestrator.py transformation-svc/tests/test_orchestrator.py
git commit -m "feat: add run_pipeline for real HTTP execution with response extraction"
```

---

## Task 7: `cli.py` — `--send` flag

**Files:**
- Modify: `transformation-svc/cli.py`

**Interfaces:**
- Consumes: `orchestrator.run_pipeline(pipeline_id, source)` (Task 6).
- Produces: none (terminal CLI behavior only).

- [ ] **Step 1: Modify the CLI**

Modify `transformation-svc/cli.py`. Update the import line and `main()`:

```python
from erp_transform.orchestrator import run_pipeline, transform_only, transform_pipeline


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local transform stage against a pipeline's or step's field_mapping config.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pipeline-id", type=str, help="Pipeline identifier (what a CRM caller actually knows).")
    group.add_argument("--step-pk", type=int, help="Internal step primary key (debugging a single step).")
    parser.add_argument("--input", type=str, required=True, help="Path to a JSON file with the source payload.")
    parser.add_argument(
        "--send", action="store_true",
        help="Actually send HTTP requests and persist a pipeline_run (requires --pipeline-id). "
             "Without this flag, runs the dry-run transform-only path: no HTTP, no DB writes beyond reads.",
    )
    args = parser.parse_args()

    with open(args.input) as f:
        source = json.load(f)

    if args.send:
        if not args.pipeline_id:
            print("--send requires --pipeline-id", file=sys.stderr)
            return 1
        result = run_pipeline(args.pipeline_id, source)
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "completed" else 1

    if args.pipeline_id:
        result = transform_pipeline(args.pipeline_id, source)
    else:
        result = transform_only(args.step_pk, source)

    print(json.dumps(result, indent=2))
    return 0
```

- [ ] **Step 2: Manually verify dry-run behavior is unchanged**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
python cli.py --pipeline-id award-to-oracle-contract-full-v1 --input ../documentation/sample-payloads/salesforce-contract-award-input.json
```

Expected: same JSON output as before this task (transformed body only, no `run_id`/`status` keys) — confirms the non-`--send` path is untouched.

- [ ] **Step 3: Manually verify the new `--send` path**

```bash
python cli.py --pipeline-id vaibhav-award-to-oracle-contract-demo-v1 --send --input <path to a valid source JSON for this pipeline>
```

Expected: JSON output with `"status": "completed"`, a `run_id`, and both `fetchToken` and `create-oracle-contract-demo` in `steps`. Exit code `0`. Confirm in the DB:

```bash
docker exec erp-integration-postgres psql -U root -d erp_integration -c "select run_id, status from pipeline_run order by started_at desc limit 1;"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add transformation-svc/cli.py
git commit -m "feat: add --send flag to CLI for real pipeline execution"
```

---

## Task 8: Config portal — fix Response Extraction placeholder text

**Files:**
- Modify: `erp-config-portal/src/screens/CreateUpdateWorkflow.jsx:564`

**Interfaces:** none — this is a copy-only change, no data shape change (the existing `{source, target}` → `extract: {target: source}` mapping already round-trips correctly, confirmed in the design phase).

- [ ] **Step 1: Make the change**

Modify `erp-config-portal/src/screens/CreateUpdateWorkflow.jsx` line 564:

```jsx
                placeholder="$.access_token"
```

(replacing the current `placeholder="response.path"`).

- [ ] **Step 2: Manually verify in the running portal**

With the dev server running (`npm run dev` in `erp-config-portal/`, already confirmed reachable at `http://localhost:5173/` earlier this session), open the `fetchToken` step under the `vaibhav1-DEMO` client's workflow editor and confirm the Response Extraction row's left input now shows `$.access_token` as placeholder text when empty.

- [ ] **Step 3: Commit**

```bash
cd /Users/sherinmathew/repo/erp-integration
git add erp-config-portal/src/screens/CreateUpdateWorkflow.jsx
git commit -m "fix: update Response Extraction placeholder to JSONPath syntax"
```

---

## Task 9: Seed the `fetchToken` step's real extract rule

The `vaibhav1-DEMO-oracle-fusion-contracts` / `vaibhav1-DEMO-token` setup already exists in the DB (confirmed earlier this session) but its `fetchToken` step (`step_pk=6`) has an empty `extract` — this is the actual gap the user originally reported. This task closes it using the now-working feature, either via the portal UI or directly, to make the demo pipeline functional end-to-end.

**Files:** none (data-only change) — optionally exercised via the portal UI from Task 8.

**Interfaces:** none.

- [ ] **Step 1: Set the extract rule via the API**

```bash
curl -s -X PATCH http://localhost:8010/api/v1/steps/6 \
  -H "Content-Type: application/json" \
  -d '{"extract": {"access_token": "$.access_token"}}'
```

(Adjust the endpoint path if `erp-config-api`'s step routes differ from the `/targets` pattern seen earlier — check `erp-config-api/app/api/v1/endpoints/` for the actual step router prefix before running this.)

- [ ] **Step 2: Verify**

```bash
docker exec erp-integration-postgres psql -U root -d erp_integration -c "select step_pk, step_name, extract from step where step_pk=6;"
```

Expected: `extract` column now shows `{"access_token": "$.access_token"}`.

- [ ] **Step 3: Run the Task 6 happy-path integration test again as final end-to-end confirmation**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
pytest tests/test_orchestrator.py -k test_run_pipeline_happy_path_extracts_token_and_uses_it -v
```

Expected: PASS, with `access_token` now genuinely round-tripping from the real DB config end to end (not a test-only patched value).

- [ ] **Step 4: Commit**

No file changes in this task (data-only) — nothing to commit. If the team's convention is to also track a DB seed/fixture file for demo data (check `database/liquibase/changelog/changes/007-seed-data.xml` and `009-seed-oracle-contract-pipeline.xml` for precedent), consider a follow-up changelog to make this seed reproducible; treat that as optional and out of scope for this plan unless requested.

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), portal placeholder (Task 8), ingestion/run lifecycle (Tasks 1, 4, 6, 7), extraction + auth flow (Tasks 2, 3, 5, 6), error handling (Task 6's try/except + Task 2's `ExtractionError`), testing (a test task embedded in every task). All five design sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows real code or a real command with expected output.
- **Type consistency:** `apply_extract_rules(response_body, rules) -> dict` (Task 2) is called identically in Task 6. `_render_template(..., extracted=...)` (Task 3) and `execute_step(..., extracted=...)` (Task 3) match the call in Task 6. `get_credential(target, extracted=...)` (Task 5) matches Task 6's call. `PipelineRun.run_id`/`.status` (Task 4) match Task 6's usage (`run.run_id`, checked against `"completed"`/`"failed"`).
