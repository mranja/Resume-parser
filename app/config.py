from functools import lru_cache
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "sqlite:///./recruitment.db"

    # Uploads
    upload_dir: Path = Path("uploads")
    max_upload_mb: int = 8

    # LLM Settings
    llm_provider: Literal["mock", "groq", "openai", "gemini", "ollama"] = "mock"
    llm_model: str = "default"
    llm_api_key: str | None = None
    groq_api_key: str | None = None
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    llm_temperature: float = 0.1

    # Embedding Settings
    embedding_provider: Literal["local", "openai", "gemini", "ollama"] = "local"
    embedding_model: str = "local-tfidf-dense"

    # Vector Store
    vector_store: Literal["sqlite", "memory", "pgvector"] = "sqlite"

    # Security & Auth
    require_auth: bool = False
    recruiter_api_key: str = "recruiter-demo-key"

    # Responsible AI
    ai_disclaimer: str = (
        "Notice: AI recommendations are assistive decision-support tools and "
        "must not be used as the sole basis for hiring decisions."
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
