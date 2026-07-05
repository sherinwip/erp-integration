from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationError
from app.models import Step, Target
from app.schemas.step import StepCreate, StepUpdate
from .base import CRUDBase
from .client import crud_client

crud_step = CRUDBase(Step, "Step")


def list_steps_for_client(db: Session, client_id: str, skip: int = 0, limit: int = 100):
    return (
        db.query(Step)
        .filter(Step.client_id == client_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_step(db: Session, payload: StepCreate) -> Step:
    crud_client.get(db, payload.client_id)  # 404 if client doesn't exist

    target = db.query(Target).filter(Target.target_id == payload.target_id).first()
    if target is None:
        raise ValidationError(f"Target '{payload.target_id}' not found")
    if target.client_id != payload.client_id:
        raise ValidationError(
            f"Target '{payload.target_id}' belongs to client '{target.client_id}', "
            f"not '{payload.client_id}' (FR-CFM-003b / FR-DBS-007rev)"
        )

    existing = (
        db.query(Step)
        .filter(Step.client_id == payload.client_id, Step.step_name == payload.step_name)
        .first()
    )
    if existing is not None:
        raise ConflictError(
            f"Step name '{payload.step_name}' already exists for client '{payload.client_id}'"
        )

    obj = Step(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_step(db: Session, step_pk: int, payload: StepUpdate) -> Step:
    obj = crud_step.get(db, step_pk)
    updates = payload.model_dump(exclude_unset=True)

    if "target_id" in updates:
        target = db.query(Target).filter(Target.target_id == updates["target_id"]).first()
        if target is None:
            raise ValidationError(f"Target '{updates['target_id']}' not found")
        if target.client_id != obj.client_id:
            raise ValidationError(
                f"Target '{updates['target_id']}' belongs to client '{target.client_id}', "
                f"not '{obj.client_id}'"
            )

    for field, value in updates.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
