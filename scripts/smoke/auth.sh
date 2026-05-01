#!/usr/bin/env bash
# Smoke test for indie auth (api-key CRUD) via the indie gateway.
#
# Usage:
#   COOKIE=_system.<sessionId> bash indie/scripts/smoke/auth.sh
set -euo pipefail

GW="${GW:-http://127.0.0.1:8787}"
COOKIE="${COOKIE:-}"

if [[ -z "$COOKIE" ]]; then
  echo "FAIL: COOKIE env var required" >&2
  exit 2
fi

assert_status() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL [$label]: expected $expected got $actual" >&2
    return 1
  fi
  echo "OK  [$label]: $actual"
}

req() {
  local method="$1"; shift; local path="$1"; shift
  curl -sS -o /dev/null -w '%{http_code}' \
    -X "$method" \
    -H "Cookie: fp_session=$COOKIE" \
    -H "Content-Type: application/json" \
    "$GW$path" "$@"
}

req_unauth() {
  local method="$1"; shift; local path="$1"; shift
  curl -sS -o /dev/null -w '%{http_code}' \
    -X "$method" \
    -H "Content-Type: application/json" \
    "$GW$path" "$@"
}

# List — admin only.
assert_status 200 "$(req GET /api/v1/auth/keys)" 'GET /api/v1/auth/keys (admin)'

# No cookie → 401.
assert_status 401 "$(req_unauth GET /api/v1/auth/keys)" 'GET /api/v1/auth/keys (no cookie)'

# Bogus id → 404.
assert_status 404 "$(req GET /api/v1/auth/keys/apk_missing)" 'GET .../<missing>'

# Wrong method → 405.
assert_status 405 "$(req PUT /api/v1/auth/keys)" 'PUT /api/v1/auth/keys (405)'

echo "indie/auth smoke: PASS"
