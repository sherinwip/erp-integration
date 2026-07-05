from fastapi import APIRouter

from app.api.v1.endpoints import (
    clients, targets, steps, pipelines, pipeline_steps, field_mappings,
)

api_router = APIRouter()
api_router.include_router(clients.router)
api_router.include_router(targets.router)
api_router.include_router(steps.router)
api_router.include_router(pipelines.router)
api_router.include_router(pipeline_steps.router)
api_router.include_router(field_mappings.router)
