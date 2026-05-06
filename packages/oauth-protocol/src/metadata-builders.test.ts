import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProtectedResourceMetadata,
  buildAuthorizationServerMetadata,
} from './metadata-builders.js';

describe('buildProtectedResourceMetadata', () => {
  it('returns RFC 9728 fields', () => {
    const m = buildProtectedResourceMetadata({
      resource: 'https://example.com/mcp',
      authorizationServers: ['https://example.com'],
      scopesSupported: ['mcp'],
    });
    assert.equal(m.resource, 'https://example.com/mcp');
    assert.deepEqual(m.authorization_servers, ['https://example.com']);
    assert.deepEqual(m.scopes_supported, ['mcp']);
    assert.deepEqual(m.bearer_methods_supported, ['header']);
  });
});

describe('buildAuthorizationServerMetadata', () => {
  it('returns RFC 8414 fields with sane defaults', () => {
    const m = buildAuthorizationServerMetadata({
      issuer: 'https://example.com',
      authorizationEndpoint: 'https://example.com/oauth/authorize',
      tokenEndpoint: 'https://example.com/oauth/token',
      registrationEndpoint: 'https://example.com/oauth/register',
      revocationEndpoint: 'https://example.com/oauth/revoke',
      scopesSupported: ['mcp', 'flowpunk'],
    });
    assert.equal(m.issuer, 'https://example.com');
    assert.deepEqual(m.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(m.response_types_supported, ['code']);
    assert.deepEqual(m.grant_types_supported, ['authorization_code', 'refresh_token']);
    assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none']);
    assert.deepEqual(m.scopes_supported, ['mcp', 'flowpunk']);
    assert.equal(m.registration_endpoint, 'https://example.com/oauth/register');
    assert.equal(m.revocation_endpoint, 'https://example.com/oauth/revoke');
    assert.deepEqual(m.revocation_endpoint_auth_methods_supported, ['none']);
  });
});
