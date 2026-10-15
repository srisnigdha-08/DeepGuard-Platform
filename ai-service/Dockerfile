FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 ffmpeg curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN mkdir -p temp_uploads static/heatmaps models logs
RUN useradd -m -u 1001 aiservice && chown -R aiservice /app
USER aiservice
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000","--workers","1"]
