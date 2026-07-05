from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.step import crud_step, create_step, update_step, list_steps_for_client
from app.schemas.step import StepCreate, StepRead, StepUpdate

router = APIRouter(prefix="/steps", tags=["steps"])


@router.get("", response_model=List[StepRead])
def list_steps(
    client_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if client_id is not None:
        return list_steps_for_client(db, client_id, skip=skip, limit=limit)
    return crud_step.list(db, skip=skip, limit=limit)


@router.post("", response_model=StepRead, status_code=status.HTTP_201_CREATED)
def create_step_endpoint(payload: StepCreate, db: Session = Depends(get_db)):
    return create_step(db, payload)


@router.get("/{step_pk}", response_model=StepRead)
def get_step(step_pk: int, db: Session = Depends(get_db)):
    return crud_step.get(db, step_pk)


@router.patch("/{step_pk}", response_model=StepRead)
def update_step_endpoint(step_pk: int, payload: StepUpdate, db: Session = Depends(get_db)):
    return update_step(db, step_pk, payload)


@router.delete("/{step_pk}", status_code=status.HTTP_204_NO_CONTENT)
def delete_step(step_pk: int, db: Session = Depends(get_db)):
    crud_step.delete(db, step_pk)
