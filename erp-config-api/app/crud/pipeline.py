from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationError
from app.models import Pipeline
from app.schemas.pipeline import PipelineCreate, PipelineUpdate, SUPPORTED_PATTERNS
from .base import CRUDBase
from .client import crud_client

crud_pipeline = CRUDBase(Pipeline, "Pipeline")


def _validate_pattern(pattern_id: str) -> None:
    if pattern_id not in SUPPORTED_PATTERNS:
        raise ValidationError(
            f"PatternNotSupported: pattern '{pattern_id}' is not supported "
            "(PAT-04 and PAT-09 are explicitly excluded per FR-CLM-004)"
        )


def list_pipelines_for_client(db: Session, client_id: str, skip: int = 0, limit: int = 100):
    return (
        db.query(Pipeline)
        .filter(Pipeline.client_id == client_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_pipeline(db: Session, payload: PipelineCreate) -> Pipeline:
    crud_client.get(db, payload.client_id)  # 404 if client doesn't exist
    _validate_pattern(payload.pattern_id)

    if crud_pipeline.get_optional(db, payload.pipeline_id) is not None:
        raise ConflictError(f"Pipeline '{payload.pipeline_id}' already exists")

    obj = Pipeline(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_pipeline(db: Session, pipeline_id: str, payload: PipelineUpdate) -> Pipeline:
    obj = crud_pipeline.get(db, pipeline_id)
    updates = payload.model_dump(exclude_unset=True)

    if "pattern_id" in updates:
        _validate_pattern(updates["pattern_id"])

    for field, value in updates.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
