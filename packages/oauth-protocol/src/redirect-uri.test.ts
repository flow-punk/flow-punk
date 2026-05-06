import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isLoopbackRedirectUri,
  isValidRegistrableRedirectUri,
  redirectUriMatches,
  validateRedirectUriList,
} from './redirect-uri.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(__dirname, '../test/vectors/redirect-uri.json'), 'utf8'),
) as {
  registrable: Array<{ uri: string; valid: boolean; reason: string }>;
  matching: Array<{ registered: string[]; inbound: string; matches: boolean; reason: string }>;
};

describe('isLoopbackRedirectUri', () => {
  it('accepts 127.0.0.1', () => assert.equal(isLoopbackRedirectUri('http://127.0.0.1/cb'), true));
  it('accepts 127.0.0.1 with port', () =>
    assert.equal(isLoopbackRedirectUri('http://127.0.0.1:8080/cb'), true));
  it('accepts [::1]', () => assert.equal(isLoopbackRedirectUri('http://[::1]/cb'), true));
  it('rejects localhost', () => assert.equal(isLoopbackRedirectUri('http://localhost/cb'), false));
  it('rejects https loopback', () =>
    assert.equal(isLoopbackRedirectUri('https://127.0.0.1/cb'), false));
});

describe('isValidRegistrableRedirectUri (vectors)', () => {
  for (const c of vectors.registrable) {
    it(`${c.uri} → valid=${c.valid} (${c.reason})`, () => {
      assert.equal(isValidRegistrableRedirectUri(c.uri), c.valid);
    });
  }
});

describe('redirectUriMatches (vectors)', () => {
  for (const c of vectors.matching) {
    it(`registered=${JSON.stringify(c.registered)} inbound=${c.inbound} → ${c.matches} (${c.reason})`, () => {
      assert.equal(redirectUriMatches(c.inbound, c.registered), c.matches);
    });
  }
});

describe('validateRedirectUriList', () => {
  it('rejects empty', () => {
    const r = validateRedirectUriList([]);
    assert.equal(r.ok, false);
  });
  it('accepts a valid set', () => {
    const r = validateRedirectUriList(['https://app.example.com/cb', 'http://127.0.0.1/cb']);
    assert.equal(r.ok, true);
  });
  it('rejects too many', () => {
    const many = Array.from({ length: 11 }, (_, i) => `https://a${i}.example.com/cb`);
    const r = validateRedirectUriList(many);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, 'too_many');
  });
  it('rejects too long', () => {
    const long = 'https://example.com/' + 'x'.repeat(2050);
    const r = validateRedirectUriList([long]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, 'too_long');
  });
});
