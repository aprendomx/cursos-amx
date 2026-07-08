"""
Faster-Whisper Transcription Service
Por defecto usa CPU. GPU opcional vía env var DEVICE=cuda.
"""

import os
import tempfile
import time
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request
from faster_whisper import WhisperModel

app = Flask(__name__)

# ── Config ──
MODEL_NAME = os.getenv("WHISPER_MODEL", "medium")
DEVICE = os.getenv("DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "int8")
PORT = int(os.getenv("PORT", "5000"))

# En CPU forzar int8 (los demás no están soportados)
if DEVICE == "cpu" and COMPUTE_TYPE not in ("int8",):
    COMPUTE_TYPE = "int8"

# ── Cargar modelo al iniciar ──
print(f"[whisper-service] Cargando modelo: {MODEL_NAME} | device={DEVICE} | compute={COMPUTE_TYPE}")
start = time.time()
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
print(f"[whisper-service] Modelo listo en {time.time() - start:.1f}s")


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "model": MODEL_NAME,
            "device": DEVICE,
            "compute_type": COMPUTE_TYPE,
        }
    )


@app.route("/transcribe", methods=["POST"])
def transcribe():
    body = request.get_json(force=True)
    audio_url = body.get("audio_url")
    language = body.get("language", "es")

    if not audio_url:
        return jsonify({"error": "Falta audio_url"}), 400

    tmp_path = None
    try:
        # Descargar audio a archivo temporal
        suffix = Path(audio_url).suffix or ".mp4"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
            urllib.request.urlretrieve(audio_url, tmp_path)

        # Transcribir
        t0 = time.time()
        segments_iter, info = model.transcribe(
            tmp_path,
            language=language,
            condition_on_previous_text=True,
            vad_filter=True,
        )
        segments = list(segments_iter)
        elapsed = time.time() - t0

        # Construir respuesta compatible con OpenAI Whisper
        text = " ".join(s.text.strip() for s in segments)
        result = {
            "text": text,
            "segments": [
                {
                    "id": i,
                    "start": round(s.start, 2),
                    "end": round(s.end, 2),
                    "text": s.text.strip(),
                    "seek": round(s.start, 2),
                }
                for i, s in enumerate(segments)
            ],
            "language": info.language,
            "duration": round(info.duration, 2) if info.duration else None,
            "source": "faster-whisper",
            "model": MODEL_NAME,
            "device": DEVICE,
            "elapsed_seconds": round(elapsed, 2),
        }

        return jsonify(result)

    except Exception as e:
        app.logger.exception("Error en transcripción")
        return jsonify({"error": str(e)}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    # En producción usar gunicorn; aquí solo para desarrollo
    app.run(host="0.0.0.0", port=PORT, threaded=True)
