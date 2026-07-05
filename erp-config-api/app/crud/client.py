from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.models import Client
from app.schemas.client import ClientCreate, ClientUpdate
from .base import CRUDBase

crud_client = CRUDBase(Client, "Client")


def create_client(db: Session, payload: ClientCreate) -> Client:
    if crud_client.get_optional(db, payload.client_id) is not None:
        raise ConflictError(f"Client '{payload.client_id}' already exists")
    obj = Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_client(db: Session, client_id: str, payload: ClientUpdate) -> Client:
    obj = crud_client.get(db, client_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj
