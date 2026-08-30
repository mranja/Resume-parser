# Production Multi-Stage Dockerfile for TalentSignal

FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-postgres.txt ./

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-postgres.txt


# -----------------------------
# Production Runtime
# -----------------------------

FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy installed Python packages
COPY --from=builder /usr/local/lib/python3.12/site-packages \
    /usr/local/lib/python3.12/site-packages

COPY --from=builder /usr/local/bin \
    /usr/local/bin

# Copy application
COPY . .

# Create upload directory and non-root user
RUN useradd -m -u 1001 appuser && \
    mkdir -p /app/uploads && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Render supplies the PORT environment variable.
# Fallback to 8000 for local Docker usage.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]