from functools import lru_cache
from pathlib import Path
from os import getenv


class Settings:
    def __init__(self) -> None:
        self.database_url = getenv(
            "DATABASE_URL",
            "sqlite:///./recruitment.db",
        )
        self.upload_dir = Path(getenv("UPLOAD_DIR", "uploads"))
        self.max_upload_mb = int(getenv("MAX_UPLOAD_MB", "8"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
