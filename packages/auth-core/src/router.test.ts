import assert from 'node:assert/strict';
import test from 'node:test';

import { route } from './router.js';
import type { AuthEnv } from './types.js';

const env = {
  DB: {} as D1Database,
  LAST_USED_KV: {} as KVNamespace,
  AUTH_OPTIONS: { maxActiveKeys: 1 },
} satisfies AuthEnv;

test('/auth/validate rejects non-apikey credentialType before touching DB', async () => {
  const response = await route(
    new Request('http://internal/auth/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: 'mcp_example',
        credentialType: 'oauth',
      }),
    }),
    env,
  );
  assert.equal(response.status, 401);
});

test('/auth/validate rejects malformed fpk body before touching DB', async () => {
  const response = await route(
    new Request('http://internal/auth/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialType: 'apikey' }),
    }),
    env,
  );
  assert.equal(response.status, 401);
});
