# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory
WORKDIR /usr/src/app

# Install nmap
RUN apt-get update && apt-get install -y nmap && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt ./

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the function code into the container
COPY main.py .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define environment variable
ENV GCP_PROJECT "your-gcp-project-id"
ENV GCP_BUCKET_NAME "your-bucket-name"
ENV VERCEL_WEBHOOK_URL "your-webhook-url"
ENV GCP_WEBHOOK_SECRET "your-webhook-secret"

# Run the HTTP server with the function when the container launches
CMD ["functions-framework", "--target=nmap_scanner", "--port=8080"]
