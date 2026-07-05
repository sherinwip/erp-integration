from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import PipelineStep, Pipeline, Step
from app.schemas.pipeline_step import PipelineStepCreate, PipelineStepUpdate
from .base import CRUDBase

crud_pipeline_step = CRUDBase(PipelineStep, "PipelineStep")


def list_steps_for_pipeline(db: Session, pipeline_id: str):
    return (
        db.query(PipelineStep)
        .filter(PipelineStep.pipeline_id == pipeline_id)
        .order_by(PipelineStep.seq)
        .all()
    )


def create_pipeline_step(db: Session, payload: PipelineStepCreate) -> PipelineStep:
    pipeline = db.query(Pipeline).filter(Pipeline.pipeline_id == payload.pipeline_id).first()
    if pipeline is None:
        raise NotFoundError(f"Pipeline '{payload.pipeline_id}' not found")

    step = db.query(Step).filter(Step.step_pk == payload.step_pk).first()
    if step is None:
        raise NotFoundError(f"Step '{payload.step_pk}' not found")

    if step.client_id != pipeline.client_id:
        raise ValidationError(
            f"Step {payload.step_pk} belongs to client '{step.client_id}', "
            f"pipeline '{payload.pipeline_id}' belongs to client '{pipeline.client_id}' "
            "(FR-DBS-007rev: attachment requires matching client)"
        )

    existing = (
        db.query(PipelineStep)
        .filter(
            PipelineStep.pipeline_id == payload.pipeline_id,
            PipelineStep.step_pk == payload.step_pk,
        )
        .first()
    )
    if existing is not None:
        raise ConflictError(
            f"Step {payload.step_pk} is already attached to pipeline '{payload.pipeline_id}' "
            "(FR-CFM-004: a pipeline may attach a given step at most once)"
        )

    seq_taken = (
        db.query(PipelineStep)
        .filter(
            PipelineStep.pipeline_id == payload.pipeline_id,
            PipelineStep.seq == payload.seq,
        )
        .first()
    )
    if seq_taken is not None:
        raise ConflictError(
            f"Sequence {payload.seq} is already used in pipeline '{payload.pipeline_id}'"
        )

    obj = PipelineStep(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_pipeline_step(
    db: Session, pipeline_step_pk: int, payload: PipelineStepUpdate
) -> PipelineStep:
    obj = crud_pipeline_step.get(db, pipeline_step_pk)
    updates = payload.model_dump(exclude_unset=True)

    if "seq" in updates:
        seq_taken = (
            db.query(PipelineStep)
            .filter(
                PipelineStep.pipeline_id == obj.pipeline_id,
                PipelineStep.seq == updates["seq"],
                PipelineStep.pipeline_step_pk != pipeline_step_pk,
            )
            .first()
        )
        if seq_taken is not None:
            raise ConflictError(
                f"Sequence {updates['seq']} is already used in pipeline '{obj.pipeline_id}'"
            )

    for field, value in updates.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
