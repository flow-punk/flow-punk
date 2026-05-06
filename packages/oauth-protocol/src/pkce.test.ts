import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isValidPkceVerifier, pkceChallengeForVerifier, isSupportedPkceMethod } from './pkce.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(__dirname, '../test/vectors/pkce.json'), 'utf8'),
) as { vectors: Array<{ name: string; verifier: string; challenge: string | null }> };

describe('isValidPkceVerifier', () => {
  it('accepts valid 43-char verifier', () => {
    assert.equal(isValidPkceVerifier('a'.repeat(43)), true);
  });
  it('accepts max-length 128-char verifier', () => {
    assert.equal(isValidPkceVerifier('a'.repeat(128)), true);
  });
  it('rejects 42-char verifier (too short)', () => {
    assert.equal(isValidPkceVerifier('a'.repeat(42)), false);
  });
  it('rejects 129-char verifier (too long)', () => {
    assert.equal(isValidPkceVerifier('a'.repeat(129)), false);
  });
  it('rejects invalid characters', () => {
    assert.equal(isValidPkceVerifier(`${'a'.repeat(42)}!`), false);
  });
  it('accepts unreserved characters per RFC 7636', () => {
    assert.equal(isValidPkceVerifier('abcDEF123-._~' + 'a'.repeat(30)), true);
  });
});

describe('pkceChallengeForVerifier', () => {
  for (const v of vectors.vectors) {
    if (v.challenge === null) continue;
    it(`matches vector ${v.name}`, async () => {
      const ch = await pkceChallengeForVerifier(v.verifier);
      assert.equal(ch, v.challenge);
    });
  }
  it('rejects malformed verifier', async () => {
    await assert.rejects(() => pkceChallengeForVerifier('short'), /invalid_pkce_verifier/);
  });
});

describe('isSupportedPkceMethod', () => {
  it('only S256', () => {
    assert.equal(isSupportedPkceMethod('S256'), true);
    assert.equal(isSupportedPkceMethod('plain'), false);
    assert.equal(isSupportedPkceMethod(null), false);
    assert.equal(isSupportedPkceMethod(undefined), false);
  });
});
