import assert from 'node:assert/strict';
import test from 'node:test';

import { route } from './router.js';
import type { ContactsEnv } from './types.js';

/**
 * Method-dispatch and identity-guard tests. Calls that would touch D1 are
 * not exercised here — those land in the repo unit tests, which validate
 * pure-function behavior. The handlers reached in this file all short-
 * circuit before hitting D1 in the failure paths we assert (no body, bad
 * cursor, unknown sub-resource).
 */
const stubEnv = {
  DB: {} as D1Database,
  IDEMPOTENCY_KV: {
    get: async () => null,
    put: async () => undefined,
  } as unknown as ContactsEnv['IDEMPOTENCY_KV'],
} satisfies ContactsEnv;

function withApikey(url: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers ?? {});
  headers.set('X-Tenant-Id', 'ten_a');
  headers.set('X-User-Id', 'usr_a');
  headers.set('X-Scope', 'read');
  headers.set('X-Credential-Type', 'apikey');
  return new Request(url, { ...init, headers });
}

test('GET /health returns 200 without identity headers', async () => {
  const response = await route(
    new Request('http://internal/health'),
    stubEnv,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; service: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, 'contacts');
});

test('non-health request without identity headers returns 401', async () => {
  const response = await route(
    new Request('http://internal/api/v1/accounts'),
    stubEnv,
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNAUTHENTICATED');
});

test('GET /api/v1/people returns 501 (not yet implemented)', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/people'),
    stubEnv,
  );
  assert.equal(response.status, 501);
});

test('GET /api/v1/accounts/:id with sub-path returns 404', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts/acct_x/people'),
    stubEnv,
  );
  assert.equal(response.status, 404);
});

test('PUT /api/v1/accounts returns 405', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts', { method: 'PUT' }),
    stubEnv,
  );
  assert.equal(response.status, 405);
  assert.ok(response.headers.get('Allow')?.includes('GET'));
});

test('GET /unknown with apikey identity returns 404', async () => {
  const response = await route(
    withApikey('http://internal/unknown'),
    stubEnv,
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('POST /health returns 405', async () => {
  const response = await route(
    new Request('http://internal/health', { method: 'POST' }),
    stubEnv,
  );
  assert.equal(response.status, 405);
});

test('POST /api/v1/accounts without body returns 400 INVALID_BODY', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts', { method: 'POST' }),
    stubEnv,
  );
  // No JSON body — repo never reached, returns 400 before touching D1.
  assert.equal(response.status, 400);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(body.error.code, 'INVALID_BODY');
});

test('GET /api/v1/accounts?limit=999 returns 400 INVALID_INPUT', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts?limit=999'),
    stubEnv,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(body.error.code, 'INVALID_INPUT');
});
