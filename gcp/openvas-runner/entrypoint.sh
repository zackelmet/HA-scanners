#!/bin/sh
set -e

# Optional feed sync on container start (default on).
if [ "${OPENVAS_FEED_SYNC:-1}" != "0" ]; then
  MARKER="/var/lib/openvas/feed-sync.done"
  if [ ! -f "$MARKER" ]; then
    echo "[openvas-runner] Running greenbone-feed-sync all..."
    if greenbone-feed-sync all; then
      echo "[openvas-runner] Feed sync complete"
      date > "$MARKER"
    else
      echo "[openvas-runner] Feed sync failed; continuing with existing feeds" >&2
    fi
  else
    echo "[openvas-runner] Feed sync previously completed (marker present)"
  fi
else
  echo "[openvas-runner] OPENVAS_FEED_SYNC=0; skipping feed sync"
fi

exec node /app/wrapper.js
