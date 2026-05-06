import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptPutFormData,
  mergeBindings,
  normalizeBinding,
  type BindingMetadata,
} from './multipart.js';

test('mergeBindings appends new bindings', () => {
  const existing: BindingMetadata[] = [
    { name: 'DB', type: 'd1', database_id: 'db-id' },
  ];
  const updates: BindingMetadata[] = [
    { name: 'CACHE_KV', type: 'kv_namespace', namespace_id: 'kv-id' },
  ];
  const merged = mergeBindings(existing, updates);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((b) => b.name === 'DB'), existing[0]);
  assert.deepEqual(merged.find((b) => b.name === 'CACHE_KV'), updates[0]);
});

test('mergeBindings replaces by name (last wins)', () => {
  const existing: BindingMetadata[] = [
    { name: 'DB', type: 'd1', database_id: 'old-id' },
  ];
  const updates: BindingMetadata[] = [
    { name: 'DB', type: 'd1', database_id: 'new-id' },
  ];
  const merged = mergeBindings(existing, updates);
  assert.equal(merged.length, 1);
  const first = merged[0];
  if (!first || first.type !== 'd1') throw new Error('expected d1 binding');
  assert.equal(first.database_id, 'new-id');
});

test('mergeBindings preserves order: existing first, then new', () => {
  const existing: BindingMetadata[] = [
    { name: 'DB', type: 'd1', database_id: 'db-id' },
    { name: 'KV_A', type: 'kv_namespace', namespace_id: 'kv-a' },
  ];
  const updates: BindingMetadata[] = [
    { name: 'KV_B', type: 'kv_namespace', namespace_id: 'kv-b' },
  ];
  const merged = mergeBindings(existing, updates);
  assert.deepEqual(
    merged.map((b) => b.name),
    ['DB', 'KV_A', 'KV_B'],
  );
});

test('normalizeBinding tolerates legacy d1 `id` field', () => {
  const raw = { name: 'DB', type: 'd1', id: 'legacy-uuid' };
  const normalized = normalizeBinding(raw);
  assert.deepEqual(normalized, {
    name: 'DB',
    type: 'd1',
    database_id: 'legacy-uuid',
  });
});

test('normalizeBinding accepts durable_object_namespace', () => {
  const raw = {
    name: 'MCP_SESSION_DO',
    type: 'durable_object_namespace',
    class_name: 'McpSessionDurableObject',
  };
  const normalized = normalizeBinding(raw);
  assert.deepEqual(normalized, {
    name: 'MCP_SESSION_DO',
    type: 'durable_object_namespace',
    class_name: 'McpSessionDurableObject',
  });
});

test('normalizeBinding rejects unknown types', () => {
  assert.equal(normalizeBinding({ name: 'X', type: 'r2_bucket' }), null);
  assert.equal(normalizeBinding({ name: 'X' }), null);
  assert.equal(normalizeBinding(null), null);
});

test('buildScriptPutFormData produces metadata + body parts', async () => {
  const fd = buildScriptPutFormData({
    metadata: {
      main_module: 'worker.js',
      bindings: [{ name: 'DB', type: 'd1', database_id: 'db-id' }],
      compatibility_date: '2025-06-01',
      compatibility_flags: ['nodejs_compat'],
    },
    body: new TextEncoder().encode('export default { fetch() {} }'),
    mainModuleFilename: 'worker.js',
  });

  const metadataEntry = fd.get('metadata') as unknown as Blob | null;
  if (!metadataEntry) throw new Error('expected metadata part');
  const metadataText = await metadataEntry.text();
  const parsed = JSON.parse(metadataText);
  assert.equal(parsed.main_module, 'worker.js');
  assert.equal(parsed.bindings.length, 1);
  assert.equal(parsed.compatibility_date, '2025-06-01');
  assert.deepEqual(parsed.compatibility_flags, ['nodejs_compat']);

  const bodyEntry = fd.get('worker.js') as unknown as Blob | null;
  if (!bodyEntry) throw new Error('expected body part');
  const bodyText = await bodyEntry.text();
  assert.equal(bodyText, 'export default { fetch() {} }');
});
