import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCookiePayload, sha256Hex } from './seed-admin.js';

test('generateCookiePayload yields 32 chars, no = + /', () => {
  for (let i = 0; i < 50; i++) {
    const p = generateCookiePayload();
    assert.equal(p.length, 32);
    assert.doesNotMatch(p, /[=+/]/);
  }
});

test('sha256Hex matches the indie gateway derivation', async () => {
  // Reference: indie/services/gateway/src/auth/sha256.ts uses Web Crypto
  // and outputs lowercase hex, 2-char padded per byte. This mirrors that.
  const cookie = '_system.abc123';
  const node = sha256Hex(cookie);

  // Independent compute via Web Crypto (same algorithm, same input).
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(cookie),
  );
  let web = '';
  for (const b of new Uint8Array(buf)) {
    web += b.toString(16).padStart(2, '0');
  }

  assert.equal(node, web);
});

test('sha256Hex is lowercase hex, length 64', () => {
  const h = sha256Hex('any input');
  assert.match(h, /^[0-9a-f]{64}$/);
});
