import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseScopedCredential,
  API_KEY_PREFIX,
  OAUTH_TOKEN_PREFIX,
} from './extract-material.js';

test('parseScopedCredential splits <scope>.<payload>', () => {
  const result = parseScopedCredential('platform.sessabc');
  assert.deepEqual(result, { scope: 'platform', payload: 'sessabc' });
});

test('parseScopedCredential strips an optional prefix first', () => {
  const result = parseScopedCredential(`${API_KEY_PREFIX}ten_a.tokrand`, API_KEY_PREFIX);
  assert.deepEqual(result, { scope: 'ten_a', payload: 'tokrand' });
});

test('parseScopedCredential rejects when required prefix is missing', () => {
  assert.equal(
    parseScopedCredential('mcp_ten_a.tok', API_KEY_PREFIX),
    null,
  );
});

test('parseScopedCredential returns null on missing dot', () => {
  assert.equal(parseScopedCredential('platformsessabc'), null);
});

test('parseScopedCredential returns null on empty scope', () => {
  // `.payload` — leading dot ⇒ empty scope segment.
  assert.equal(parseScopedCredential('.sessabc'), null);
});

test('parseScopedCredential returns null on empty payload', () => {
  // `scope.` — trailing dot ⇒ empty payload segment.
  assert.equal(parseScopedCredential('platform.'), null);
});

test('parseScopedCredential accepts indie sentinel `_system`', () => {
  const result = parseScopedCredential('_system.sessabc');
  assert.deepEqual(result, { scope: '_system', payload: 'sessabc' });
});

test('parseScopedCredential handles OAuth tokens (mcp_<scope>.<random>)', () => {
  const result = parseScopedCredential(
    `${OAUTH_TOKEN_PREFIX}ten_xyz.AbCdEf123`,
    OAUTH_TOKEN_PREFIX,
  );
  assert.deepEqual(result, { scope: 'ten_xyz', payload: 'AbCdEf123' });
});

test('parseScopedCredential rejects empty input', () => {
  assert.equal(parseScopedCredential(''), null);
});

test('parseScopedCredential accepts a single-character scope (dot at index 1)', () => {
  // Boundary check on `dot < 1` — index 1 is allowed; index 0 (empty
  // scope) is the rejected case covered above.
  const result = parseScopedCredential('a.x');
  assert.deepEqual(result, { scope: 'a', payload: 'x' });
});

test('parseScopedCredential parses OAuth client_id format (mcpc_<scope>.<random>) when given the mcpc_ prefix', () => {
  // OAuth client_id uses `mcpc_` rather than the `mcp_` token prefix; the
  // same parser must handle it when callers pass the right prefix string.
  const result = parseScopedCredential('mcpc_ten_b.cli12345', 'mcpc_');
  assert.deepEqual(result, { scope: 'ten_b', payload: 'cli12345' });
});

test('parseScopedCredential treats only the FIRST dot as the delimiter', () => {
  // Random segments may include `=`/`-`/`_` (base64url) but no `.`. If
  // a stray dot sneaks in, only the first one splits — so `payload`
  // captures any remaining content. Defensive: ensures tamper attempts
  // that inject extra dots don't silently re-route to a different scope.
  const result = parseScopedCredential('ten_a.payload.with.dots');
  assert.deepEqual(result, { scope: 'ten_a', payload: 'payload.with.dots' });
});
