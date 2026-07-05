"""
Centralized API error types + FastAPI exception handlers.
Every error response has the shape: {"error": "<Code>", "detail": "<message>"}.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


class AppError(Exception):
    """Base class for all handled application errors."""

    status_code = 500
    error_code = "InternalError"

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppError):
    status_code = 404
    error_code = "NotFound"


class ConflictError(AppError):
    status_code = 409
    error_code = "Conflict"


class ValidationError(AppError):
    status_code = 422
    error_code = "ValidationError"


def _error_response(status_code: int, error_code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error_code, "detail": detail})


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return _error_response(exc.status_code, exc.error_code, exc.detail)

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        return _error_response(409, "IntegrityConstraintViolation", str(exc.orig))

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        return _error_response(500, "InternalError", str(exc))
