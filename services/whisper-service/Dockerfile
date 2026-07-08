FROM python:3.11-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY app.py .

# Puerto expuesto
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["python", "app.py"]
