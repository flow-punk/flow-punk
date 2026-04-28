import assert from 'node:assert/strict';
import test from 'node:test';

import { route } from './router.js';
import type { ContactsEnv } from './types.js';

/**
 * The router only touches D1/KV via the idempotent wrapper, which Phase 2
 * never invokes. Stub bindings are sufficient — no real D1 or KV calls
 * happen during these tests.
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

test('GET /api/v1/accounts with apikey identity returns 501 NOT_IMPLEMENTED', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts'),
    stubEnv,
  );
  assert.equal(response.status, 501);
  const body = (await response.json()) as {
    success: boolean;
    error: { code: string };
  };
  assert.equal(body.error.code, 'NOT_IMPLEMENTED');
});

test('GET /api/v1/accounts/abc with apikey identity returns 501', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/accounts/abc'),
    stubEnv,
  );
  assert.equal(response.status, 501);
});

test('GET /api/v1/people with apikey identity returns 501', async () => {
  const response = await route(
    withApikey('http://internal/api/v1/people'),
    stubEnv,
  );
  assert.equal(response.status, 501);
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
