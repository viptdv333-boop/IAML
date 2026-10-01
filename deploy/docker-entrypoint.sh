#!/bin/sh
# Container entrypoint of the IAML app image.
#
# Default command (`node src/server.js`):
#   1. node scripts/seed.js  - applies the SQL migrations and then the base data (positions, participants,
#                              menu, links ...) exactly ONCE. It is idempotent: on later starts it only prints
#                              "base data: already applied" and never resurrects rows deleted in the admin panel.
#   2. exec node src/server.js - `exec` makes node PID 1 of the container (or the child of docker's init), so
#                              SIGTERM from `docker compose stop` reaches it and the graceful shutdown runs.
# Any other command (e.g. `sh`, `node scripts/create-admin.js ...`) is executed as is.
#
# SEED_ON_START=false skips step 1 (the server still applies migrations itself when MIGRATE_ON_START=true).
set -eu

if [ "$#" -eq 2 ] && [ "$1" = "node" ] && [ "$2" = "src/server.js" ] && [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] migrations + base data (once)"
  node scripts/seed.js
fi

exec "$@"
