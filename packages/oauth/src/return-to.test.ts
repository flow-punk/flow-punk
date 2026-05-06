import assert from 'node:assert/strict';
import test from 'node:test';

import { validateReturnTo } from './return-to.js';

const ISSUER = 'https://flowpunk-gateway.mark-29f.workers.dev';

test('validateReturnTo accepts a same-origin relative path', () => {
  const result = validateReturnTo('/oauth/authorize?client_id=x&state=s', ISSUER);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, `${ISSUER}/oauth/authorize?client_id=x&state=s`);
  }
});

test('validateReturnTo accepts a same-origin absolute URL', () => {
  const target = `${ISSUER}/oauth/authorize?client_id=x`;
  const result = validateReturnTo(target, ISSUER);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.url, target);
});

test('validateReturnTo preserves query string and fragment on accept', () => {
  const result = validateReturnTo(
    '/oauth/authorize?a=1&b=2#consent',
    ISSUER,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.url, `${ISSUER}/oauth/authorize?a=1&b=2#consent`);
  }
});

test('validateReturnTo rejects null/undefined/empty', () => {
  assert.equal(validateReturnTo(null, ISSUER).ok, false);
  assert.equal(validateReturnTo(undefined, ISSUER).ok, false);
  assert.equal(validateReturnTo('', ISSUER).ok, false);
});

test('validateReturnTo rejects a cross-origin absolute URL', () => {
  assert.equal(
    validateReturnTo('https://attacker.example/path', ISSUER).ok,
    false,
  );
});

test('validateReturnTo rejects javascript: scheme (XSS primitive)', () => {
  // The `URL` constructor parses `javascript:alert(1)` successfully;
  // its `.origin` is the literal string "null", which trivially fails
  // the same-origin check. Belt-and-suspenders: this test pins the
  // behavior so future refactors can't accidentally accept it.
  assert.equal(validateReturnTo('javascript:alert(1)', ISSUER).ok, false);
});

test('validateReturnTo rejects data: URLs', () => {
  assert.equal(
    validateReturnTo('data:text/html,<script>alert(1)</script>', ISSUER).ok,
    false,
  );
});

test('validateReturnTo rejects protocol-relative `//host` (cross-origin smuggle)', () => {
  // `//evil.example/path` resolves under the issuer base to evil.example.
  // Strict origin equality rejects it.
  assert.equal(validateReturnTo('//evil.example/path', ISSUER).ok, false);
});

test('validateReturnTo rejects scheme downgrade (http:// when issuer is https://)', () => {
  assert.equal(
    validateReturnTo('http://flowpunk-gateway.mark-29f.workers.dev/x', ISSUER)
      .ok,
    false,
  );
});

test('validateReturnTo rejects `/auth/login` itself (no recursion)', () => {
  assert.equal(validateReturnTo('/auth/login', ISSUER).ok, false);
  assert.equal(
    validateReturnTo(`${ISSUER}/auth/login?error=x`, ISSUER).ok,
    false,
  );
});

test('validateReturnTo strips/encodes CRLF so Location header injection is impossible', () => {
  // The WHATWG `URL` constructor removes raw CR/LF/TAB from inputs
  // (not percent-encoded — actually stripped). The canonical form returned
  // here is therefore safe to drop into a `Location:` header without
  // splitting the response. We only need to assert that no raw CR/LF
  // survives.
  const result = validateReturnTo('/path\r\nX-Injected: yes', ISSUER);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(!result.url.includes('\r'), 'CR must not appear in canonical URL');
    assert.ok(!result.url.includes('\n'), 'LF must not appear in canonical URL');
  }
});

test('validateReturnTo rejects malformed input that throws on parse', () => {
  // The base + relative parse usually succeeds; force a true throw with
  // a control-character-laden absolute URL. Either rejected or parsed —
  // we only require the function not to throw.
  const result = validateReturnTo('https://[invalid', ISSUER);
  assert.equal(result.ok, false);
});
