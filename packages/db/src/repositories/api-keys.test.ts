import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStoredScopes } from './api-keys.js';

test('parseStoredScopes accepts canonical read/write scopes', () => {
  assert.deepEqual(parseStoredScopes('["read","write"]'), ['read', 'write']);
});

test('parseStoredScopes deduplicates scopes without changing order', () => {
  assert.deepEqual(parseStoredScopes('["read","read","write"]'), [
    'read',
    'write',
  ]);
});

test('parseStoredScopes rejects admin scope for API keys', () => {
  assert.equal(parseStoredScopes('["admin"]'), null);
});

test('parseStoredScopes rejects malformed and empty scope JSON', () => {
  assert.equal(parseStoredScopes('not-json'), null);
  assert.equal(parseStoredScopes('[]'), null);
});
