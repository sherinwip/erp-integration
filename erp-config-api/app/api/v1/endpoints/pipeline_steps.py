from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.pipeline_step import (
    crud_pipeline_step, create_pipeline_step, update_pipeline_step,
)
from app.schemas.pipeline_step import (
    PipelineStepCreate, PipelineStepRead, PipelineStepUpdate,
)

router = APIRouter(prefix="/pipeline-steps", tags=["pipeline-steps"])


@router.post("", response_model=PipelineStepRead, status_code=status.HTTP_201_CREATED)
def attach_step_to_pipeline(payload: PipelineStepCreate, db: Session = Depends(get_db)):
    return create_pipeline_step(db, payload)


@router.get("/{pipeline_step_pk}", response_model=PipelineStepRead)
def get_pipeline_step(pipeline_step_pk: int, db: Session = Depends(get_db)):
    return crud_pipeline_step.get(db, pipeline_step_pk)


@router.patch("/{pipeline_step_pk}", response_model=PipelineStepRead)
def update_pipeline_step_endpoint(
    pipeline_step_pk: int, payload: PipelineStepUpdate, db: Session = Depends(get_db)
):
    return update_pipeline_step(db, pipeline_step_pk, payload)


@router.delete("/{pipeline_step_pk}", status_code=status.HTTP_204_NO_CONTENT)
def detach_step_from_pipeline(pipeline_step_pk: int, db: Session = Depends(get_db)):
    crud_pipeline_step.delete(db, pipeline_step_pk)
