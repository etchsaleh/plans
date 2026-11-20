#!/usr/bin/env bash
# Start a throwaway local Postgres without Docker (uses the system's PG binaries).
# Usage: scripts/dev-db.sh [start|stop|reset]   — data in .data/pg, port $PGPORT (default 5433)
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${PGDATA_DIR:-$(pwd)/.data/pg}"
PORT="${PGPORT:-5433}"
cmd="${1:-start}"
if [[ "$cmd" == "reset" ]]; then "$0" stop || true; rm -rf "$DATA"; cmd=start; fi
if [[ "$cmd" == "stop" ]]; then "$PGBIN/pg_ctl" -D "$DATA" stop -m fast; exit 0; fi
if [[ ! -d "$DATA" ]]; then
  mkdir -p "$DATA"
  RUNAS=()
  if [[ $(id -u) == 0 ]]; then chown -R postgres "$DATA" "$(dirname "$DATA")"; RUNAS=(sudo -u postgres); fi
  "${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U plan --auth=trust >/dev/null
fi
RUNAS=(); [[ $(id -u) == 0 ]] && RUNAS=(sudo -u postgres)
if ! "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" start >/dev/null
fi
for db in plan plan_test; do
  "$PGBIN/psql" -h localhost -p "$PORT" -U plan -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || "$PGBIN/createdb" -h localhost -p "$PORT" -U plan "$db"
done
echo "Postgres ready: postgres://plan@localhost:$PORT/plan (tests: /plan_test)"
