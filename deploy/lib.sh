# shellcheck shell=bash
# Shared helpers for the deploy/*.sh scripts. This file is SOURCED by them; it is not meant to be run.
#
# The scripts always work from the repository root (the directory with docker-compose.yml and .env), whatever
# the current directory is. To point them at another stack (for example the local test stack) use the standard
# Docker Compose variables, which `docker compose` reads by itself:
#   COMPOSE_FILE, COMPOSE_PROJECT_NAME, COMPOSE_ENV_FILES, COMPOSE_PATH_SEPARATOR

ORIG_PWD="$PWD"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/deploy"
export ROOT_DIR SCRIPT_DIR ORIG_PWD
cd "$ROOT_DIR" || exit 1

# Git Bash on Windows would rewrite container paths such as /data/uploads; a no-op everywhere else.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
info() { printf '%s\n' "$*"; }

dc() { docker compose "$@"; }

# abspath PATH -> PATH made absolute relative to the directory the script was started from
abspath() {
  case "$1" in
    /* | [A-Za-z]:[\\/]*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$ORIG_PWD" "$1" ;;
  esac
}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed (docs/DEPLOY.md, step 4)."
  docker compose version >/dev/null 2>&1 || die "the Docker Compose v2 plugin is missing (apt-get install docker-compose-plugin)."
  docker info >/dev/null 2>&1 || die "cannot talk to the Docker daemon: is it running, and is your user in the 'docker' group?"
}

need_env() {
  if [ -z "${COMPOSE_ENV_FILES:-}" ] && [ ! -f "$ROOT_DIR/.env" ]; then
    die "$ROOT_DIR/.env does not exist - create it with deploy/gen-env.sh (docs/DEPLOY.md, step 6)."
  fi
}

# service_running SERVICE -> success when the compose service has a running container
service_running() {
  [ -n "$(dc ps --status running -q "$1" 2>/dev/null)" ]
}

# wait_healthy SERVICE [TIMEOUT_SECONDS]
# Success once the service's container reports "healthy". Fails early when the container is unhealthy, has exited
# or is caught in a crash loop (seen "restarting" three times); otherwise fails after the timeout.
wait_healthy() {
  local svc="$1" timeout="${2:-120}" waited=0 cid state health restarts=0
  while [ "$waited" -lt "$timeout" ]; do
    cid="$(dc ps -q "$svc" 2>/dev/null | head -n 1 || true)"
    if [ -n "$cid" ]; then
      state="unknown"
      health="-"
      read -r state health < <(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$cid" 2>/dev/null || true) || true
      case "$health" in
        healthy) return 0 ;;
        unhealthy) return 1 ;;
        -) [ "$state" = "running" ] && return 0 ;;
        *) ;;
      esac
      case "$state" in
        exited | dead) return 1 ;;
        restarting)
          restarts=$((restarts + 1))
          [ "$restarts" -lt 3 ] || return 1
          ;;
        *) ;;
      esac
    fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

# psql_db SQL -> prints the single value returned by SQL (empty when the query fails)
psql_db() {
  # shellcheck disable=SC2016 # $POSTGRES_USER, $POSTGRES_DB and $1 must expand inside the container's shell
  dc exec -T db sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1" 2>/dev/null | tr -d '\r' || true
}
