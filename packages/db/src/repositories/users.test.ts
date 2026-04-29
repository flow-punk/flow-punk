import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UsersRepoError,
  decodeCursor,
  encodeCursor,
  normalizeEmail,
} from './users.js';

test('cursor round-trips a {createdAt, id} payload', () => {
  const payload = { createdAt: '2026-04-29T12:00:00.000Z', id: 'usr_abc' };
  const encoded = encodeCursor(payload);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'base64url charset only');
  const decoded = decodeCursor(encoded);
  assert.deepEqual(decoded, payload);
});

test('decodeCursor rejects malformed base64', () => {
  assert.throws(
    () => decodeCursor('!!!not-base64!!!'),
    (err: unknown) =>
      err instanceof UsersRepoError && err.code === 'invalid_input',
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
      err instanceof UsersRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects extra keys (strict shape)', () => {
  const encoded = encodeCursorRaw({
    createdAt: '2026-04-29T12:00:00.000Z',
    id: 'usr_abc',
    rogue: true,
  });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof UsersRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects missing keys', () => {
  const encoded = encodeCursorRaw({ id: 'usr_abc' });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof UsersRepoError && err.code === 'invalid_input',
  );
});

test('decodeCursor rejects wrong types', () => {
  const encoded = encodeCursorRaw({ createdAt: 123, id: 'usr_abc' });
  assert.throws(
    () => decodeCursor(encoded),
    (err: unknown) =>
      err instanceof UsersRepoError && err.code === 'invalid_input',
  );
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Operator@Example.COM '), 'operator@example.com');
  assert.equal(normalizeEmail('plain@x.io'), 'plain@x.io');
  assert.equal(normalizeEmail(''), '');
});

test('UsersRepoError carries optional detailCode', () => {
  const e = new UsersRepoError('wrong_state', 'taken', 'EMAIL_TAKEN');
  assert.equal(e.code, 'wrong_state');
  assert.equal(e.detailCode, 'EMAIL_TAKEN');
});

function encodeCursorRaw(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
