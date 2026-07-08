# Faster-Whisper Transcription Service

Servicio de transcripción local basado en [faster-whisper](https://github.com/SYSTRAN/faster-whisper).
Por defecto usa CPU; GPU (CUDA) es opcional vía docker-compose override.

## Quick Start

```bash
cd services/whisper-service

docker build -t whisper-service .

# CPU (default)
docker run -p 5000:5000 -e WHISPER_MODEL=medium whisper-service

# GPU (requiere nvidia-docker)
docker run --gpus all -p 5000:5000 -e WHISPER_MODEL=large-v2 -e DEVICE=cuda whisper-service
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WHISPER_MODEL` | `medium` | Modelo a cargar: tiny, base, small, medium, large-v2, distil-large-v3 |
| `DEVICE` | `cpu` | `cpu` o `cuda` |
| `COMPUTE_TYPE` | `int8` | `int8`, `float16`, `float32`. En CPU solo `int8`. |
| `PORT` | `5000` | Puerto del servidor Flask |

## Endpoints

### `POST /transcribe`

Request:
```json
{
  "audio_url": "https://storage.../audio.mp4"
}
```

Response:
```json
{
  "text": "transcripción completa...",
  "segments": [
    {"start": 0.0, "end": 5.2, "text": "Hola mundo"}
  ],
  "duration": 3600.5,
  "model": "medium",
  "device": "cpu",
  "source": "faster-whisper"
}
```

### `GET /health`

Devuelve estado del servicio y modelo cargado.

## Elección de modelo

| Modelo | VRAM (GPU) | Velocidad* | Calidad | Recomendado para |
|--------|-----------|-----------|---------|------------------|
| tiny | ~1 GB | 32x | Baja | Pruebas rápidas |
| base | ~1 GB | 16x | Media | Transcripciones simples |
| small | ~2 GB | 6x | Buena | Uso general CPU |
| medium | ~5 GB | 2x | Muy buena | **Default recomendado** |
| large-v2 | ~10 GB | 1x | Excelente | Máxima calidad |
| distil-large-v3 | ~8 GB | 1.5x | ~large-v2 | Sweet spot GPU |

\* Velocidad relativa a tiempo real en RTX 3060.

## Docker Compose

Ver `docker/docker-compose.yml` para la integración con el stack completo.

El servicio se conecta a la red `supabase-network` para que las Edge Functions
puedan llamarlo internamente por nombre: `http://whisper-service:5000`.
