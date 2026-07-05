from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
NotFoundBehaviour = Literal["fail", "skip"]
MultipleResultsBehaviour = Literal["useFirst", "fail"]


class StepBase(BaseModel):
    target_id: str = Field(..., max_length=150)
    step_name: str = Field(..., max_length=100)
    method: HttpMethod
    path: str = Field(..., max_length=500)
    query_params: Optional[dict] = None
    headers: Optional[dict] = None
    extract: Optional[dict] = None
    on_not_found: NotFoundBehaviour = "fail"
    on_multiple_results: MultipleResultsBehaviour = "useFirst"
    rollback_method: Optional[HttpMethod] = None
    rollback_path: Optional[str] = Field(None, max_length=500)
    is_active: bool = True


class StepCreate(StepBase):
    client_id: str = Field(..., max_length=50)


class StepUpdate(BaseModel):
    target_id: Optional[str] = Field(None, max_length=150)
    step_name: Optional[str] = Field(None, max_length=100)
    method: Optional[HttpMethod] = None
    path: Optional[str] = Field(None, max_length=500)
    query_params: Optional[dict] = None
    headers: Optional[dict] = None
    extract: Optional[dict] = None
    on_not_found: Optional[NotFoundBehaviour] = None
    on_multiple_results: Optional[MultipleResultsBehaviour] = None
    rollback_method: Optional[HttpMethod] = None
    rollback_path: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class StepRead(StepBase):
    model_config = ConfigDict(from_attributes=True)

    step_pk: int
    client_id: str
    updated_at: datetime
