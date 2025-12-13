# OpenVAS runner container
# Use GHCR source to avoid Docker Hub pull limits
FROM ghcr.io/greenbone/openvas-scanner:stable

# Install tools required for the Node wrapper and gvm-cli/python bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl nodejs npm python3 python3-pip \
    gvm-tools python3-gvm python3-lxml netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy wrapper and Python scan helper
COPY wrapper.js /app/wrapper.js
COPY openvas_scan.py /app/openvas_scan.py
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# Default environment
ENV OPENVAS_FEED_SYNC=1 \
    PORT=8080

# Simple healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD nc -z localhost 8080 || exit 1

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
