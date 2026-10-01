#!/usr/bin/env bash
# Restores PostgreSQL and the uploads volume from a backup made by deploy/backup.sh.
# EVERYTHING that is in the database and the uploads volume now is REPLACED by the backup.
#
# Usage:
#   deploy/restore.sh [--yes] [--no-safety-backup] BACKUP_DIR
#   deploy/restore.sh [--yes] [--no-safety-backup] --db FILE.dump [--uploads FILE.tar.gz]
#   deploy/restore.sh                      (lists the available backups)
#
#   --yes               do not ask for the confirmation (for scripts only)
#   --no-safety-backup  do not take a backup of the CURRENT state first (use it when the stack is broken)
#   --db / --uploads    restore from individual files (uploads are left untouched when --uploads is omitted)
#
# Steps: confirmation -> safety backup of the current state -> stop the app -> recreate the database from the
# dump -> replace the uploads -> start the app and wait for it to become healthy.
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

ASSUME_YES=0
SAFETY=1
DB_FILE=""
UPLOADS_FILE=""
SRC_DIR=""
BACKUP_ROOT="${BACKUP_DIR:-$ROOT_DIR/backups}"

while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help) usage; exit 0 ;;
    --yes) ASSUME_YES=1; shift ;;
    --no-safety-backup) SAFETY=0; shift ;;
    --db) [ $# -ge 2 ] || die "--db needs a file"; DB_FILE="$(abspath "$2")"; shift 2 ;;
    --uploads) [ $# -ge 2 ] || die "--uploads needs a file"; UPLOADS_FILE="$(abspath "$2")"; shift 2 ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *) [ -z "$SRC_DIR" ] || die "only one backup directory may be given"; SRC_DIR="$(abspath "$1")"; shift ;;
  esac
done

if [ -z "$SRC_DIR" ] && [ -z "$DB_FILE" ]; then
  info "Available backups in $BACKUP_ROOT (newest first):"
  if [ -d "$BACKUP_ROOT" ]; then
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'iaml-*' | sort -r | sed 's/^/  /'
  fi
  info
  usage | sed -n '/^Usage:/,/^$/p'
  exit 2
fi
if [ -n "$SRC_DIR" ]; then
  [ -z "$DB_FILE" ] || die "give either a backup directory or --db, not both"
  [ -d "$SRC_DIR" ] || die "$SRC_DIR is not a directory"
  DB_FILE="$SRC_DIR/db.dump"
  [ -f "$SRC_DIR/uploads.tar.gz" ] && UPLOADS_FILE="$SRC_DIR/uploads.tar.gz"
fi
[ -s "$DB_FILE" ] || die "database dump $DB_FILE not found or empty"
[ -z "$UPLOADS_FILE" ] || [ -s "$UPLOADS_FILE" ] || die "uploads archive $UPLOADS_FILE not found or empty"

need_docker
need_env

info "About to REPLACE the live data of this stack ($ROOT_DIR) with a backup:"
info "  database : $DB_FILE"
info "  uploads  : ${UPLOADS_FILE:-(left untouched)}"
if [ "$ASSUME_YES" != 1 ]; then
  [ -t 0 ] || die "not running on a terminal: pass --yes to confirm non-interactively."
  printf 'This destroys the current database contents. Type RESTORE to continue: '
  read -r answer
  [ "$answer" = "RESTORE" ] || die "cancelled."
fi

on_exit() {
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '\nERROR: the restore did not finish (exit code %s). The app may be stopped and the database half-restored.\n' "$rc" >&2
    printf 'Fix the problem and run the restore again, or restore the safety backup / an older backup.\n' >&2
  fi
}
trap on_exit EXIT

if [ "$SAFETY" = 1 ]; then
  info "==> safety backup of the current state"
  "$SCRIPT_DIR/backup.sh" --label pre-restore || die "the safety backup failed; fix it or pass --no-safety-backup if the stack is broken."
fi

info "==> stopping the app"
dc stop app
dc up -d db
wait_healthy db 120 || die "the db container did not become healthy"

info "==> recreating the database from the dump"
# shellcheck disable=SC2016 # the variables are the container's own and must expand there
dc exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""'
# shellcheck disable=SC2016 # idem
dc exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' <"$DB_FILE"

if [ -n "$UPLOADS_FILE" ]; then
  info "==> replacing the uploads"
  dc run --rm --no-deps -T --entrypoint sh app -c 'find /data/uploads -mindepth 1 -delete && tar -xzf - -C /data/uploads' <"$UPLOADS_FILE"
fi

info "==> starting the app"
dc up -d app
wait_healthy app 180 || die "the app did not become healthy after the restore (docker compose logs app)"
dc up -d

trap - EXIT
info "Restore finished. users in the database: $(psql_db 'select count(*) from users')"
