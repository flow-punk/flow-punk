import assert from 'node:assert/strict';
import test from 'node:test';

import { route } from '../router.js';
import type { PipelineEnv } from '../types.js';

const stubEnv = {
  DB: {} as D1Database,
  IDEMPOTENCY_KV: {
    get: async () => null,
    put: async () => undefined,
  } as unknown as PipelineEnv['IDEMPOTENCY_KV'],
} satisfies PipelineEnv;

function withIdentity(
  url: string,
  init: RequestInit = {},
  extras: Record<string, string> = {},
): Request {
  const headers = new Headers(init.headers ?? {});
  headers.set('X-Tenant-Id', 'ten_a');
  headers.set('X-User-Id', 'usr_a');
  headers.set('X-Scope', 'write');
  headers.set('X-Credential-Type', 'apikey');
  headers.set('X-Credential-Id', 'cred_a');
  for (const [k, v] of Object.entries(extras)) headers.set(k, v);
  return new Request(url, { ...init, headers });
}

test('POST /mcp/execute without X-MCP-Session-Id returns 400 MISSING_SESSION', async () => {
  const response = await route(
    withIdentity('http://internal/mcp/execute', {
      method: 'POST',
      body: JSON.stringify({ name: 'deals_create', arguments: {} }),
      headers: { 'Content-Type': 'application/json' },
    }),
    stubEnv,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(body.isError, true);
  const inner = JSON.parse(body.content[0]!.text) as { error: { code: string } };
  assert.equal(inner.error.code, 'MISSING_SESSION');
});

test('POST /mcp/execute with invalid JSON body returns 400 INVALID_BODY', async () => {
  const response = await route(
    withIdentity(
      'http://internal/mcp/execute',
      {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      },
      { 'X-MCP-Session-Id': 'mcp_sess_abcdefghijklmnopqrstuv' },
    ),
    stubEnv,
  );
  assert.equal(response.status, 400);
});

test('POST /mcp/execute with unknown tool returns 404 UNKNOWN_TOOL', async () => {
  const response = await route(
    withIdentity(
      'http://internal/mcp/execute',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'definitely_not_a_tool' }),
        headers: { 'Content-Type': 'application/json' },
      },
      { 'X-MCP-Session-Id': 'mcp_sess_abcdefghijklmnopqrstuv' },
    ),
    stubEnv,
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as { content: Array<{ text: string }>; isError: boolean };
  const inner = JSON.parse(body.content[0]!.text) as { error: { code: string } };
  assert.equal(inner.error.code, 'UNKNOWN_TOOL');
});

test('GET /mcp/tools without identity returns 401', async () => {
  const response = await route(
    new Request('http://internal/mcp/tools'),
    stubEnv,
  );
  assert.equal(response.status, 401);
});

test('PUT /mcp/tools returns 405', async () => {
  const response = await route(
    withIdentity('http://internal/mcp/tools', { method: 'PUT' }),
    stubEnv,
  );
  assert.equal(response.status, 405);
});

test('GET /mcp/execute returns 405', async () => {
  const response = await route(
    withIdentity('http://internal/mcp/execute'),
    stubEnv,
  );
  assert.equal(response.status, 405);
});
