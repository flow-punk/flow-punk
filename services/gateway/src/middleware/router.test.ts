import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppContext, Env } from '../types.js';
import { dispatchIndieRoute } from './router.js';

function makeCtx(pathname: string, env: Partial<Env> = {}): AppContext {
  const fullEnv = {
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
    EDITION: 'all' as const,
    ...env,
  } satisfies Env;
  return {
    request: new Request(`http://localhost:8787${pathname}`),
    env: fullEnv,
    requestId: 'req_test',
  };
}

test('dispatchIndieRoute: /openapi.json returns 200 JSON when OPENAPI_ENABLED=1', async () => {
  const response = await dispatchIndieRoute(makeCtx('/api/openapi.json', { OPENAPI_ENABLED: '1' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
});

test('dispatchIndieRoute: /docs returns 200 HTML when OPENAPI_ENABLED=1', async () => {
  const response = await dispatchIndieRoute(makeCtx('/api/docs', { OPENAPI_ENABLED: '1' }));
  assert.equal(response.status, 200);
  const ct = response.headers.get('Content-Type') ?? '';
  assert.ok(ct.startsWith('text/html'));
});

test('dispatchIndieRoute: /openapi.json returns 404 when OPENAPI_ENABLED is unset (deploy-equivalent)', async () => {
  const response = await dispatchIndieRoute(makeCtx('/api/openapi.json'));
  assert.equal(response.status, 404);
});

test('dispatchIndieRoute: /docs returns 404 when OPENAPI_ENABLED is unset', async () => {
  const response = await dispatchIndieRoute(makeCtx('/api/docs'));
  assert.equal(response.status, 404);
});

test('dispatchIndieRoute: /openapi.json returns 404 when OPENAPI_ENABLED is set to non-"1" value', async () => {
  const response = await dispatchIndieRoute(makeCtx('/api/openapi.json', { OPENAPI_ENABLED: 'true' }));
  assert.equal(response.status, 404);
});

test('dispatchIndieRoute: /health still returns 200 ok (regression)', async () => {
  const response = await dispatchIndieRoute(makeCtx('/health'));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string };
  assert.equal(body.status, 'ok');
});

test('dispatchIndieRoute: unknown path returns 404 (regression)', async () => {
  const response = await dispatchIndieRoute(makeCtx('/unknown/path'));
  assert.equal(response.status, 404);
});

test('dispatchIndieRoute: legacy /openapi.json returns 404 even with OPENAPI_ENABLED=1 (path moved to /api/openapi.json)', async () => {
  const response = await dispatchIndieRoute(makeCtx('/openapi.json', { OPENAPI_ENABLED: '1' }));
  assert.equal(response.status, 404);
});

test('dispatchIndieRoute: legacy /docs returns 404 even with OPENAPI_ENABLED=1 (path moved to /api/docs)', async () => {
  const response = await dispatchIndieRoute(makeCtx('/docs', { OPENAPI_ENABLED: '1' }));
  assert.equal(response.status, 404);
});
