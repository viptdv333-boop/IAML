#!/usr/bin/env bash
# Updates the running site to the newest version of the repository:
#   backup -> git pull -> docker compose build -> up -d -> wait for /api/health -> status
#
# Usage: deploy/update.sh [--ref GIT_REF] [--no-backup] [--no-pull] [--no-prune]
#   --ref REF    check out REF (branch, tag or commit) instead of pulling the current branch.
#                ROLLBACK to the version that ran before the last update:
#                     deploy/update.sh --ref <commit printed as "previous version" by that update>
#                Back to the newest version afterwards:
#                     deploy/update.sh --ref main
#   --no-backup  skip the automatic backup (not recommended: database migrations are applied on start)
#   --no-pull    only rebuild and restart the current checkout (no git operations)
#   --no-prune   keep unused (dangling) docker images (by default `docker image prune -f` removes them; on a
#                shared Docker host that includes the dangling images of other projects)
#
# Database migrations run automatically when the new app starts and are not undone by a rollback of the code:
# if a rollback is needed after a migration ran, restore the pre-update backup (docs/OPERATIONS.md).
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

prev="unknown"

fail_update() {
  printf '\nERROR: %s\nLast log lines of the app:\n' "$1" >&2
  dc logs --tail=60 app >&2 || true
  if [ "$prev" != "unknown" ]; then
    printf '\nRollback to the previous version:  deploy/update.sh --ref %s\n' "$prev" >&2
  fi
  printf 'If the database was changed by the new version, restore the pre-update backup (docs/OPERATIONS.md).\n' >&2
  exit 1
}

# Everything below lives in a function that is called on the LAST line: bash has then read the whole script
# before `git pull` replaces this very file, so a self-updating run cannot execute a half-old, half-new script.
main() {
  local ref="" backup=1 pull=1 prune=1 new
  while [ $# -gt 0 ]; do
    case "$1" in
      -h | --help) usage; return 0 ;;
      --ref) [ $# -ge 2 ] || die "--ref needs a branch, tag or commit"; ref="$2"; shift 2 ;;
      --no-backup) backup=0; shift ;;
      --no-pull) pull=0; shift ;;
      --no-prune) prune=0; shift ;;
      *) die "unknown option: $1 (try --help)" ;;
    esac
  done

  need_docker
  need_env

  if [ "$pull" = 1 ] || [ -n "$ref" ]; then
    command -v git >/dev/null 2>&1 || die "git is not installed (apt-get install git)."
    [ -e "$ROOT_DIR/.git" ] || die "$ROOT_DIR is not a git checkout; use --no-pull."
    prev="$(git rev-parse --short HEAD)"
    if ! git diff --quiet || ! git diff --cached --quiet; then
      if git -c core.fileMode=false diff --quiet && git -c core.fileMode=false diff --cached --quiet; then
        die "only file permissions differ (chmod +x). Run once:  git config core.fileMode false   and start the update again."
      fi
      die "tracked files have local changes (git status). Settings belong in .env, which git ignores. Undo or stash the changes first."
    fi
  fi

  if [ "$backup" = 1 ]; then
    if service_running db && service_running app; then
      info "==> backup before the update"
      "$SCRIPT_DIR/backup.sh" --label pre-update || die "the backup failed; fix it, or use --no-backup if you accept the risk."
    else
      warn "the stack is not running: no pre-update backup was taken."
    fi
  fi

  if [ -n "$ref" ]; then
    info "==> checking out $ref"
    git fetch --tags --prune origin
    git checkout "$ref"
    if git symbolic-ref -q HEAD >/dev/null; then git pull --ff-only; fi
  elif [ "$pull" = 1 ]; then
    git symbolic-ref -q HEAD >/dev/null || die "detached HEAD (a pinned version is checked out). Run: deploy/update.sh --ref main"
    info "==> git pull"
    git pull --ff-only
  fi
  if [ "$pull" = 1 ] || [ -n "$ref" ]; then
    new="$(git rev-parse --short HEAD)"
  else
    new="(unchanged checkout)"
  fi

  info "==> building the image (a minute or two)"
  dc build --pull || die "the image build failed (see the output above). The running site was not touched; the checkout is at $new. To go back: deploy/update.sh --ref $prev"

  info "==> (re)starting the stack"
  dc up -d --remove-orphans || fail_update "docker compose could not start the stack."

  info "==> waiting for the app to become healthy"
  wait_healthy app 180 || fail_update "the app did not become healthy."

  if [ "$prune" = 1 ]; then
    docker image prune -f >/dev/null || true
  fi

  info
  dc ps
  info
  if [ "$prev" != "unknown" ]; then
    info "previous version: $prev"
    info "current version:  $new"
    info "Update finished. If something is wrong:  deploy/update.sh --ref $prev   (more: docs/OPERATIONS.md)"
  else
    info "Update finished (more: docs/OPERATIONS.md)."
  fi
}

main "$@"; exit $?
