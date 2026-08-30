import abc
from typing import Sequence


class BaseEmbeddingProvider(abc.ABC):
    @abc.abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """Generate embedding vector for a single search query or snippet."""
        pass

    @abc.abstractmethod
    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate embedding vectors for multiple documents or chunks."""
        pass

    @property
    @abc.abstractmethod
    def dimension(self) -> int:
        """Dimensionality of the embedding vector."""
        pass
