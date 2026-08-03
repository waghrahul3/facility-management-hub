#!/bin/sh
# Sandbox-only guard: make sure local PostgreSQL is up before the API starts.
# No-ops harmlessly in hosted deploys (the Node-only build image has no local
# Postgres and DATABASE_URL points at a hosted database there).

# Already accepting connections -> done.
if command -v pg_isready >/dev/null 2>&1 && pg_isready -q; then
  exit 0
fi

# Try to start the local cluster if present (needs passwordless sudo, sandbox only).
if command -v sudo >/dev/null 2>&1; then
  sudo -n pg_ctlcluster 14 main start >/dev/null 2>&1 || true
  sudo -n service postgresql start >/dev/null 2>&1 || true
fi

# Wait up to ~10s for Postgres to accept connections (skip if pg_isready absent).
if command -v pg_isready >/dev/null 2>&1; then
  i=0
  while [ "$i" -lt 10 ]; do
    pg_isready -q 2>/dev/null && exit 0
    sleep 1
    i=$((i + 1))
  done
fi

exit 0
