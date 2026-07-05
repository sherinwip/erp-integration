from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

TransformType = Literal[
    "RENAME", "CONCAT", "TRANSFORM", "CONST", "VARIABLE", "SPLIT",
    "none", "date_format", "uppercase", "lowercase", "lookup", "calculate",
]


class FieldMappingBase(BaseModel):
    source_path: str = Field(..., max_length=200)
    target_path: str = Field(..., max_length=200)
    transform_type: TransformType = "none"
    transform_params: Optional[str] = Field(None, max_length=500)
    default_value: Optional[str] = Field(None, max_length=500)
    is_required: bool = False
    sort_order: int = 0
    array_source_path: str = Field("", max_length=200)
    array_target_path: str = Field("", max_length=200)
    is_singleton_array: bool = False


class FieldMappingCreate(FieldMappingBase):
    step_pk: int


class FieldMappingUpdate(BaseModel):
    source_path: Optional[str] = Field(None, max_length=200)
    target_path: Optional[str] = Field(None, max_length=200)
    transform_type: Optional[TransformType] = None
    transform_params: Optional[str] = Field(None, max_length=500)
    default_value: Optional[str] = Field(None, max_length=500)
    is_required: Optional[bool] = None
    sort_order: Optional[int] = None
    array_source_path: Optional[str] = Field(None, max_length=200)
    array_target_path: Optional[str] = Field(None, max_length=200)
    is_singleton_array: Optional[bool] = None


class FieldMappingRead(FieldMappingBase):
    model_config = ConfigDict(from_attributes=True)

    mapping_pk: int
    step_pk: int
