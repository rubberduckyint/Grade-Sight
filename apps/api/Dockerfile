FROM python:3.12-slim

# System deps (curl for uv installer)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install uv to /root/.local/bin and put it on PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Install deps first (Docker layer caching — deps don't change every commit)
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project

# Copy source and install the project itself
COPY src ./src
RUN uv sync --locked

# Railway injects $PORT; default to 8000 locally
EXPOSE 8000
CMD ["sh", "-c", "uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
