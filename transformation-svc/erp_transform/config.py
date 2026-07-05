"""
Environment-driven configuration. Same module works against the local Docker
Postgres (docker-compose defaults below) and against a production database --
only the environment variables change, no code changes.

In a Step Functions/Lambda deployment, DB_* would come from Lambda environment
variables (populated from Secrets Manager/SSM at deploy time), not from a
.env file or hardcoded default.
"""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class DBConfig:
    host: str
    port: int
    dbname: str
    user: str
    password: str

    @property
    def dsn(self) -> str:
        return (
            f"host={self.host} port={self.port} dbname={self.dbname} "
            f"user={self.user} password={self.password}"
        )


def get_db_config() -> DBConfig:
    return DBConfig(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=os.environ.get("DB_NAME", "erp_integration"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "root"),
    )


def get_http_timeout_seconds() -> float:
    return float(os.environ.get("HTTP_TIMEOUT_SECONDS", "30"))
