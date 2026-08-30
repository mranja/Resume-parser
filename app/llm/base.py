import abc
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class LLMResult:
    text: str
    parsed_json: Optional[dict[str, Any]] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: float = 0.0
    model_name: str = "unknown"
    provider: str = "unknown"


class BaseLLMProvider(abc.ABC):
    @abc.abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: str = "You are an expert AI recruiting assistant.",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        """Synchronous text or structured JSON generation."""
        pass

    @abc.abstractmethod
    async def agenerate(
        self,
        prompt: str,
        system_prompt: str = "You are an expert AI recruiting assistant.",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        """Asynchronous text or structured JSON generation."""
        pass
