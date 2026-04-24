#!/bin/sh
set -e
exec uv run uvicorn grade_sight_api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
