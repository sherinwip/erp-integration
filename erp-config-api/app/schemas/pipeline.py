from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

BackoffType = Literal["exponential", "fixed"]
PipelineStatus = Literal["active", "inactive"]

SUPPORTED_PATTERNS = {
    "PAT-01", "PAT-02", "PAT-03", "PAT-05", "PAT-06", "PAT-07", "PAT-08", "PAT-10",
}  # PAT-04 and PAT-09 are explicitly unsupported per FR-CLM-004


class PipelineBase(BaseModel):
    version: str = Field("1.0", max_length=20)
    source_system: str = Field(..., max_length=50)
    object_type: str = Field(..., max_length=100)
    event_type: str = Field("*", max_length=50)
    pattern_id: str = Field(..., max_length=10)
    status: PipelineStatus = "active"
    retry_max_attempts: int = 3
    retry_backoff: BackoffType = "exponential"
    retry_backoff_base_ms: int = 2000
    retry_on_status_codes: str = Field("500,502,503,504", max_length=100)


class PipelineCreate(PipelineBase):
    pipeline_id: str = Field(..., max_length=100)
    client_id: str = Field(..., max_length=50)


class PipelineUpdate(BaseModel):
    version: Optional[str] = Field(None, max_length=20)
    source_system: Optional[str] = Field(None, max_length=50)
    object_type: Optional[str] = Field(None, max_length=100)
    event_type: Optional[str] = Field(None, max_length=50)
    pattern_id: Optional[str] = Field(None, max_length=10)
    status: Optional[PipelineStatus] = None
    retry_max_attempts: Optional[int] = None
    retry_backoff: Optional[BackoffType] = None
    retry_backoff_base_ms: Optional[int] = None
    retry_on_status_codes: Optional[str] = Field(None, max_length=100)


class PipelineRead(PipelineBase):
    model_config = ConfigDict(from_attributes=True)

    pipeline_id: str
    client_id: str
    created_at: datetime
    updated_at: datetime
