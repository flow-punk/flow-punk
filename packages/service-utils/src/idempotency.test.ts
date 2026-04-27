import assert from 'node:assert/strict';
import test from 'node:test';

import { withIdempotency, type IdempotencyKvNamespace } from './idempotency.js';

function makeKv(): IdempotencyKvNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(
      key: string,
      value: string,
      _options?: { expirationTtl?: number },
    ): Promise<void> {
      store.set(key, value);
    },
  };
}

function makeRequest(
  method: string,
  body: string | null,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://internal/api/v1/tenants', {
    method,
    headers,
    body,
  });
}

test('withIdempotency bypasses caching when header is absent', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response('{"ok":true}', { status: 201 });
  };

  const r1 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}'),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const r2 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}'),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );

  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.equal(callCount, 2);
  assert.equal(kv._store.size, 0);
});

test('withIdempotency caches response and replays with header on hit', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response('{"id":"ten_1"}', { status: 201 });
  };

  const headers = { 'X-Idempotency-Key': 'key-1' };
  const r1 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const r2 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );

  assert.equal(callCount, 1);
  assert.equal(r1.status, 201);
  assert.equal(r1.headers.get('Idempotency-Replayed'), null);
  assert.equal(r2.status, 201);
  assert.equal(r2.headers.get('Idempotency-Replayed'), 'true');
  assert.equal(await r2.text(), '{"id":"ten_1"}');
});

test('withIdempotency returns 422 when same key is reused with different body', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response('{"id":"ten_1"}', { status: 201 });
  };

  const headers = { 'X-Idempotency-Key': 'key-1' };
  await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const r2 = await withIdempotency(
    makeRequest('POST', '{"slug":"different"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );

  assert.equal(callCount, 1);
  assert.equal(r2.status, 422);
  const body = (await r2.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'IDEMPOTENCY_KEY_REUSED');
});

test('withIdempotency does not cache 5xx responses', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response('{"error":"boom"}', { status: 500 });
  };

  const headers = { 'X-Idempotency-Key': 'key-1' };
  const r1 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const r2 = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );

  assert.equal(callCount, 2);
  assert.equal(r1.status, 500);
  assert.equal(r2.status, 500);
  assert.equal(kv._store.size, 0);
});

test('withIdempotency does cache 4xx responses (validation error pinning)', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response('{"error":"INVALID_SLUG"}', { status: 400 });
  };

  const headers = { 'X-Idempotency-Key': 'key-1' };
  await withIdempotency(
    makeRequest('POST', '{"slug":"BAD"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const r2 = await withIdempotency(
    makeRequest('POST', '{"slug":"BAD"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );

  assert.equal(callCount, 1);
  assert.equal(r2.status, 400);
  assert.equal(r2.headers.get('Idempotency-Replayed'), 'true');
});

test('withIdempotency isolates by scopeKey (no cross-tenant collision)', async () => {
  const kv = makeKv();
  let callCount = 0;
  const handler = async (): Promise<Response> => {
    callCount++;
    return new Response(`{"caller":"${callCount}"}`, { status: 201 });
  };

  const headers = { 'X-Idempotency-Key': 'key-1' };
  const tenantA = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  const tenantB = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', headers),
    kv,
    handler,
    { scopeKey: 'ten_b:usr_b' },
  );

  assert.equal(callCount, 2);
  assert.equal(await tenantA.text(), '{"caller":"1"}');
  assert.equal(await tenantB.text(), '{"caller":"2"}');
});

test('withIdempotency rejects empty idempotency key with 400', async () => {
  const kv = makeKv();
  const handler = async (): Promise<Response> => {
    throw new Error('handler should not run');
  };

  const r = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', { 'X-Idempotency-Key': '' }),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  assert.equal(r.status, 400);
  const body = (await r.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'INVALID_IDEMPOTENCY_KEY');
});

test('withIdempotency rejects over-length idempotency key with 400', async () => {
  const kv = makeKv();
  const handler = async (): Promise<Response> => {
    throw new Error('handler should not run');
  };

  const overLong = 'x'.repeat(256);
  const r = await withIdempotency(
    makeRequest('POST', '{"slug":"acme"}', { 'X-Idempotency-Key': overLong }),
    kv,
    handler,
    { scopeKey: 'ten_a:usr_a' },
  );
  assert.equal(r.status, 400);
});
