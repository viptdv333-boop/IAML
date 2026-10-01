#!/usr/bin/env bash
# One-screen overview: containers, application health, database size, disk space, latest backup, version.
# Usage: deploy/status.sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

need_docker
need_env

info "== containers =="
dc ps

info
info "== app health (/api/health, from inside the container) =="
if service_running app; then
  dc exec -T app node -e "
fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health', { signal: AbortSignal.timeout(4000) })
  .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })
  .catch((e) => { console.log('unreachable:', e.message); process.exit(1); })" || true
else
  info "the app container is not running"
fi

info
info "== database =="
if service_running db; then
  info "size:  $(psql_db 'select pg_size_pretty(pg_database_size(current_database()))')"
  info "users: $(psql_db 'select count(*) from users')   mail queued/failed: $(psql_db "select count(*) filter (where status in ('queued','sending')) || ' / ' || count(*) filter (where status = 'failed') from mail_outbox")"
else
  info "the db container is not running"
fi

info
info "== disk =="
df -h "$ROOT_DIR" | sed -n '1,2p'
docker system df 2>/dev/null | sed -n '1,5p' || true

info
info "== backups (${BACKUP_DIR:-$ROOT_DIR/backups}) =="
latest="$(find "${BACKUP_DIR:-$ROOT_DIR/backups}" -mindepth 1 -maxdepth 1 -type d -name 'iaml-*' 2>/dev/null | sort | tail -n 1 || true)"
if [ -n "$latest" ]; then
  info "latest: $(basename "$latest")  ($(du -sh "$latest" | cut -f1))"
else
  info "no backups yet - run deploy/backup.sh"
fi

info
info "== version =="
git log -1 --format='%h  %cd  %s' --date=short 2>/dev/null || info "(not a git checkout)"
