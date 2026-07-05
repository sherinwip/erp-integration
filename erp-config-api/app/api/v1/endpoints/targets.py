from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.target import crud_target, create_target, update_target, list_targets_for_client
from app.schemas.target import TargetCreate, TargetRead, TargetUpdate

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("", response_model=List[TargetRead])
def list_targets(
    client_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if client_id is not None:
        return list_targets_for_client(db, client_id, skip=skip, limit=limit)
    return crud_target.list(db, skip=skip, limit=limit)


@router.post("", response_model=TargetRead, status_code=status.HTTP_201_CREATED)
def create_target_endpoint(payload: TargetCreate, db: Session = Depends(get_db)):
    return create_target(db, payload)


@router.get("/{target_id}", response_model=TargetRead)
def get_target(target_id: str, db: Session = Depends(get_db)):
    return crud_target.get(db, target_id)


@router.patch("/{target_id}", response_model=TargetRead)
def update_target_endpoint(target_id: str, payload: TargetUpdate, db: Session = Depends(get_db)):
    return update_target(db, target_id, payload)


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(target_id: str, db: Session = Depends(get_db)):
    crud_target.delete(db, target_id)
