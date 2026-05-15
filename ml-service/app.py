from fastapi import FastAPI

from embedding import embed_inputs, get_model_status
from models import EmbedRequest, EmbedResponse, HealthResponse


app = FastAPI(title="MediaTracker ML Service", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    status = get_model_status()
    return HealthResponse(status="ok", model=status.model, model_loaded=status.model_loaded)


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
    return embed_inputs(request.inputs)
