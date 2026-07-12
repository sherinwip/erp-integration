"""
Environment-driven configuration. Mirrors transformation-svc/erp_transform/config.py
so both services read the same DB_* variables against the same Postgres instance.
"""
import os
from functools import lru_cache
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_v1_prefix: str = "/api/v1"
    project_name: str = "ERP Config API"

    db_host: str = os.environ.get("DB_HOST", "localhost")
    db_port: int = int(os.environ.get("DB_PORT", "5432"))
    db_name: str = os.environ.get("DB_NAME", "erp-integration")
    db_user: str = os.environ.get("DB_USER", "root")
    db_password: str = os.environ.get("DB_PASSWORD", "root")

    @property
    def sqlalchemy_database_uri(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
