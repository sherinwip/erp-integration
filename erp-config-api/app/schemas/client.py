from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ClientBase(BaseModel):
    client_name: str = Field(..., max_length=200)
    is_active: bool = True


class ClientCreate(ClientBase):
    client_id: str = Field(..., max_length=50)


class ClientUpdate(BaseModel):
    client_name: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    client_id: str
    created_at: datetime
