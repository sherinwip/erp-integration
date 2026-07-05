from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationError
from app.models import Target
from app.schemas.target import TargetCreate, TargetUpdate
from .base import CRUDBase
from .client import crud_client

crud_target = CRUDBase(Target, "Target")


def list_targets_for_client(db: Session, client_id: str, skip: int = 0, limit: int = 100):
    return (
        db.query(Target)
        .filter(Target.client_id == client_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_target(db: Session, payload: TargetCreate) -> Target:
    crud_client.get(db, payload.client_id)  # 404 if client doesn't exist

    if crud_target.get_optional(db, payload.target_id) is not None:
        raise ConflictError(f"Target '{payload.target_id}' already exists")

    existing = (
        db.query(Target)
        .filter(Target.client_id == payload.client_id, Target.target_name == payload.target_name)
        .first()
    )
    if existing is not None:
        raise ConflictError(
            f"Target name '{payload.target_name}' already exists for client '{payload.client_id}'"
        )

    obj = Target(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_target(db: Session, target_id: str, payload: TargetUpdate) -> Target:
    obj = crud_target.get(db, target_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
