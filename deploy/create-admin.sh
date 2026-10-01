#!/usr/bin/env bash
# Creates a verified administrator account, or promotes an existing account to administrator.
# Runs backend/scripts/create-admin.js inside the running app container.
#
# Usage: deploy/create-admin.sh --email a@b.org --first Ada --last Lovelace [--workplace "IAML"] [--password '...']
# Without --password a random password is generated and printed ONCE: log in at /admin.html and change it.
# (A password given on the command line stays in the shell history; prefer the generated one.)
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

if [ $# -gt 0 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
  usage
  exit 0
fi
if [ $# -eq 0 ]; then
  usage >&2
  exit 2
fi

need_docker
need_env
service_running app || die "the app container is not running (docker compose up -d)."
dc exec -T app node scripts/create-admin.js "$@"
