#!/usr/bin/env bash
# Smoke test for indie contacts CRUD via the indie gateway.
#
# Usage:
#   COOKIE=_system.<sessionId> bash indie/scripts/smoke/contacts.sh
#
# Prereqs:
#   - `pnpm --filter @flowpunk/gateway dev` running on 127.0.0.1:8787
#   - `pnpm --filter @flowpunk/contacts dev` running on 127.0.0.1:8788
#   - bootstrap session minted via `pnpm bootstrap:admin:indie -- --local`
#
# Asserts: 200/201 happy path, 401 missing cookie, 404 missing id, 405 wrong method.
set -euo pipefail

GW="${GW:-http://127.0.0.1:8787}"
COOKIE="${COOKIE:-}"

if [[ -z "$COOKIE" ]]; then
  echo "FAIL: COOKIE env var required (cookie value from bootstrap-admin)" >&2
  exit 2
fi

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL [$label]: expected $expected got $actual" >&2
    return 1
  fi
  echo "OK  [$label]: $actual"
}

req() {
  local method="$1"; shift
  local path="$1"; shift
  curl -sS -o /dev/null -w '%{http_code}' \
    -X "$method" \
    -H "Cookie: fp_session=$COOKIE" \
    -H "Content-Type: application/json" \
    "$GW$path" "$@"
}

req_unauth() {
  local method="$1"; shift
  local path="$1"; shift
  curl -sS -o /dev/null -w '%{http_code}' \
    -X "$method" \
    -H "Content-Type: application/json" \
    "$GW$path" "$@"
}

# Happy path — list (sessions reach /api/v1/accounts only after the session
# flag flip ships per ADR-013; this is here to fail loudly if it doesn't).
assert_status 200 "$(req GET /api/v1/accounts)" 'GET /api/v1/accounts (auth ok)'
assert_status 200 "$(req GET /api/v1/persons)" 'GET /api/v1/persons (auth ok)'

# Negative: missing cookie → 401.
assert_status 401 "$(req_unauth GET /api/v1/accounts)" 'GET /api/v1/accounts (no cookie)'

# Negative: bogus id → 404.
assert_status 404 "$(req GET /api/v1/persons/per_does_not_exist)" 'GET /api/v1/persons/<missing> (404)'

# Negative: PUT (not allowed) → 405.
assert_status 405 "$(req PUT /api/v1/persons)" 'PUT /api/v1/persons (405)'

echo "indie/contacts smoke: PASS"
