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
