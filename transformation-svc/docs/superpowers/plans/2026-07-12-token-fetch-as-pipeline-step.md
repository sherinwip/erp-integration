# Token-Fetch-As-Pipeline-Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden oauth2-token-fetch-inside-auth.py mechanism with an explicit `fetchToken` pipeline step whose HTTP response is threaded into a later step's `Authorization` header via template substitution, so the token call is visible/loggable/retryable in `pipeline_run` history like any other step.

**Architecture:** Two small, generic extensions to the existing step engine — (1) `orchestrator.py` starts storing each step's HTTP *response* in `steps_scope`, not just its transformed request body; (2) `send.py`'s existing `{{steps.x.y}}` template renderer, already used for path/query, is also applied to `step.headers`. A `fetchToken` step is just an ordinary step (auth_type=`basic`, hits the token endpoint) — no new step "kind" or special-cased orchestrator branch. The oauth2 auth_type and its `_oauth2_client_credentials` handler are deleted from `auth.py` entirely; every target becomes `basic`, `apikey`, or a new no-op `none` (for steps like the resource-creation step that get their auth header purely from `step.headers` templating and must not have `get_credential` overwrite it).

**Tech Stack:** Python 3.9, Flask/FastAPI, psycopg2, boto3 (Secrets Manager / LocalStack), pytest, PostgreSQL (via Liquibase changelog under `database/changelog/`).

## Global Constraints

- Secrets Manager secret shape for Basic-auth targets (including the new token-endpoint targets): `{"username": "<clientId>", "password": "<clientSecret>"}` — exactly what `_basic_auth` already expects, no new secret-parsing code.
- `scope` (OAuth2 scope string) is **not** secret material — it lives in the `fetchToken` step's request body config, not in Secrets Manager.
- No new "step kind"/"step type" enum. A token-fetch step is a `Step` row like any other; the orchestrator does not special-case it.
- `steps_scope[step.step_name]` becomes `{"transformed_body": ..., "response": ...}` (was: bare `transformed_body` dict). Every existing consumer of `steps_scope` (the `{{steps.name.field}}` path/query template resolver in `send.py`, and the `create_contract` test in `tests/test_orchestrator.py` asserting `create_contract["ProjectId"] is None`) must be updated for the new shape in the same task that changes it — do not leave the shape change and its consumers in separate commits.
- All DB schema changes go through a new Liquibase changelog file under `database/changelog/changes/`, following the existing numbering convention (see `009-seed-oracle-contract-pipeline.xml` referenced in `tests/test_transform.py`) — check the changelog directory for the next free number before naming the file.
- This plan only touches the `vaibhav1-DEMO-oracle-fusion-contracts` / `oracle-ewnj-test-creds-demo` target (the one wired to the local mock at `localhost:9010`) end-to-end. The other 4 targets (`AV-oracle-fusion`, `AV-sap`, `AV-oracle-fusion-contracts`, `AV-DEMO-oracle-fusion-contracts`) get the same per-target treatment but are **not** in scope for this plan — flagged as follow-up, not silently dropped.

---

## File Structure

- Modify `erp_transform/orchestrator.py` — `transform_pipeline()`'s per-step loop: store step response in `steps_scope`, alongside transformed_body.
- Modify `erp_transform/send.py` — `_render_template` applied to `step.headers` in addition to path/query; `execute_step` stops force-overwriting a header the templating already set; `StepResult`/`execute_step` return the parsed response body (already does — `response_body` field already exists, just needs to land in `steps_scope`).
- Modify `erp_transform/auth.py` — delete `_oauth2_client_credentials` and its `_DISPATCH` entry; add a `_none` handler + `_DISPATCH["none"]` entry returning an empty `Credential("", "")`.
- Modify `tests/test_orchestrator.py` — update the `steps_scope` shape assertion (`create_contract["ProjectId"] is None` becomes a `steps.lookup-project.response.ProjectId` style path, or equivalent given the new nested shape).
- Create `tests/test_send.py` — new unit tests for header templating and the no-op-credential-doesn't-clobber-templated-header behavior (no DB needed — `Step`/`Target` constructed in-memory like `tests/test_transform.py` does for `FieldMapping`).
- Create `tests/test_auth.py` — new unit tests for `_none` handler and the removal of `oauth2` from `_DISPATCH` (asserts `AuthError` on `auth_type="oauth2"`).
- Create `database/changelog/changes/0NN-token-fetch-step-demo-target.xml` (NN = next free number) — new `target` row (token endpoint, `auth_type=basic`), new `step` row (`fetchToken`), new `pipeline_step` row wiring it at seq 0 ahead of the existing resource-creation step, and an update to the resource-creation step's `headers` column to add the templated `Authorization` header. Also flips the existing `vaibhav1-DEMO-oracle-fusion-contracts` target's `auth_type` from `oauth2` to `none`.
- Update `oracle-ewnj-test-creds-demo` secret in LocalStack Secrets Manager (not a file — an `aws secretsmanager put-secret-value` call in Task 5) to the new `{"username", "password"}` shape.

