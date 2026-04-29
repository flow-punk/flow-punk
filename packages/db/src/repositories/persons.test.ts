import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PersonsRepoError,
  decodeCursor,
  encodeCursor,
} from './persons.js';

test('cursor round-trips a {createdAt, id} payload', () => {
  const payload = { createdAt: '2026-04-28T12:00:00.000Z', id: 'per_abc' };
  const encoded = encodeCursor(payload);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'base64url charset only');
  const decoded = decodeCursor(encoded);
  assert.deepEqual(decoded, payload);
});

test('decodeCursor rejects malformed base64', () => {
  assert.throws(
    () => decodeCursor('!!!not-base64!!!'),
    (err: unknown) =>
      err instanceof PersonsRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects non-JSON payload', () => {
  const encoded = Buffer.from('not-json', 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof PersonsRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects extra keys (strict shape)', () => {
  const encoded = encodeCursorRaw({
    createdAt: '2026-04-28T12:00:00.000Z',
    id: 'per_abc',
    includeDeleted: true,
  });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof PersonsRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects missing keys', () => {
  const encoded = encodeCursorRaw({ id: 'per_abc' });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof PersonsRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects wrong types', () => {
  const encoded = encodeCursorRaw({ createdAt: 123, id: 'per_abc' });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof PersonsRepoError && err.code === 'invalid_input',
  );
});

function encodeCursorRaw(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
