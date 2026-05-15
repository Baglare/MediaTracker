from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EmbedInput(BaseModel):
    id: str = ""
    text: str = ""
    hash: str = ""
    signals: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None


class EmbedRequest(BaseModel):
    inputs: List[EmbedInput] = Field(default_factory=list)


class EmbedResult(BaseModel):
    id: str
    hash: str
    vector: List[float]


class EmbedResponse(BaseModel):
    results: List[EmbedResult]
    model: str
    dimensions: int
    skipped: int = 0


class HealthResponse(BaseModel):
    status: str
    model: str
    model_loaded: bool


class ModelStatus(BaseModel):
    model: str
    model_loaded: bool
