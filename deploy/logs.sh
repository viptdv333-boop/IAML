#!/usr/bin/env bash
# Follows the logs of the stack. Press Ctrl+C to stop.
# Usage: deploy/logs.sh [SERVICE ...] [docker compose logs options]
#   deploy/logs.sh               the app (default)
#   deploy/logs.sh caddy         the web server / HTTPS certificates / access log
#   deploy/logs.sh db app        several services at once
#   deploy/logs.sh app --since 1h --no-follow     (last hour, then exit)
# Options understood by this script itself: --no-follow
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

need_docker
need_env

follow=(-f)
args=()
for a in "$@"; do
  if [ "$a" = "--no-follow" ]; then follow=(); else args+=("$a"); fi
done
if [ "${#args[@]}" -eq 0 ]; then args=(app); fi

exec docker compose logs --tail=200 "${follow[@]}" "${args[@]}"
