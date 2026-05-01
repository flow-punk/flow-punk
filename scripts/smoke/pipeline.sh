#!/usr/bin/env bash
# Smoke test for indie pipeline CRUD via the indie gateway.
#
# Usage:
#   COOKIE=_system.<sessionId> bash indie/scripts/smoke/pipeline.sh
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

assert_status 200 "$(req GET /api/v1/pipelines)" 'GET /api/v1/pipelines'
assert_status 200 "$(req GET /api/v1/stages)" 'GET /api/v1/stages'
assert_status 200 "$(req GET /api/v1/deals)" 'GET /api/v1/deals'
assert_status 404 "$(req GET /api/v1/deals/dl_missing)" 'GET /api/v1/deals/<missing>'
assert_status 405 "$(req PUT /api/v1/pipelines)" 'PUT /api/v1/pipelines'

echo "indie/pipeline smoke: PASS"
