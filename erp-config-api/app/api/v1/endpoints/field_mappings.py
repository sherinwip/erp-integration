from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.field_mapping import (
    crud_field_mapping, create_field_mapping, update_field_mapping, list_mappings_for_step,
)
from app.schemas.field_mapping import (
    FieldMappingCreate, FieldMappingRead, FieldMappingUpdate,
)

router = APIRouter(prefix="/field-mappings", tags=["field-mappings"])


@router.get("", response_model=List[FieldMappingRead])
def list_field_mappings(
    step_pk: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if step_pk is not None:
        return list_mappings_for_step(db, step_pk)
    return crud_field_mapping.list(db, skip=skip, limit=limit)


@router.post("", response_model=FieldMappingRead, status_code=status.HTTP_201_CREATED)
def create_field_mapping_endpoint(payload: FieldMappingCreate, db: Session = Depends(get_db)):
    return create_field_mapping(db, payload)


@router.get("/{mapping_pk}", response_model=FieldMappingRead)
def get_field_mapping(mapping_pk: int, db: Session = Depends(get_db)):
    return crud_field_mapping.get(db, mapping_pk)


@router.patch("/{mapping_pk}", response_model=FieldMappingRead)
def update_field_mapping_endpoint(
    mapping_pk: int, payload: FieldMappingUpdate, db: Session = Depends(get_db)
):
    return update_field_mapping(db, mapping_pk, payload)


@router.delete("/{mapping_pk}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field_mapping(mapping_pk: int, db: Session = Depends(get_db)):
    crud_field_mapping.delete(db, mapping_pk)
