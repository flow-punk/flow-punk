import assert from 'node:assert/strict';
import test from 'node:test';

import { parseIfMatchVersion } from './_shared.js';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/v1/custom-fields/defs/cfd_aaaaaaaaaaaaaaaaaaaaa', {
    method: 'PATCH',
    headers,
  });
}

test('parseIfMatchVersion returns null when header is missing', () => {
  assert.equal(parseIfMatchVersion(makeRequest({})), null);
});

test('parseIfMatchVersion accepts a bare integer string', () => {
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '1' })), 1);
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '42' })), 42);
});

test('parseIfMatchVersion accepts a quoted integer string', () => {
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '"7"' })), 7);
});

test('parseIfMatchVersion rejects non-integer values', () => {
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '' })), null);
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': 'abc' })), null);
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '1.5' })), null);
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '-1' })), null);
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '0' })), null);
});

test('parseIfMatchVersion tolerates whitespace', () => {
  assert.equal(parseIfMatchVersion(makeRequest({ 'If-Match': '  9  ' })), 9);
});
