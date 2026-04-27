import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enforceRestScope,
  hasMcpAccess,
  hasScope,
  isValidApiKeyScope,
  requiredScopeFor,
} from './scope.js';

test('requiredScopeFor maps GET/HEAD/OPTIONS to read', () => {
  assert.equal(requiredScopeFor('GET'), 'read');
  assert.equal(requiredScopeFor('HEAD'), 'read');
  assert.equal(requiredScopeFor('OPTIONS'), 'read');
});

test('requiredScopeFor maps mutating methods to write', () => {
  assert.equal(requiredScopeFor('POST'), 'write');
  assert.equal(requiredScopeFor('PATCH'), 'write');
  assert.equal(requiredScopeFor('DELETE'), 'write');
});

test('hasScope and hasMcpAccess parse space-separated tokens', () => {
  assert.equal(hasScope('read write', 'read'), true);
  assert.equal(hasScope('read', 'write'), false);
  assert.equal(hasMcpAccess('mcp'), true);
  assert.equal(hasMcpAccess('read write'), false);
});

test('enforceRestScope returns null for read scope on GET', () => {
  assert.equal(enforceRestScope('GET', 'read'), null);
});

test('enforceRestScope returns null for write scope on POST', () => {
  assert.equal(enforceRestScope('POST', 'write'), null);
});

test('enforceRestScope returns 403 when scope is insufficient', () => {
  const response = enforceRestScope('POST', 'read');
  assert.ok(response);
  assert.equal(response!.status, 403);
});

test('enforceRestScope accepts admin scope token for read methods', () => {
  assert.equal(enforceRestScope('GET', 'admin'), null);
  assert.equal(enforceRestScope('HEAD', 'admin'), null);
});

test('enforceRestScope accepts admin scope token for write methods', () => {
  assert.equal(enforceRestScope('POST', 'admin'), null);
  assert.equal(enforceRestScope('PATCH', 'admin'), null);
  assert.equal(enforceRestScope('DELETE', 'admin'), null);
});

test('enforceRestScope accepts admin token alongside other tokens', () => {
  assert.equal(enforceRestScope('GET', 'read admin'), null);
  assert.equal(enforceRestScope('POST', 'admin write'), null);
});

test('isValidApiKeyScope rejects admin scope', () => {
  assert.equal(isValidApiKeyScope('admin'), false);
  assert.equal(isValidApiKeyScope('read admin'), false);
  assert.equal(isValidApiKeyScope('admin write'), false);
});

test('isValidApiKeyScope still accepts read/write combinations', () => {
  assert.equal(isValidApiKeyScope('read'), true);
  assert.equal(isValidApiKeyScope('read write'), true);
  assert.equal(isValidApiKeyScope('write'), true);
  assert.equal(isValidApiKeyScope(''), false);
});
