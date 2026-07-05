from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

AuthType = Literal["oauth2", "basic", "apikey"]


class TargetBase(BaseModel):
    target_name: str = Field(..., max_length=100)
    base_url: str = Field(..., max_length=500)
    auth_type: AuthType
    credential_ref: str = Field(..., max_length=200)
    default_headers: dict = Field(default_factory=dict)
    is_active: bool = True


class TargetCreate(TargetBase):
    target_id: str = Field(..., max_length=150)
    client_id: str = Field(..., max_length=50)


class TargetUpdate(BaseModel):
    target_name: Optional[str] = Field(None, max_length=100)
    base_url: Optional[str] = Field(None, max_length=500)
    auth_type: Optional[AuthType] = None
    credential_ref: Optional[str] = Field(None, max_length=200)
    default_headers: Optional[dict] = None
    is_active: Optional[bool] = None


class TargetRead(TargetBase):
    model_config = ConfigDict(from_attributes=True)

    target_id: str
    client_id: str
    updated_at: datetime
