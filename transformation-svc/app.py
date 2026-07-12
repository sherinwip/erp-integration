#!/usr/bin/env python3
"""
Minimal local-only HTTP wrapper around the orchestrator, so it can be
exercised from Postman/curl exactly like the SQL RPC endpoint
(documentation/postman) already is -- gives a real request/response loop to
test against while this is still a local FastAPI app, and roughly mirrors the
shape an API Gateway + Lambda front door would have later (one route per
stage).

/transform-pipeline sends every attached step's request for real (via
erp_transform.orchestrator.run_pipeline) and persists a pipeline_run audit
trail; /transform is the dry-run, no-HTTP, single-step debugging route.

Run:
    uvicorn app:app --reload --port 8000
    (or: python app.py)
Then POST to http://localhost:8000/transform-pipeline (pipeline_id -- what a
real caller like CRM/Salesforce actually knows) or
http://localhost:8000/transform (step_pk -- kept for direct step debugging,
transform-only, no HTTP call, no DB writes beyond reads).

FastAPI over Flask here specifically because this is meant to evolve toward
Step Functions/Lambda: request/response validation is declarative (Pydantic
models below replace what was manual isinstance() checking in the Flask
version), an OpenAPI/Swagger UI is generated for free at /docs, and the
async-native request handling plus Mangum-style ASGI adapters are the
standard path onto Lambda when this stops being a local Flask/uvicorn app.

This app is local-dev only -- not what ships to Step Functions. It exists
so Postman has something to hit; the actual portable logic lives in
erp_transform/.
"""
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from erp_transform.orchestrator import run_pipeline, transform_only

app = FastAPI(
    title="transformation-svc (local dev)",
    description=(
        "Local-only wrapper around erp_transform.orchestrator. "
        "/transform-pipeline sends real HTTP requests to client targets and "
        "audits the run; /transform is a dry-run, single-step debugging route."
    ),
)


class TransformPipelineRequest(BaseModel):
    pipeline_id: str = Field(..., min_length=1)
    source: dict[str, Any]


class TransformStepRequest(BaseModel):
    step_pk: int
    source: dict[str, Any]


class StepResult(BaseModel):
    seq: int
    step_name: str
    target_name: str
    method: str
    transformed_body: dict[str, Any]


class RunStepResult(BaseModel):
    seq: int
    step_name: str
    status_code: Optional[int]
    response_body: Any


class TransformPipelineResponse(BaseModel):
    pipeline_id: str
    run_id: str
    status: str
    steps: list[RunStepResult]


class HealthResponse(BaseModel):
    status: str


@app.post("/transform-pipeline", response_model=TransformPipelineResponse)
def transform_pipeline_route(body: TransformPipelineRequest):
    """Primary entry point: caller supplies pipeline_id (the identifier a CRM
    actually has, per pipeline-routing-config-db-requirements.md §2-3), not
    an internal step_pk. Sends every attached step's request for real, in seq
    order, and persists a pipeline_run/pipeline_run_extract audit trail."""
    try:
        return run_pipeline(body.pipeline_id, body.source)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"transform failed: {e}")


@app.post("/transform")
def transform_route(body: TransformStepRequest):
    """Step-level debugging entry point (step_pk, not pipeline_id). Prefer
    /transform-pipeline for real callers."""
    try:
        return transform_only(body.step_pk, body.source)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"transform failed: {e}")


@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
