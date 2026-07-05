from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PipelineStepBase(BaseModel):
    seq: int = Field(..., ge=1)


class PipelineStepCreate(PipelineStepBase):
    pipeline_id: str = Field(..., max_length=100)
    step_pk: int


class PipelineStepUpdate(BaseModel):
    seq: Optional[int] = Field(None, ge=1)


class PipelineStepRead(PipelineStepBase):
    model_config = ConfigDict(from_attributes=True)

    pipeline_step_pk: int
    pipeline_id: str
    step_pk: int
