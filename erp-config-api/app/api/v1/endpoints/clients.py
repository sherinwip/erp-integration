from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.client import crud_client, create_client, update_client
from app.schemas.client import ClientCreate, ClientRead, ClientUpdate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=List[ClientRead])
def list_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud_client.list(db, skip=skip, limit=limit)


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client_endpoint(payload: ClientCreate, db: Session = Depends(get_db)):
    return create_client(db, payload)


@router.get("/{client_id}", response_model=ClientRead)
def get_client(client_id: str, db: Session = Depends(get_db)):
    return crud_client.get(db, client_id)


@router.patch("/{client_id}", response_model=ClientRead)
def update_client_endpoint(client_id: str, payload: ClientUpdate, db: Session = Depends(get_db)):
    return update_client(db, client_id, payload)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: str, db: Session = Depends(get_db)):
    crud_client.delete(db, client_id)
