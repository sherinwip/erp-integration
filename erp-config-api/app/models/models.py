"""
SQLAlchemy ORM models mirroring database/changelog exactly (changesets 001-008).
No table creation here -- Liquibase owns schema migration; these models only map to it.
"""
from sqlalchemy import (
    Column, String, Integer, BigInteger, Boolean, DateTime, ForeignKey,
    UniqueConstraint, func, JSON,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base

JSONType = JSONB().with_variant(JSON(), "sqlite")
# SQLite has no BIGSERIAL; its rowid-alias autoincrement only kicks in for a
# plain INTEGER primary key, so BIGSERIAL-equivalent PKs use this variant
# purely for test compatibility -- production (Postgres) still gets BigInteger.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


class Client(Base):
    __tablename__ = "client"

    client_id = Column(String(50), primary_key=True)
    client_name = Column(String(200), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    targets = relationship("Target", back_populates="client", cascade="all, delete-orphan")
    steps = relationship("Step", back_populates="client", cascade="all, delete-orphan")
    pipelines = relationship("Pipeline", back_populates="client", cascade="all, delete-orphan")


class Target(Base):
    __tablename__ = "target"
    __table_args__ = (
        UniqueConstraint("client_id", "target_name", name="uq_target_client_name"),
    )

    target_id = Column(String(150), primary_key=True)
    client_id = Column(String(50), ForeignKey("client.client_id"), nullable=False)
    target_name = Column(String(100), nullable=False)
    base_url = Column(String(500), nullable=False)
    auth_type = Column(String(20), nullable=False)
    credential_ref = Column(String(200), nullable=False)
    default_headers = Column(JSONType, nullable=False, default=dict)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    client = relationship("Client", back_populates="targets")
    steps = relationship("Step", back_populates="target")


class Pipeline(Base):
    __tablename__ = "pipeline"

    pipeline_id = Column(String(100), primary_key=True)
    client_id = Column(String(50), ForeignKey("client.client_id"), nullable=False)
    version = Column(String(20), nullable=False, default="1.0")
    source_system = Column(String(50), nullable=False)
    object_type = Column(String(100), nullable=False)
    event_type = Column(String(50), nullable=False, default="*")
    pattern_id = Column(String(10), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    retry_max_attempts = Column(Integer, nullable=False, default=3)
    retry_backoff = Column(String(20), nullable=False, default="exponential")
    retry_backoff_base_ms = Column(Integer, nullable=False, default=2000)
    retry_on_status_codes = Column(String(100), nullable=False, default="500,502,503,504")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    client = relationship("Client", back_populates="pipelines")
    pipeline_steps = relationship("PipelineStep", back_populates="pipeline", cascade="all, delete-orphan")


class Step(Base):
    __tablename__ = "step"
    __table_args__ = (
        UniqueConstraint("client_id", "step_name", name="uq_step_client_name"),
    )

    step_pk = Column(BigIntPK, primary_key=True, autoincrement=True)
    client_id = Column(String(50), ForeignKey("client.client_id"), nullable=False)
    target_id = Column(String(150), ForeignKey("target.target_id"), nullable=False)
    step_name = Column(String(100), nullable=False)
    method = Column(String(10), nullable=False)
    path = Column(String(500), nullable=False)
    query_params = Column(JSONType, nullable=True)
    headers = Column(JSONType, nullable=True)
    extract = Column(JSONType, nullable=True)
    on_not_found = Column(String(20), nullable=False, default="fail")
    on_multiple_results = Column(String(20), nullable=False, default="useFirst")
    rollback_method = Column(String(10), nullable=True)
    rollback_path = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    client = relationship("Client", back_populates="steps")
    target = relationship("Target", back_populates="steps")
    pipeline_steps = relationship("PipelineStep", back_populates="step", cascade="all, delete-orphan")
    field_mappings = relationship("FieldMapping", back_populates="step", cascade="all, delete-orphan")


class PipelineStep(Base):
    __tablename__ = "pipeline_step"
    __table_args__ = (
        UniqueConstraint("pipeline_id", "step_pk", name="uq_pipeline_step_pipeline_step"),
        UniqueConstraint("pipeline_id", "seq", name="uq_pipeline_step_pipeline_seq"),
    )

    pipeline_step_pk = Column(BigIntPK, primary_key=True, autoincrement=True)
    pipeline_id = Column(String(100), ForeignKey("pipeline.pipeline_id"), nullable=False)
    step_pk = Column(BigInteger, ForeignKey("step.step_pk"), nullable=False)
    seq = Column(Integer, nullable=False)

    pipeline = relationship("Pipeline", back_populates="pipeline_steps")
    step = relationship("Step", back_populates="pipeline_steps")


class FieldMapping(Base):
    __tablename__ = "field_mapping"
    __table_args__ = (
        UniqueConstraint(
            "step_pk", "array_target_path", "target_path",
            name="uq_field_mapping_step_array_target",
        ),
    )

    mapping_pk = Column(BigIntPK, primary_key=True, autoincrement=True)
    step_pk = Column(BigInteger, ForeignKey("step.step_pk"), nullable=False)
    source_path = Column(String(200), nullable=False)
    target_path = Column(String(200), nullable=False)
    transform_type = Column(String(50), nullable=False, default="none")
    transform_params = Column(String(500), nullable=True)
    default_value = Column(String(500), nullable=True)
    is_required = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    array_source_path = Column(String(200), nullable=False, default="")
    array_target_path = Column(String(200), nullable=False, default="")
    is_singleton_array = Column(Boolean, nullable=False, default=False)
    is_object_target = Column(Boolean, nullable=False, default=False)

    step = relationship("Step", back_populates="field_mappings")
