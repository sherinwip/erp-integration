from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models import FieldMapping, Step
from app.schemas.field_mapping import FieldMappingCreate, FieldMappingUpdate
from .base import CRUDBase

crud_field_mapping = CRUDBase(FieldMapping, "FieldMapping")


def list_mappings_for_step(db: Session, step_pk: int):
    return (
        db.query(FieldMapping)
        .filter(FieldMapping.step_pk == step_pk)
        .order_by(FieldMapping.array_target_path, FieldMapping.sort_order)
        .all()
    )


def create_field_mapping(db: Session, payload: FieldMappingCreate) -> FieldMapping:
    step = db.query(Step).filter(Step.step_pk == payload.step_pk).first()
    if step is None:
        raise NotFoundError(f"Step '{payload.step_pk}' not found")

    existing = (
        db.query(FieldMapping)
        .filter(
            FieldMapping.step_pk == payload.step_pk,
            FieldMapping.array_target_path == payload.array_target_path,
            FieldMapping.target_path == payload.target_path,
        )
        .first()
    )
    if existing is not None:
        raise ConflictError(
            f"target_path '{payload.target_path}' already mapped for step {payload.step_pk} "
            f"in array '{payload.array_target_path or '(scalar)'}'"
        )

    obj = FieldMapping(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_field_mapping(
    db: Session, mapping_pk: int, payload: FieldMappingUpdate
) -> FieldMapping:
    obj = crud_field_mapping.get(db, mapping_pk)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
