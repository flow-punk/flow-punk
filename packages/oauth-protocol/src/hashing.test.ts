import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, sha256Base64Url, base64UrlEncode } from './hashing.js';

describe('sha256Hex', () => {
  it('hashes empty string', async () => {
    assert.equal(
      await sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('hashes "abc"', async () => {
    assert.equal(
      await sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('sha256Base64Url', () => {
  it('hashes "abc"', async () => {
    assert.equal(await sha256Base64Url('abc'), 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});

describe('base64UrlEncode', () => {
  it('encodes without padding', () => {
    assert.equal(base64UrlEncode(new Uint8Array([0xff, 0xff, 0xff])), '____');
  });
  it('uses URL-safe alphabet', () => {
    // bytes that produce + and / in standard base64
    assert.equal(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xbf])), '-_-_');
  });
});
