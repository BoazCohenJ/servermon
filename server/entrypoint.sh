#!/bin/sh
# Runs the collector on a loop in the background and the API in the foreground.
set -eu

INTERVAL="${SERVERMON_INTERVAL:-300}"
export SERVERMON_DATA="${SERVERMON_DATA:-/data}"
CONFIG="${SERVERMON_CONFIG:-/config/config.json}"

mkdir -p "$SERVERMON_DATA"

ARGS="--config $CONFIG"
[ "${SERVERMON_MOCK:-0}" = "1" ] && ARGS="$ARGS --mock"

(
  while true; do
    python3 /app/collect.py $ARGS || echo "collector failed" >&2
    sleep "$INTERVAL"
  done
) &

exec python3 /app/server.py
