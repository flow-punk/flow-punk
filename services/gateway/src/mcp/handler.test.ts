import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDEMPOTENCY_KEY_HEADER,
  invalidateToolsCacheIfRequired,
  INVALIDATE_TOOLS_HEADER,
  INVALIDATE_TOOLS_REASON_HEADER,
} from './handler.js';
import type { Env, AppContext } from '../types.js';

function makeKvStub(): { kv: KVNamespace; deletes: string[]; reads: Map<string, unknown>; writes: Map<string, string> } {
  const reads = new Map<string, unknown>();
  const writes = new Map<string, string>();
  const deletes: string[] = [];
  const kv = {
    async get(key: string, _type?: 'json') {
      return reads.get(key) ?? null;
    },
    async put(key: string, value: string) {
      writes.set(key, value);
    },
    async delete(key: string) {
      deletes.push(key);
    },
  } as unknown as KVNamespace;
  return { kv, deletes, reads, writes };
}

function makeCtx(env: Partial<Env> = {}, tenantId = 'ten_a'): AppContext {
  const fullEnv: Env = {
    CONTACTS_SERVICE: {} as Fetcher,
    PIPELINE_SERVICE: {} as Fetcher,
    AUTOMATIONS_SERVICE: {} as Fetcher,
    AUTH_SERVICE: {} as Fetcher,
    FORMINPUTS_SERVICE: {} as Fetcher,
    CMS_SERVICE: {} as Fetcher,
    USERS_SERVICE: {} as Fetcher,
    MCP_TOOLS_KV: {} as KVNamespace,
    MCP_SESSIONS_KV: {} as KVNamespace,
    MCP_SESSION_DO: {} as DurableObjectNamespace,
    DB: {} as D1Database,
    MAX_REQUEST_BODY_BYTES: '0',
    SERVICE_TIMEOUT_MS: '0',
    ALLOWED_ORIGINS: '',
    MCP_TOOLS_DYNAMIC_SERVICES: '',
    EDITION: 'all',
    ...env,
  };
  return {
    request: new Request('http://internal/'),
    env: fullEnv,
    requestId: 'req_test',
    tenantId,
  };
}

test('invalidateToolsCacheIfRequired deletes tenant-keyed cache when header set', async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv }, 'ten_x');
  const headers = new Headers({
    [INVALIDATE_TOOLS_HEADER]: 'true',
    [INVALIDATE_TOOLS_REASON_HEADER]: 'persons_table_mutated',
  });
  await invalidateToolsCacheIfRequired(headers, ctx);
  assert.deepEqual(deletes, ['mcp:tools:ten_x']);
});

test('invalidateToolsCacheIfRequired no-ops when header absent', async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv });
  await invalidateToolsCacheIfRequired(new Headers(), ctx);
  assert.equal(deletes.length, 0);
});

test('invalidateToolsCacheIfRequired no-ops when tenantId missing', async () => {
  const { kv, deletes } = makeKvStub();
  const ctx = makeCtx({ MCP_TOOLS_KV: kv });
  ctx.tenantId = undefined;
  const headers = new Headers({ [INVALIDATE_TOOLS_HEADER]: 'true' });
  await invalidateToolsCacheIfRequired(headers, ctx);
  assert.equal(deletes.length, 0);
});

test('IDEMPOTENCY_KEY_HEADER constant matches X-Idempotency-Key (used by withIdempotency)', () => {
  // Documents the contract: gateway-synthesized header must match what
  // service-utils' withIdempotency reads by default.
  assert.equal(IDEMPOTENCY_KEY_HEADER, 'X-Idempotency-Key');
});
