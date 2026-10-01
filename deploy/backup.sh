#!/usr/bin/env bash
# Backs up PostgreSQL and the uploads volume into  <repo>/backups/iaml-<UTC timestamp>[-label]/
#   db.dump          pg_dump -Fc (custom format, compressed)   restore: deploy/restore.sh
#   uploads.tar.gz   member avatars (/data/uploads of the app container)
#   MANIFEST.txt     when / which version / row counts
# The backup contains personal data (e-mail addresses, workplaces): the directory is created with mode 700.
#
# Usage: deploy/backup.sh [--keep N] [--dir DIR] [--label TEXT]
#   --keep N    keep the newest N backups and delete older ones      (default: $BACKUP_KEEP or 14)
#   --dir DIR   backup directory                                      (default: $BACKUP_DIR or <repo>/backups)
#   --label T   text appended to the directory name, e.g. pre-update
#
# The exit code is non-zero if ANY step fails; a half-written backup is removed, never left behind.
# Cron example (every night at 03:15; run the script once by hand first so that backups/ exists):
#   15 3 * * *  cd /opt/iaml && ./deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

KEEP="${BACKUP_KEEP:-14}"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT_DIR/backups}"
LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help) usage; exit 0 ;;
    --keep) [ $# -ge 2 ] || die "--keep needs a number"; KEEP="$2"; shift 2 ;;
    --dir) [ $# -ge 2 ] || die "--dir needs a path"; BACKUP_ROOT="$2"; shift 2 ;;
    --label) [ $# -ge 2 ] || die "--label needs a text"; LABEL="$2"; shift 2 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done
case "$KEEP" in '' | *[!0-9]*) die "--keep must be a whole number" ;; esac
[ "$KEEP" -ge 1 ] || die "--keep must be at least 1"
case "$LABEL" in *[!A-Za-z0-9_-]*) die "--label may contain only letters, digits, - and _" ;; esac
BACKUP_ROOT="$(abspath "$BACKUP_ROOT")"

need_docker
need_env
service_running db || die "the db container is not running (docker compose up -d)."
service_running app || die "the app container is not running (docker compose up -d)."

umask 077
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT" 2>/dev/null || true
# The repository is public and backups hold personal data: make git ignore this directory whatever .gitignore says.
[ -e "$BACKUP_ROOT/.gitignore" ] || printf '*\n' >"$BACKUP_ROOT/.gitignore"

stamp="$(date -u +%Y%m%d-%H%M%S)"
name="iaml-$stamp${LABEL:+-$LABEL}"
final="$BACKUP_ROOT/$name"
tmp="$BACKUP_ROOT/.tmp-$name"
[ ! -e "$final" ] || die "$final already exists"
trap 'rm -rf -- "$tmp"' EXIT
mkdir "$tmp"

info "[1/3] PostgreSQL dump ..."
# shellcheck disable=SC2016 # the variables are the container's own and must expand there
dc exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$tmp/db.dump"
[ -s "$tmp/db.dump" ] || die "the database dump is empty"
dc exec -T db pg_restore --list <"$tmp/db.dump" >/dev/null || die "the database dump cannot be read back (truncated?)"

info "[2/3] uploads ..."
dc exec -T app tar -C /data/uploads -czf - . >"$tmp/uploads.tar.gz"
gzip -t "$tmp/uploads.tar.gz" || die "the uploads archive is corrupt"

info "[3/3] manifest ..."
app_cid="$(dc ps -q app | head -n 1)"
project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$app_cid" 2>/dev/null || true)"
{
  echo "created_utc:      $stamp"
  echo "host:             $(hostname 2>/dev/null || echo unknown)"
  echo "git:              $(git describe --always --dirty 2>/dev/null || echo unknown)"
  echo "compose_project:  ${project:-unknown}"
  echo "db_dump_bytes:    $(wc -c <"$tmp/db.dump" | tr -d ' ')"
  echo "uploads_bytes:    $(wc -c <"$tmp/uploads.tar.gz" | tr -d ' ')"
  echo "migrations:       $(psql_db 'select count(*) from schema_migrations')"
  echo "users:            $(psql_db 'select count(*) from users')"
} >"$tmp/MANIFEST.txt"

mv -- "$tmp" "$final"
trap - EXIT
info "Backup written: $final ($(du -sh "$final" | cut -f1))"

# rotation: names start with a UTC timestamp, so a reverse sort is newest-first
old=()
while IFS= read -r d; do
  old+=("$d")
done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'iaml-*' | sort -r | tail -n "+$((KEEP + 1))")
if [ "${#old[@]}" -gt 0 ]; then
  for d in "${old[@]}"; do
    rm -rf -- "$d"
    info "Removed old backup: $(basename "$d")"
  done
fi
info "Done. Copy $BACKUP_ROOT off this server regularly (see docs/OPERATIONS.md)."
