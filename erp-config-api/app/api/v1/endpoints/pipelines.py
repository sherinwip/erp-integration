from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.pipeline import (
    crud_pipeline, create_pipeline, update_pipeline, list_pipelines_for_client,
)
from app.crud.pipeline_step import list_steps_for_pipeline
from app.schemas.pipeline import PipelineCreate, PipelineRead, PipelineUpdate
from app.schemas.pipeline_step import PipelineStepRead

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("", response_model=List[PipelineRead])
def list_pipelines(
    client_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if client_id is not None:
        return list_pipelines_for_client(db, client_id, skip=skip, limit=limit)
    return crud_pipeline.list(db, skip=skip, limit=limit)


@router.post("", response_model=PipelineRead, status_code=status.HTTP_201_CREATED)
def create_pipeline_endpoint(payload: PipelineCreate, db: Session = Depends(get_db)):
    return create_pipeline(db, payload)


@router.get("/{pipeline_id}", response_model=PipelineRead)
def get_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    return crud_pipeline.get(db, pipeline_id)


@router.patch("/{pipeline_id}", response_model=PipelineRead)
def update_pipeline_endpoint(
    pipeline_id: str, payload: PipelineUpdate, db: Session = Depends(get_db)
):
    return update_pipeline(db, pipeline_id, payload)


@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pipeline(pipeline_id: str, db: Session = Depends(get_db)):
    crud_pipeline.delete(db, pipeline_id)


@router.get("/{pipeline_id}/steps", response_model=List[PipelineStepRead])
def get_pipeline_steps(pipeline_id: str, db: Session = Depends(get_db)):
    crud_pipeline.get(db, pipeline_id)  # 404 if pipeline doesn't exist
    return list_steps_for_pipeline(db, pipeline_id)
