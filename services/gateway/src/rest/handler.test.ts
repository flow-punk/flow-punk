import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppContext, Env } from '../types.js';
import { bindingForPath } from './handler.js';

/**
 * Each binding is a unique sentinel so tests can identify which env slot
 * `bindingForPath` resolved without comparing real Fetcher implementations.
 */
function makeCtx(): AppContext {
  const sentinels = {
    CONTACTS_SERVICE: { tag: 'CONTACTS_SERVICE' } as unknown as Fetcher,
    PIPELINE_SERVICE: { tag: 'PIPELINE_SERVICE' } as unknown as Fetcher,
    AUTOMATIONS_SERVICE: { tag: 'AUTOMATIONS_SERVICE' } as unknown as Fetcher,
    AUTH_SERVICE: { tag: 'AUTH_SERVICE' } as unknown as Fetcher,
    FORMINPUTS_SERVICE: { tag: 'FORMINPUTS_SERVICE' } as unknown as Fetcher,
    CMS_SERVICE: { tag: 'CMS_SERVICE' } as unknown as Fetcher,
  };
  const env = {
    ...sentinels,
    MCP_TOOLS_KV: {} as KVNamespace,
    MCP_SESSIONS_KV: {} as KVNamespace,
    MCP_SESSION_DO: {} as DurableObjectNamespace,
    DB: {} as D1Database,
    MAX_REQUEST_BODY_BYTES: '0',
    SERVICE_TIMEOUT_MS: '0',
    ALLOWED_ORIGINS: '',
  } satisfies Env;
  return {
    request: new Request('http://internal/'),
    env,
    requestId: 'req_test',
  };
}

test('bindingForPath dispatches /api/v1/accounts (collection) to CONTACTS_SERVICE', () => {
  const binding = bindingForPath('/api/v1/accounts', makeCtx());
  assert.equal((binding as unknown as { tag: string }).tag, 'CONTACTS_SERVICE');
});

test('bindingForPath dispatches /api/v1/accounts/abc (item) to CONTACTS_SERVICE', () => {
  const binding = bindingForPath('/api/v1/accounts/abc', makeCtx());
  assert.equal((binding as unknown as { tag: string }).tag, 'CONTACTS_SERVICE');
});

test('bindingForPath dispatches /api/v1/persons (collection) to CONTACTS_SERVICE', () => {
  const binding = bindingForPath('/api/v1/persons', makeCtx());
  assert.equal((binding as unknown as { tag: string }).tag, 'CONTACTS_SERVICE');
});

test('bindingForPath dispatches /api/v1/persons/abc (item) to CONTACTS_SERVICE', () => {
  const binding = bindingForPath('/api/v1/persons/abc', makeCtx());
  assert.equal((binding as unknown as { tag: string }).tag, 'CONTACTS_SERVICE');
});

test('bindingForPath returns null for legacy /api/v1/people path', () => {
  const binding = bindingForPath('/api/v1/people', makeCtx());
  assert.equal(binding, null);
});

test('bindingForPath returns null for /api/v1/accountsX (no false-positive prefix match)', () => {
  const binding = bindingForPath('/api/v1/accountsX', makeCtx());
  assert.equal(binding, null);
});

test('bindingForPath returns null for /unknown', () => {
  const binding = bindingForPath('/unknown', makeCtx());
  assert.equal(binding, null);
});
