# OpenVAS runner container
FROM greenbone/openvas-scanner:stable

# Install minimal tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl nodejs npm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy wrapper
COPY wrapper.js /app/wrapper.js

# Default environment
ENV OPENVAS_FEED_SYNC=1 \
    PORT=8080

# Simple healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD nc -z localhost 8080 || exit 1

EXPOSE 8080

CMD ["node", "/app/wrapper.js"]
