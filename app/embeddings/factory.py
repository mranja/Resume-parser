import hashlib
import math
import re
from typing import Optional, Sequence
import numpy as np
import httpx

from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.embeddings.base import BaseEmbeddingProvider

logger = get_logger("embeddings.factory")


class LocalDenseEmbeddingProvider(BaseEmbeddingProvider):
    """
    High-performance, deterministic 128-dimensional feature-hashed embedding provider.
    Computes subword n-gram TF-IDF frequency representations projected into normalized
    dense vector space with cosine consistency. Runs completely offline.
    """

    def __init__(self, dim: int = 128):
        self._dim = dim

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_query(self, text: str) -> list[float]:
        return self._compute_vector(text)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._compute_vector(t) for t in texts]

    def _compute_vector(self, text: str) -> list[float]:
        if not text or not text.strip():
            return [0.0] * self._dim

        vec = np.zeros(self._dim, dtype=np.float32)
        tokens = re.findall(r"[a-zA-Z0-9+#./-]+", text.lower())
        
        # Word and character n-gram hashing
        for token in tokens:
            # Word token
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self._dim
            sign = 1.0 if ((h >> 8) & 1) == 1 else -1.0
            vec[idx] += sign * (1.0 + math.log(1.0 + len(token)))

            # Character 3-grams for typo/variant tolerance
            if len(token) >= 3:
                for i in range(len(token) - 2):
                    sub = token[i : i + 3]
                    sh = int(hashlib.md5(sub.encode("utf-8")).hexdigest(), 16)
                    sidx = sh % self._dim
                    ssign = 1.0 if ((sh >> 8) & 1) == 1 else -1.0
                    vec[sidx] += ssign * 0.4

        norm = np.linalg.norm(vec)
        if norm > 1e-8:
            vec = vec / norm
        return [round(float(v), 6) for v in vec]


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, api_key: str, model_name: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model_name = model_name
        self.base_url = "https://api.openai.com/v1/embeddings"
        self._dim = 1536

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_query(self, text: str) -> list[float]:
        results = self.embed_documents([text])
        return results[0]

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        cleaned_texts = [t.replace("\n", " ") for t in texts]
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                self.base_url,
                headers=headers,
                json={"input": cleaned_texts, "model": self.model_name},
            )
            resp.raise_for_status()
            data = resp.json()
        return [item["embedding"] for item in data["data"]]


def get_embedding_provider(settings: Optional[Settings] = None) -> BaseEmbeddingProvider:
    cfg = settings or get_settings()
    provider_name = cfg.embedding_provider.lower()

    if provider_name == "openai":
        key = cfg.openai_api_key or cfg.llm_api_key
        if key:
            return OpenAIEmbeddingProvider(api_key=key, model_name=cfg.embedding_model or "text-embedding-3-small")
        logger.warning("OpenAI embedding requested but no API key found. Falling back to LocalDenseEmbeddingProvider.")

    return LocalDenseEmbeddingProvider(dim=128)
