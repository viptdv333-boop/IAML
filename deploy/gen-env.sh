#!/usr/bin/env bash
# Creates the .env file for docker-compose.yml from deploy/.env.example, with freshly generated secrets.
#
# Usage:
#   deploy/gen-env.sh [--output FILE] [--local] [KEY=VALUE ...]
#
#   KEY=VALUE    set a variable that exists in deploy/.env.example, for example
#                  DOMAIN=iaml.example.org   ACME_EMAIL=you@example.org   MAIL_FROM='IAML <no-reply@iaml.example.org>'
#                DOMAIN, ACME_EMAIL, MAIL_FROM and RESEND_API_KEY may also be given as environment variables.
#                (Better not to pass RESEND_API_KEY on the command line: it ends up in the shell history.
#                 Edit .env with nano instead.)
#   --output F   write to F instead of <repo>/.env
#   --local      throw-away values for the local smoke test (docker-compose.local.yml); writes deploy/local.env
#                unless --output is given
#
# POSTGRES_PASSWORD and SESSION_SECRET are generated here (openssl rand) and cannot be passed as arguments.
# An existing file is NEVER overwritten. The new file is created with permissions 600. Nothing is printed
# that could reveal a secret.
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

rand_hex() { # rand_hex BYTES -> 2*BYTES hexadecimal characters
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# dotenv_quote VALUE -> VALUE as it must be written into a .env file
dotenv_quote() {
  local v="$1"
  case "$v" in
    *"'"*) die "a value must not contain a single quote: $v" ;;
    *$'\n'* | *$'\r'*) die "a value must not contain a line break" ;;
  esac
  if [[ "$v" =~ ^[A-Za-z0-9_./:@+,=-]*$ ]]; then
    printf '%s' "$v"
  else
    printf "'%s'" "$v"
  fi
}

declare -A vals=()
OUT=""
LOCAL=0

# environment pass-through (command-line arguments win)
for k in DOMAIN ACME_EMAIL MAIL_FROM RESEND_API_KEY; do
  if [ -n "${!k:-}" ]; then vals[$k]="${!k}"; fi
done

while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help) usage; exit 0 ;;
    --local) LOCAL=1; shift ;;
    --output)
      [ $# -ge 2 ] || die "--output needs a file name"
      OUT="$(abspath "$2")"; shift 2 ;;
    POSTGRES_PASSWORD=* | SESSION_SECRET=*) die "${1%%=*} is generated automatically; to use your own value edit the file afterwards." ;;
    [A-Z]*=*)
      key="${1%%=*}"
      [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "bad variable name: $key"
      vals[$key]="${1#*=}"; shift ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

TEMPLATE="$SCRIPT_DIR/.env.example"
[ -f "$TEMPLATE" ] || die "template $TEMPLATE not found"

if [ "$LOCAL" = 1 ]; then
  [ -n "$OUT" ] || OUT="$SCRIPT_DIR/local.env"
  [ -n "${vals[DOMAIN]+x}" ] || vals[DOMAIN]="localhost"
  [ -n "${vals[ACME_EMAIL]+x}" ] || vals[ACME_EMAIL]="local-test@example.invalid"
  [ -n "${vals[RESEND_API_KEY]+x}" ] || vals[RESEND_API_KEY]="local-test-key-not-used"
  [ -n "${vals[MAIL_FROM]+x}" ] || vals[MAIL_FROM]="IAML Local <no-reply@localhost>"
  [ -n "${vals[HTTP_PORT]+x}" ] || vals[HTTP_PORT]="18080"
fi
[ -n "$OUT" ] || OUT="$ROOT_DIR/.env"

if [ -n "${vals[DOMAIN]:-}" ] && [ -z "${vals[MAIL_FROM]:-}" ]; then
  vals[MAIL_FROM]="IAML <no-reply@${vals[DOMAIN]}>"
fi

[ ! -e "$OUT" ] || die "$OUT already exists - refusing to overwrite it. Move it away or edit it by hand."

# every KEY given must exist in the template (catches typos)
known="$(grep -oE '^#?[A-Z][A-Z0-9_]*=' "$TEMPLATE" | tr -d '#=')"
for k in "${!vals[@]}"; do
  printf '%s\n' "$known" | grep -qx "$k" || die "unknown variable $k (see deploy/.env.example for the list)"
done

vals[POSTGRES_PASSWORD]="$(rand_hex 24)"
vals[SESSION_SECRET]="$(rand_hex 32)"

umask 077
tmp="$(mktemp "$OUT.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}" # tolerate a template checked out with Windows line endings
  if [[ "$line" =~ ^#?([A-Z][A-Z0-9_]*)= ]]; then
    key="${BASH_REMATCH[1]}"
    if [ -n "${vals[$key]+x}" ]; then
      line="$key=$(dotenv_quote "${vals[$key]}")"
    fi
  fi
  printf '%s\n' "$line"
done <"$TEMPLATE" >"$tmp"
chmod 600 "$tmp"
mv -- "$tmp" "$OUT"
trap - EXIT

info "Created $OUT (permissions 600; POSTGRES_PASSWORD and SESSION_SECRET were generated)."
missing="$(grep -E '^(DOMAIN|ACME_EMAIL|RESEND_API_KEY|MAIL_FROM)=$' "$OUT" | tr -d '=' | tr '\n' ' ' || true)"
if [ -n "$missing" ]; then
  info "Still to fill in by hand (nano $OUT): $missing"
fi
if [ "$LOCAL" = 1 ]; then
  info "Local test: docker compose --env-file deploy/local.env -f docker-compose.yml -f docker-compose.local.yml up -d --build"
else
  info "Next: docker compose up -d --build   (see docs/DEPLOY.md, step 8)"
fi
