#!/usr/bin/env bash
# Cluster PostgreSQL propre au projet, pour le développement (aucun accès au cluster système).
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"; DATA="$PWD/.pgdata"; PORT="${PG_PORT:-5544}"
case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      "$BIN/initdb" -D "$DATA" -U changan --auth=trust -E UTF8 --locale=C >/dev/null
      echo "listen_addresses='127.0.0.1'
port=$PORT
unix_socket_directories='$DATA'
shared_buffers=64MB
max_wal_size=128MB
wal_keep_size=0" >> "$DATA/postgresql.conf"
    fi
    "$BIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -w status >/dev/null 2>&1 || "$BIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -w start >/dev/null
    "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U changan -d postgres -tc "select 1 from pg_database where datname='changan'" | grep -q 1 \
      || "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U changan changan
    echo "PostgreSQL prêt sur 127.0.0.1:$PORT" ;;
  stop) "$BIN/pg_ctl" -D "$DATA" stop -m fast ;;
  *) echo "usage: db-local.sh start|stop"; exit 1 ;;
esac
