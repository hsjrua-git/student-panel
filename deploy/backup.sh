#!/usr/bin/env bash
# Back up the Student Panel database to a timestamped, compressed dump.
# Run it by hand, or from cron/systemd on a schedule. Reads DATABASE_URL from
# server/.env. Old backups beyond $KEEP are pruned.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/../server/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HERE/../backups}"
KEEP="${KEEP:-30}"

# Load DATABASE_URL from the server .env without printing it.
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (looked in $ENV_FILE)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/student-panel-$STAMP.sql.gz"

# --clean --if-exists makes the dump safe to restore over an existing database.
pg_dump --clean --if-exists --no-owner --no-privileges "$DATABASE_URL" \
  | gzip >"$OUT"

echo "Wrote $OUT"

# Keep only the newest $KEEP dumps.
ls -1t "$BACKUP_DIR"/student-panel-*.sql.gz 2>/dev/null \
  | tail -n +"$((KEEP + 1))" \
  | xargs -r rm -f
