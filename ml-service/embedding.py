import os
from functools import lru_cache
from typing import List

from sentence_transformers import SentenceTransformer

from models import EmbedInput, EmbedResponse, EmbedResult, ModelStatus


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_ENV_KEY = "MEDIA_TRACKER_EMBEDDING_MODEL"

_model_loaded = False


def model_name() -> str:
    return os.getenv(MODEL_ENV_KEY, DEFAULT_MODEL).strip() or DEFAULT_MODEL


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    global _model_loaded
    model = SentenceTransformer(model_name())
    _model_loaded = True
    return model


def get_model_status() -> ModelStatus:
    return ModelStatus(model=model_name(), model_loaded=_model_loaded)


def _valid_inputs(inputs: List[EmbedInput]) -> tuple[List[EmbedInput], int]:
    valid: List[EmbedInput] = []
    skipped = 0
    for item in inputs:
        if not item.id.strip() or not item.hash.strip() or not item.text.strip():
            skipped += 1
            continue
        valid.append(item)
    return valid, skipped


def embed_inputs(inputs: List[EmbedInput]) -> EmbedResponse:
    valid, skipped = _valid_inputs(inputs)
    if not valid:
        return EmbedResponse(results=[], model=model_name(), dimensions=0, skipped=skipped)

    texts = [item.text.strip() for item in valid]
    vectors = get_model().encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    results = [
        EmbedResult(
            id=item.id,
            hash=item.hash,
            vector=[float(value) for value in vector.tolist()],
        )
        for item, vector in zip(valid, vectors)
    ]
    dimensions = len(results[0].vector) if results else 0
    return EmbedResponse(results=results, model=model_name(), dimensions=dimensions, skipped=skipped)
