# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nmap \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code
COPY main.py .
COPY cve_mapping.py .

# Set Functions Framework environment
ENV PYTHONUNBUFFERED=1

# Run the Functions Framework
CMD ["functions-framework", "--target=scan", "--port=8080"]
