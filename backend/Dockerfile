# Use a lightweight python image
FROM python:3.10-slim

# Install system dependencies (needed for compiling/running packages like faiss)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency definition
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files, models, and databases
COPY backend/ ./backend/
COPY event_dna.db .
COPY event_dna.index .
COPY impact_model.joblib .
COPY preprocessors.joblib .
COPY underpass.xlsx .
COPY "Astram event data_anonymized - Astram event data_anonymizedb40ac87.csv" .

# Set default port
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run FastAPI app with uvicorn
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}