## Global note on running tests

Unit tests (`tests/test_transform.py`-style, no DB) run with:
```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
source .venv/bin/activate
pytest tests/test_send.py tests/test_auth.py -v
```
Integration tests (`tests/test_orchestrator.py`, needs local Postgres + this plan's Liquibase changelog applied) run with:
```bash
pytest tests/test_orchestrator.py -v -m integration
```

---

### Task 1: `steps_scope` carries response body, not just transformed_body

**Files:**
- Modify: `erp_transform/orchestrator.py:82-129`
- Modify: `tests/test_orchestrator.py:60-69`

**Interfaces:**
- Produces: `steps_scope[step_name]` is now `{"transformed_body": dict, "response": Any}` (was: bare `dict` == transformed_body). `response` is `None` until/unless the step actually sends (`send_request=True` and no prior failure) and gets a response back; before that point (or for `send_request=False` runs) it stays `None`.
- Consumes: nothing new — `transform.transform_payload`, `send.execute_step`, `db.get_pipeline_steps` unchanged from current signatures.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_orchestrator.py` (replace the existing assertion block at the end of `test_multi_step_pipeline_runs_in_seq_order`):

```python
@skip_if_no_db
def test_multi_step_pipeline_runs_in_seq_order():
    source = {
        "contract": {"name": "Government Infrastructure Project"},
        "amount": 500000,
        "currency": "USD",
        "projectNumber": "P-2024-100",
    }
    result = transform_pipeline("award-to-oracle-contract-v1", source)

    assert result["pattern_id"] == "PAT-03"
    assert [s["seq"] for s in result["steps"]] == [1, 2]
    assert [s["step_name"] for s in result["steps"]] == ["lookup-project", "create-contract"]

    create_contract = result["steps"][1]["transformed_body"]
    assert create_contract["ContractName"] == "Government Infrastructure Project"
    assert create_contract["ContractAmount"] == 500000
    assert create_contract["CurrencyCode"] == "USD"
    # lookup-project has no field_mapping rows (it's a GET/extract step, not a
    # body-building step) -- without actually sending the GET, its
    # transformed_body is empty and downstream steps.lookup-project.response
    # is also None (send_request defaults True but lookup-project has no
    # mappings so transformed_body stays {}; its HTTP response, once sent,
    # would populate steps_scope["lookup-project"]["response"] instead).
    assert create_contract["ProjectId"] is None
```

(This test's assertions don't change — `create_contract["ProjectId"]` still resolves via `{{steps.lookup-project.ProjectId}}` in a `field_mapping.source_path`, which after this task must resolve against `steps_scope["lookup-project"]["transformed_body"]["ProjectId"]`, not the old bare-dict shape. That resolution logic lives in `transform.py`, not touched by this task — Task 1 only changes what `orchestrator.py` stores. Verify in Step 2 that this still passes; if `transform.py`'s source_path resolution reads `steps_scope[name]` as a flat dict today, this test will start failing after Task 1's change and that mismatch must be fixed as part of this task, not deferred.)

First, check whether `transform.py` reads `steps.<name>.<field>` against the old flat shape:

```bash
grep -n "steps" erp_transform/transform.py
```

If `transform.py` resolves dotted `source_path` generically (walks the dict by key, same as `_render_template` in `send.py`), then changing `steps_scope[name]` from `transformed_body` to `{"transformed_body": ..., "response": ...}` breaks every existing `source_path` like `steps.lookup-project.ProjectId` — they'd now need to be `steps.lookup-project.transformed_body.ProjectId`. Decide here: **do not silently change the path shape for existing consumers.** Instead, keep `steps_scope[step_name]` itself equal to `transformed_body` (unchanged, so `steps.lookup-project.ProjectId` keeps working), and store the response in a **sibling** key: `steps_scope[step_name + "$response"]` is NOT clean either.

Correct approach: make `steps_scope[step_name]` a dict that **merges** — keep all of `transformed_body`'s top-level keys directly under `step_name` (so old `source_path` values like `steps.lookup-project.ProjectId` are unaffected), and additionally nest the raw response under a reserved `_response` key: `steps_scope[step_name] = {**transformed_body, "_response": response_body}`. This is backward compatible for every existing `source_path`/`{{steps.x.y}}` usage, and the new `fetchToken` step's header template becomes `{{steps.fetchToken._response.access_token}}`.

Run to confirm current behavior first:
```bash
grep -n "steps" erp_transform/transform.py
```
Expected: shows the `source_path` resolution walks `scoped_source` (which nests `steps_scope` under `"steps"`) by splitting on `.` and doing dict `.get()` per segment — same mechanism as `_render_template`. Confirms the `_response`-sibling-key approach above is safe.

- [ ] **Step 2: Implement the `steps_scope` change**

In `erp_transform/orchestrator.py`, replace lines 100-129:

```python
        transformed_body = transform.transform_payload(scoped_source, mappings) if mappings else {}

        result = {
            "seq": ps.seq,
            "step_name": step.step_name,
            "target_name": target.target_name,
            "method": step.method,
            "transformed_body": transformed_body,
            "sent": False,
            "status_code": None,
            "response": None,
            "url": None,
        }

        response_body = None
        if send_request and failed_step is None:
            try:
                credential = auth.get_credential(target)
                step_result = send.execute_step(
                    step=step,
                    target=target,
                    credential=credential,
                    body=transformed_body,
                    source=source,
                    previous_steps=steps_scope,
                )
                result["sent"] = True
                result["status_code"] = step_result.status_code
                result["response"] = step_result.response_body
                result["url"] = step_result.request_url
                response_body = step_result.response_body

                if not (200 <= step_result.status_code < 300):
                    failed_step = step.step_name
                    error = (
                        f"target {target.target_name!r} returned "
                        f"{step_result.status_code} for step {step.step_name!r}"
                    )
            except auth.AuthError as e:
                failed_step = step.step_name
                error = f"auth failed for step {step.step_name!r}: {e}"
            except requests.RequestException as e:
                failed_step = step.step_name
                error = f"request to target {target.target_name!r} failed for step {step.step_name!r}: {e}"

        # steps_scope[step_name] keeps transformed_body's keys directly
        # accessible (so existing "steps.stepName.field" source_path/template
        # references are unaffected), and additionally exposes the raw HTTP
        # response under a reserved "_response" key for steps that need to
        # read a prior step's response (e.g. a token step's access_token)
        # rather than its outgoing request body.
        steps_scope[step.step_name] = {
            **transformed_body,
            "_response": response_body if isinstance(response_body, dict) else {"_raw": response_body},
        }

        step_results.append(result)
```

Note the `isinstance` guard: `response_body` may be a non-dict (e.g. plain text or a list) if the target doesn't return JSON-object — `_render_template`'s dict-walking `.get()` calls would break on a list/str, so non-dict responses get wrapped under `{"_raw": ...}` to keep the shape predictable.

- [ ] **Step 3: Run the integration test to verify it still passes**

Run: `pytest tests/test_orchestrator.py -v -m integration`
Expected: PASS (requires local Docker Postgres running — if unreachable, tests auto-skip via `skip_if_no_db`; that's fine for this task, full integration verification happens in Task 6 after the DB changelog is applied).

- [ ] **Step 4: Commit**

```bash
git add erp_transform/orchestrator.py tests/test_orchestrator.py
git commit -m "orchestrator: expose prior step's HTTP response via steps_scope._response"
```

---

### Task 2: Template header values, don't just path/query

**Files:**
- Modify: `erp_transform/send.py:54-97`
- Create: `tests/test_send.py`

**Interfaces:**
- Consumes: `Step`, `Target` from `erp_transform/db.py` (unchanged); `Credential` from `erp_transform/auth.py` (unchanged dataclass, but see Task 3 for a new empty-credential convention: `Credential(header_name="", header_value="")`).
- Produces: `execute_step(step, target, credential, body, source=None, previous_steps=None) -> StepResult` — same signature, but now (a) renders `{{...}}` templates inside `step.headers` values before sending, and (b) only applies `credential.header_name`/`header_value` onto the request if `credential.header_name` is non-empty (so a no-op credential doesn't clobber a header the templating already set).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_send.py`:

```python
"""
Unit tests for send.execute_step's header templating and credential
application -- no DB, no real HTTP (requests_mock stands in for the network).
"""
import pytest
import requests_mock

from erp_transform.auth import Credential
from erp_transform.db import Step, Target
from erp_transform.send import execute_step


def _target(**overrides):
    defaults = dict(
        target_id="t1",
        client_id="c1",
        target_name="Test Target",
        base_url="http://example.test",
        auth_type="none",
        credential_ref="unused",
        default_headers={},
    )
    defaults.update(overrides)
    return Target(**defaults)


def _step(**overrides):
    defaults = dict(
        step_pk=1,
        client_id="c1",
        target_id="t1",
        step_name="createThing",
        method="POST",
        path="/things",
        query_params=None,
        headers=None,
        extract=None,
        on_not_found="error",
        on_multiple_results="error",
        rollback_method=None,
        rollback_path=None,
    )
    defaults.update(overrides)
    return Step(**defaults)


def test_header_template_resolves_from_previous_step_response():
    step = _step(headers={"Authorization": "Bearer {{steps.fetchToken._response.access_token}}"})
    target = _target()
    credential = Credential(header_name="", header_value="")
    previous_steps = {"fetchToken": {"_response": {"access_token": "abc123"}}}

    with requests_mock.Mocker() as m:
        m.post("http://example.test/things", json={"ok": True})
        execute_step(step=step, target=target, credential=credential, body={}, previous_steps=previous_steps)

        sent_headers = m.request_history[0].headers
        assert sent_headers["Authorization"] == "Bearer abc123"


def test_empty_credential_does_not_overwrite_templated_header():
    step = _step(headers={"Authorization": "Bearer templated-token"})
    target = _target()
    credential = Credential(header_name="", header_value="")

    with requests_mock.Mocker() as m:
        m.post("http://example.test/things", json={"ok": True})
        execute_step(step=step, target=target, credential=credential, body={})

        sent_headers = m.request_history[0].headers
        assert sent_headers["Authorization"] == "Bearer templated-token"


def test_non_empty_credential_still_applies_when_no_header_conflict():
    step = _step(headers={"Content-Type": "application/json"})
    target = _target()
    credential = Credential(header_name="Authorization", header_value="Basic xyz")

    with requests_mock.Mocker() as m:
        m.post("http://example.test/things", json={"ok": True})
        execute_step(step=step, target=target, credential=credential, body={})

        sent_headers = m.request_history[0].headers
        assert sent_headers["Authorization"] == "Basic xyz"
        assert sent_headers["Content-Type"] == "application/json"


def test_missing_template_field_resolves_to_empty_string():
    step = _step(headers={"Authorization": "Bearer {{steps.fetchToken._response.access_token}}"})
    target = _target()
    credential = Credential(header_name="", header_value="")

    with requests_mock.Mocker() as m:
        m.post("http://example.test/things", json={"ok": True})
        execute_step(step=step, target=target, credential=credential, body={}, previous_steps={})

        sent_headers = m.request_history[0].headers
        assert sent_headers["Authorization"] == "Bearer "
```

- [ ] **Step 2: Install the test dependency and run to verify failure**

```bash
source .venv/bin/activate
pip install requests-mock==1.12.1
```

Add to `requirements-dev.txt`:
```bash
cat requirements-dev.txt
```
Then add `requests-mock==1.12.1` as a new line in that file (matches the file's existing one-line-per-dependency style).

Run: `pytest tests/test_send.py -v`
Expected: FAIL — `test_header_template_resolves_from_previous_step_response` and `test_missing_template_field_resolves_to_empty_string` fail because headers aren't templated yet; `test_empty_credential_does_not_overwrite_templated_header` fails because `credential.header_name=""` currently still gets force-set via `headers[credential.header_name] = credential.header_value`, writing `headers[""] = ""` instead of leaving `Authorization` alone — inspect the actual failure output to confirm this diagnosis before moving on.

- [ ] **Step 3: Implement templated headers + conditional credential application**

In `erp_transform/send.py`, replace lines 73-76:

```python
    headers = dict(target.default_headers or {})
    if step.headers:
        for key, value in step.headers.items():
            headers[key] = _render_template(str(value), source, previous_steps)
    if credential.header_name:
        headers[credential.header_name] = credential.header_value
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_send.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add erp_transform/send.py tests/test_send.py requirements-dev.txt
git commit -m "send: template step.headers values, skip credential apply when header_name is empty"
```

---

### Task 3: `auth.py` — remove oauth2, add no-op `none` auth_type

**Files:**
- Modify: `erp_transform/auth.py:60-109`
- Create: `tests/test_auth.py`

**Interfaces:**
- Produces: `get_credential(target: Target) -> Credential` — same signature. `_DISPATCH` now has keys `{"none", "basic", "apikey"}` (was `{"oauth2", "basic", "apikey"}`). `auth_type="none"` returns `Credential(header_name="", header_value="")` without any Secrets Manager call.
- Consumes: `Target` from `db.py` (unchanged), `_get_secret` (unchanged, still used by `basic`/`apikey`).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth.py`:

```python
"""
Unit tests for auth.get_credential's dispatch -- no DB, no real Secrets
Manager call for the 'none' path; basic/apikey paths are exercised in
test_db_integration.py-style tests against LocalStack, not here.
"""
import pytest

from erp_transform.auth import AuthError, Credential, get_credential
from erp_transform.db import Target


def _target(**overrides):
    defaults = dict(
        target_id="t1",
        client_id="c1",
        target_name="Test Target",
        base_url="http://example.test",
        auth_type="none",
        credential_ref="unused",
        default_headers={},
    )
    defaults.update(overrides)
    return Target(**defaults)


def test_none_auth_type_returns_empty_credential():
    result = get_credential(_target(auth_type="none"))
    assert result == Credential(header_name="", header_value="")


def test_oauth2_auth_type_is_no_longer_supported():
    with pytest.raises(AuthError, match="unsupported auth_type 'oauth2'"):
        get_credential(_target(auth_type="oauth2"))
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_auth.py -v`
Expected: FAIL — `test_none_auth_type_returns_empty_credential` fails with `AuthError: unsupported auth_type 'none'` (no `none` handler yet); `test_oauth2_auth_type_is_no_longer_supported` currently PASSES-by-accident-for-the-wrong-reason only if oauth2 already fails for missing secrets, so verify its current failure mode before Step 3 — run:
```bash
pytest tests/test_auth.py::test_oauth2_auth_type_is_no_longer_supported -v
```
Expected right now: PASS or FAIL depending on whether `oracle-ewnj-test-creds-demo`-style secrets resolve — the point of this task is to make it pass because `oauth2` is gone from `_DISPATCH`, not because a downstream call happened to fail. Confirm this by checking the dispatch table directly:
```bash
python3 -c "from erp_transform.auth import _DISPATCH; print(list(_DISPATCH.keys()))"
```
Expected before this task: `['oauth2', 'basic', 'apikey']`.

- [ ] **Step 3: Implement**

In `erp_transform/auth.py`, replace lines 60-102 (delete `_oauth2_client_credentials` entirely, add `_none`):

```python
def _none(target: Target) -> Credential:
    """No credential resolution -- used by targets whose auth header is
    supplied entirely by templated step.headers (see send.py), e.g. a
    resource-creation step whose Authorization header is
    '{{steps.fetchToken._response.access_token}}' rather than something
    this module fetches itself."""
    return Credential(header_name="", header_value="")


def _basic_auth(target: Target) -> Credential:
    secret = _get_secret(target.credential_ref)
    import base64
    token = base64.b64encode(
        f"{secret['username']}:{secret['password']}".encode()
    ).decode()
    return Credential(header_name="Authorization", header_value=f"Basic {token}")


def _api_key(target: Target) -> Credential:
    secret = _get_secret(target.credential_ref)
    header_name = secret.get("headerName", "X-API-Key")
    return Credential(header_name=header_name, header_value=secret["apiKey"])


_DISPATCH = {
    "none": _none,
    "basic": _basic_auth,
    "apikey": _api_key,
}
```

Also remove the now-unused `requests` import (only `_oauth2_client_credentials` used it) and `get_http_timeout_seconds` import if nothing else in the file uses it:
```bash
grep -n "requests\.\|get_http_timeout_seconds" erp_transform/auth.py
```
If both come back empty after the deletion, remove their imports from the top of the file (lines 18, 20).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_auth.py -v`
Expected: PASS (2 passed)

Also re-run Task 2's tests to confirm nothing regressed:
Run: `pytest tests/test_send.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add erp_transform/auth.py tests/test_auth.py
git commit -m "auth: remove oauth2 dispatch, add none auth_type for templated-header steps"
```

---

### Task 4: LocalStack secret — reshape to Basic-auth form

**Files:**
- No repo files modified — this task updates the running LocalStack Secrets Manager instance only (state, not code).

**Interfaces:**
- Consumes: `oracle-ewnj-test-creds-demo` secret name (referenced by the new token-endpoint `target` row created in Task 5).
- Produces: secret value `{"username": "placeholder-client-id", "password": "placeholder-client-secret"}` — matches `_basic_auth`'s expected shape exactly (Task 3, unchanged code).

- [ ] **Step 1: Confirm LocalStack is up and the secret currently holds the old oauth2 shape**

```bash
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value \
  --secret-id oracle-ewnj-test-creds-demo --region us-east-1 --query SecretString --output text
```
Expected: `{"tokenUrl":"http://localhost:9010/oauth2/v1/token","clientId":"placeholder-client-id","clientSecret":"placeholder-client-secret","scope":"placeholder-scope"}` (the value set in the earlier session).

- [ ] **Step 2: Overwrite with the new Basic-auth shape**

```bash
aws --endpoint-url=http://localhost:4566 secretsmanager put-secret-value \
  --secret-id oracle-ewnj-test-creds-demo \
  --secret-string '{"username":"placeholder-client-id","password":"placeholder-client-secret"}' \
  --region us-east-1
```
Expected: JSON output with `"Name": "oracle-ewnj-test-creds-demo"` and a new `VersionId`.

- [ ] **Step 3: Verify**

```bash
aws --endpoint-url=http://localhost:4566 secretsmanager get-secret-value \
  --secret-id oracle-ewnj-test-creds-demo --region us-east-1 --query SecretString --output text
```
Expected: `{"username":"placeholder-client-id","password":"placeholder-client-secret"}`

No commit — this task changes no files (LocalStack is local runtime state, not version-controlled; note this explicitly in the PR description when this branch lands, since a teammate re-running `localstack start` fresh needs to redo Task 4 or you need a seed script — flagged as a follow-up, out of scope for this plan since it also applies to whatever seeded the secret originally).

---

### Task 5: DB changelog — fetchToken step + none-auth flip for the demo target

**Files:**
- Look up next free changelog number: `ls database/changelog/changes/ | sort` — the plan assumes the next number is `0NN`; substitute the actual next integer when creating the file.
- Create: `database/changelog/changes/0NN-token-fetch-step-demo-target.xml`
- Modify: whatever master/include changelog file references the changes directory (check `database/changelog/changelog-master.xml` or equivalent — find it):
```bash
find database/changelog -maxdepth 1 -iname "*master*" -o -iname "*changelog*.xml" | grep -v changes/
```

**Interfaces:**
- Produces: new `target` row `target_id='vaibhav1-DEMO-token'` (`auth_type='basic'`, `base_url='http://localhost:9010'`, `credential_ref='oracle-ewnj-test-creds-demo'`); new `step` row `step_name='fetchToken'` (method POST, path `/oauth2/v1/token`, target `vaibhav1-DEMO-token`); a new `pipeline_step` row wiring `fetchToken` at `seq=0` into whatever `pipeline_id` currently runs `vaibhav1-DEMO-oracle-fusion-contracts`'s resource-creation step at seq 0 (bumping the existing step to seq 1 if needed — check current seq values first); update to the existing resource-creation `step` row's `headers` column adding `{"Authorization": "Bearer {{steps.fetchToken._response.access_token}}"}`; and an `auth_type` flip on `vaibhav1-DEMO-oracle-fusion-contracts` target from `oauth2` to `none`.
- Consumes: existing Liquibase changelog conventions from `009-seed-oracle-contract-pipeline.xml` — read it first to match column names, XML structure, and ID-tag conventions exactly:
```bash
cat database/changelog/changes/009-seed-oracle-contract-pipeline.xml
```

- [ ] **Step 1: Find current pipeline/step wiring for the demo target**

```bash
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
source .venv/bin/activate
set -a; source .env; set +a
python3 -c "
import psycopg2, os
conn = psycopg2.connect(host=os.environ['DB_HOST'], port=os.environ['DB_PORT'], dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'])
cur = conn.cursor()
cur.execute('''
    SELECT ps.pipeline_id, ps.seq, s.step_pk, s.step_name, s.target_id, s.headers
    FROM pipeline_step ps JOIN step s ON s.step_pk = ps.step_pk
    WHERE s.target_id = %s
''', ('vaibhav1-DEMO-oracle-fusion-contracts',))
for row in cur.fetchall():
    print(row)
"
```
Record the output: `pipeline_id`, current `seq`, `step_pk`, `step_name`, existing `headers` value for the resource-creation step. This plan's XML in Step 2 needs these exact values — do not proceed with placeholder IDs.

- [ ] **Step 2: Read the existing seed changelog for structure/conventions**

```bash
cat database/changelog/changes/009-seed-oracle-contract-pipeline.xml
ls database/changelog/changes/ | sort
find database/changelog -maxdepth 1 -iname "*master*"
```

- [ ] **Step 3: Write the new changelog file**

Using the exact `<changeSet>`/`<insert>`/`<update>` XML structure found in Step 2, and the exact `pipeline_id`/`step_pk`/`seq`/`headers` values recorded in Step 1, create `database/changelog/changes/0NN-token-fetch-step-demo-target.xml` containing, in this order:

1. An `<insert>` into `target` for `vaibhav1-DEMO-token` (`auth_type='basic'`, `base_url='http://localhost:9010'`, `credential_ref='oracle-ewnj-test-creds-demo'`, `client_id` matching the existing demo target's `client_id`).
2. An `<insert>` into `step` for `fetchToken` (`method='POST'`, `path='/oauth2/v1/token'`, `target_id='vaibhav1-DEMO-token'`, request body config for `grant_type=client_credentials&scope=placeholder-scope` — match whatever column/format the existing steps use for POST bodies; if there's no body-template column and bodies come only from `field_mapping`, add a `field_mapping` row producing that literal body instead of a step-level body column — check `Step` dataclass fields (`erp_transform/db.py:28-41`) for what's actually settable at the step level before assuming a body column exists).
3. An `<insert>` into `pipeline_step` wiring `fetchToken` at `seq=0` for the `pipeline_id` recorded in Step 1.
4. An `<update>` on the `pipeline_step` row for the existing resource-creation step, bumping its `seq` by 1 if it was previously `0` (skip if it was already `1` or higher and `0` is free).
5. An `<update>` on the resource-creation `step` row's `headers` column, merging in `{"Authorization": "Bearer {{steps.fetchToken._response.access_token}}"}` alongside whatever headers already exist there (from Step 1's recorded value — do not clobber existing headers).
6. An `<update>` on the `vaibhav1-DEMO-oracle-fusion-contracts` target row setting `auth_type='none'` (was `'oauth2'`).

- [ ] **Step 4: Register the new changelog file in the master changelog**

Add an `<include file="changes/0NN-token-fetch-step-demo-target.xml"/>` line to whatever master changelog file Step 2's `find` located, following its existing ordering/style.

- [ ] **Step 5: Apply the changelog**

Find how migrations are normally run in this repo:
```bash
grep -rn "liquibase" README.md cli.py 2>/dev/null
```
Run whatever command that turns up (likely a `liquibase update` invocation, possibly wrapped in `cli.py`). Expected: changelog applies with no errors, new changeset marked as run in `databasechangelog` table.

- [ ] **Step 6: Verify the new rows**

```bash
python3 -c "
import psycopg2, os
from dotenv import load_dotenv
load_dotenv()
conn = psycopg2.connect(host=os.environ['DB_HOST'], port=os.environ['DB_PORT'], dbname=os.environ['DB_NAME'], user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'])
cur = conn.cursor()
cur.execute('select target_id, auth_type, base_url, credential_ref from target where target_id in (%s, %s)', ('vaibhav1-DEMO-token', 'vaibhav1-DEMO-oracle-fusion-contracts'))
for row in cur.fetchall(): print(row)
cur.execute(\"select step_name, method, path, target_id, headers from step where step_name = 'fetchToken'\")
for row in cur.fetchall(): print(row)
"
```
Expected: `vaibhav1-DEMO-token` row with `auth_type='basic'`; `vaibhav1-DEMO-oracle-fusion-contracts` row with `auth_type='none'`; `fetchToken` step row present with correct `target_id`.

- [ ] **Step 7: Commit**

```bash
git add database/changelog/changes/0NN-token-fetch-step-demo-target.xml database/changelog/changelog-master.xml
git commit -m "db: add fetchToken step + none-auth flip for local Oracle Fusion demo target"
```

(Substitute the actual master changelog filename found in Task 5 Step 2 if it differs from `changelog-master.xml`.)

---

### Task 6: End-to-end verification against the mock service

**Files:** none modified — this task runs the real pipeline against `mock-oracle-fusion/app.py` (already running per earlier session on port 9010) and the local Postgres, confirming the whole chain works.

**Interfaces:** none new — exercises `transform_pipeline()` as an external caller would.

- [ ] **Step 1: Confirm the mock service and LocalStack are both running**

```bash
curl -s http://127.0.0.1:9010/ | head -c 200
curl -s http://localhost:4566/_localstack/health | head -c 200
```
Expected: both return valid JSON (mock's resource list; LocalStack's health payload). If either is down, restart per the earlier session (`python3 app.py` in `mock-oracle-fusion/`; `localstack start -d`).

- [ ] **Step 2: Restart the transformation svc so it picks up the new `.env` (AWS_ENDPOINT_URL etc.) and code changes**

```bash
ps aux | grep "app:app" | grep -v grep
```
Find the PID bound to `transformation-svc` (cwd check, as done earlier: `lsof -p <pid> | grep cwd`), then:
```bash
kill <pid>
cd /Users/sherinmathew/repo/erp-integration/transformation-svc
source .venv/bin/activate
set -a; source .env; set +a
nohup uvicorn app:app --reload --port 8000 > /tmp/transformation-svc.log 2>&1 &
sleep 1
curl -s http://localhost:8000/ | head -c 200
```

- [ ] **Step 3: Run the pipeline for the demo target's pipeline_id end-to-end**

Find the exact `pipeline_id` (recorded in Task 5 Step 1) and invoke it the same way `tests/test_orchestrator.py` does, but live:
```bash
python3 -c "
from erp_transform.orchestrator import transform_pipeline
result = transform_pipeline('<pipeline_id from Task 5 Step 1>', {
    'orgId': 300000019976011,
    'contractNumber': 'E2E-TEST-1',
    'legalEntityName': 'Test Corp',
    'startDate': '2026-07-12',
    'headerAttributes': {},
    'parties': [{'partyRoleCode': 'CUSTOMER', 'role': 'Customer', 'partyName': 'Test Buyer'}],
    'lines': [{'itemName': 'ITEM-1', 'lineAttributes': {}}],
})
import json
print(json.dumps(result, indent=2))
"
```

Expected:
- `result["steps"][0]["step_name"] == "fetchToken"`, `status_code == 200`, response body contains `"access_token": "sample-bearer-token"` (from the mock's `/oauth2/v1/token` handler).
- `result["steps"][1]["step_name"]` == the resource-creation step name, `status_code == 201`.
- Check the mock's request log (`/tmp/mock-oracle-fusion.log` from the earlier session, or wherever it's logging) to confirm the resource-creation request actually carried `Authorization: Bearer sample-bearer-token`:
```bash
tail -50 /tmp/mock-oracle-fusion.log | grep -A5 "Authorization"
```
Expected: shows `"Authorization": "Bearer sample-bearer-token"` in the logged headers for the second request.
- `result["failed_step"] is None` and `result["error"] is None`.

If any of the above don't match, this is the point to debug — do not proceed to Step 4 until the live chain works.

- [ ] **Step 4: Run the full existing test suite once more to confirm no regressions**

```bash
pytest tests/ -v
```
Expected: all tests pass (integration tests included, since Postgres is confirmed up from Step 1-3).

- [ ] **Step 5: No commit** — this task is pure verification, produces no file changes. If Step 3 uncovers a bug, fix it in the relevant Task's files and amend that task's commit description in your PR summary, don't create a throwaway "fix" commit here.

---

## Explicitly Out of Scope (flagged, not silently dropped)

- The other 4 targets (`AV-oracle-fusion`, `AV-sap`, `AV-oracle-fusion-contracts`, `AV-DEMO-oracle-fusion-contracts`) still have `auth_type='oauth2'` in the DB after this plan — since Task 3 deletes the `oauth2` dispatch entry entirely, **any pipeline touching those 4 targets will start raising `AuthError: unsupported auth_type 'oauth2'` the moment this branch lands**, until each gets its own Task-5-style changelog (own `fetchToken` step + `none` flip). This is a breaking change for those targets and must be called out prominently in the PR description; do not merge without either (a) doing the same migration for all 5 targets in this same plan, or (b) confirming with whoever owns those other 4 pipelines that they're not live/in-use yet.
- No seed script for re-creating the LocalStack secret (Task 4) after a `localstack start` from a clean state — anyone starting fresh needs to redo Task 4's `put-secret-value` call by hand.
