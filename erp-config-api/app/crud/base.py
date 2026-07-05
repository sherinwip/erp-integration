"""Generic CRUD helpers shared by every entity-specific crud module."""
from typing import Generic, TypeVar, Type, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError

ModelType = TypeVar("ModelType")


class CRUDBase(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], not_found_label: str):
        self.model = model
        self.not_found_label = not_found_label

    def get(self, db: Session, pk_value) -> ModelType:
        pk_column = list(self.model.__table__.primary_key.columns)[0]
        obj = db.query(self.model).filter(pk_column == pk_value).first()
        if obj is None:
            raise NotFoundError(f"{self.not_found_label} '{pk_value}' not found")
        return obj

    def get_optional(self, db: Session, pk_value) -> Optional[ModelType]:
        pk_column = list(self.model.__table__.primary_key.columns)[0]
        return db.query(self.model).filter(pk_column == pk_value).first()

    def list(self, db: Session, skip: int = 0, limit: int = 100):
        return db.query(self.model).offset(skip).limit(limit).all()

    def delete(self, db: Session, pk_value) -> None:
        obj = self.get(db, pk_value)
        db.delete(obj)
        db.commit()
