import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptMetadata,
  isPubliclyExposed,
  scriptName,
} from './script-metadata.js';
import type { ResourceInventory } from '../types.js';

const inventory: ResourceInventory = {
  d1: { id: 'd1-uuid', name: 'flowpunk-indie' },
  kv: {
    MCP_TOOLS_KV: 'kv-mcp-tools',
    MCP_SESSIONS_KV: 'kv-mcp-sessions',
    LAST_USED_KV: 'kv-last-used',
    IDEMPOTENCY_KV: 'kv-idem',
    OAUTH_TOKEN_CACHE: 'kv-oauth',
  },
  workers: {
    gateway: { name: 'flowpunk-gateway' },
    auth: { name: 'flowpunk-auth' },
    contacts: { name: 'flowpunk-contacts' },
    pipeline: { name: 'flowpunk-pipeline' },
    users: { name: 'flowpunk-users' },
  },
  doMigrationTag: 'mcp-session-do-v1',
};

test('scriptName prefixes service correctly', () => {
  assert.equal(scriptName('flowpunk', 'gateway'), 'flowpunk-gateway');
  assert.equal(scriptName('flowpunk', 'auth'), 'flowpunk-auth');
  assert.equal(scriptName('myorg', 'contacts'), 'myorg-contacts');
});

test('isPubliclyExposed: only gateway is public', () => {
  assert.equal(isPubliclyExposed('gateway'), true);
  assert.equal(isPubliclyExposed('auth'), false);
  assert.equal(isPubliclyExposed('contacts'), false);
  assert.equal(isPubliclyExposed('pipeline'), false);
  assert.equal(isPubliclyExposed('users'), false);
});

test('gateway metadata has EXACTLY 4 service bindings — never 7', () => {
  const meta = buildScriptMetadata({
    service: 'gateway',
    inventory,
    gatewayUrl: 'https://flowpunk-gateway.example.workers.dev',
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });
  const services = (meta.bindings ?? []).filter((b) => b.type === 'service');
  assert.equal(
    services.length,
    4,
    'CF rejects bindings to non-existent target scripts; managed-only AUTOMATIONS_SERVICE / FORMINPUTS_SERVICE / CMS_SERVICE must NOT be present in indie metadata.',
  );
  assert.deepEqual(
    services.map((s) => s.name).sort(),
    ['AUTH_SERVICE', 'CONTACTS_SERVICE', 'PIPELINE_SERVICE', 'USERS_SERVICE'],
  );
});

test('gateway metadata includes DO migration step on fresh deploy (object, not array)', () => {
  const meta = buildScriptMetadata({
    service: 'gateway',
    inventory,
    gatewayUrl: 'https://flowpunk-gateway.example.workers.dev',
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });
  // CF's script-PUT API requires migrations as a single object, not an array.
  assert.equal(Array.isArray(meta.migrations), false);
  assert.equal(meta.migrations?.new_tag, 'mcp-session-do-v1');
  assert.deepEqual(meta.migrations?.new_sqlite_classes, [
    'McpSessionDurableObject',
  ]);
});

test('gateway metadata OMITS migrations on subsequent deploy', () => {
  const meta = buildScriptMetadata({
    service: 'gateway',
    inventory,
    gatewayUrl: 'https://flowpunk-gateway.example.workers.dev',
    isFreshDeploy: false,
    mainModuleFilename: 'index.js',
  });
  assert.equal(meta.migrations, undefined);
});

test('gateway metadata vars match wrangler.toml', () => {
  const meta = buildScriptMetadata({
    service: 'gateway',
    inventory,
    gatewayUrl: 'https://gw.example.workers.dev',
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });
  const plain = (meta.bindings ?? []).filter((b) => b.type === 'plain_text');
  const byName = new Map(plain.map((b) => [b.name, b.type === 'plain_text' ? b.text : '']));
  assert.equal(byName.get('MAX_REQUEST_BODY_BYTES'), '10485760');
  assert.equal(byName.get('SERVICE_TIMEOUT_MS'), '10000');
  assert.equal(byName.get('ALLOWED_ORIGINS'), 'https://gw.example.workers.dev');
  assert.equal(byName.get('MCP_TOOLS_DYNAMIC_SERVICES'), '');
  assert.equal(byName.get('EDITION'), 'all');
});

test('users service has EDITION=indie', () => {
  const meta = buildScriptMetadata({
    service: 'users',
    inventory,
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });
  const ed = (meta.bindings ?? []).find(
    (b) => b.type === 'plain_text' && b.name === 'EDITION',
  );
  if (!ed || ed.type !== 'plain_text') throw new Error('EDITION missing');
  assert.equal(ed.text, 'indie');
});

test('every service has a DB binding pointing at the indie D1', () => {
  for (const svc of ['gateway', 'auth', 'contacts', 'pipeline', 'users'] as const) {
    const meta = buildScriptMetadata({
      service: svc,
      inventory,
      gatewayUrl: 'https://gw.example.workers.dev',
      isFreshDeploy: true,
      mainModuleFilename: 'index.js',
    });
    const db = (meta.bindings ?? []).find((b) => b.name === 'DB');
    if (!db || db.type !== 'd1') throw new Error(`${svc} missing DB binding`);
    assert.equal(db.database_id, 'd1-uuid');
  }
});

test('compatibility_date is the canonical indie value', () => {
  const meta = buildScriptMetadata({
    service: 'auth',
    inventory,
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });
  assert.equal(meta.compatibility_date, '2025-06-01');
});
