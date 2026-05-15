# MediaTracker ML Service

FastAPI tabanlı embedding servisidir. Next.js tarafındaki R57 provider kontratıyla uyumludur.

## Kurulum

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Çalıştırma

```bash
uvicorn app:app --host 127.0.0.1 --port 8001
```

Next.js tarafında:

```bash
MEDIA_TRACKER_ML_SERVICE_URL=http://127.0.0.1:8001
```

## Endpointler

- `GET /health`: Servis durumunu döner. Modeli yüklemeye zorlamaz.
- `POST /embed`: `inputs` listesindeki `id`, `hash`, `text` alanlarından embedding vector üretir.

Varsayılan model `sentence-transformers/all-MiniLM-L6-v2`. Değiştirmek için:

```bash
MEDIA_TRACKER_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

Boş `text`, eksik `id` veya eksik `hash` olan girdiler güvenli şekilde atlanır.
