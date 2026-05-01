import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildToolRegistry,
  createMcpToolAdapter,
  type McpToolState,
  type ToolMetadata,
} from './index.js';

test('buildToolRegistry trims out-of-scope domains', () => {
  const registry = buildToolRegistry('all');
  const domains = new Set(registry.domainSeeds.map((seed) => seed.name));
  assert.deepEqual([...domains].sort(), ['contacts', 'pipeline']);
  assert.equal(registry.staticExecutableTools.some((tool) => tool.domain === 'cms'), false);
  assert.equal(registry.staticExecutableTools.some((tool) => tool.domain === 'forms'), false);
  assert.equal(registry.staticExecutableTools.some((tool) => tool.domain === 'automations'), false);
});

test("buildToolRegistry('all') includes only edition='all' tools", () => {
  const registry = buildToolRegistry('all');
  for (const tool of registry.staticExecutableTools) {
    assert.equal(tool.edition, 'all', `tool ${tool.name} should be edition=all`);
  }
});

test("buildToolRegistry('managed') is a superset of 'all'", () => {
  const all = buildToolRegistry('all');
  const managed = buildToolRegistry('managed');
  for (const tool of all.staticExecutableTools) {
    assert.ok(
      managed.staticExecutableTools.some((m) => m.name === tool.name),
      `managed registry must include ${tool.name}`,
    );
  }
});

test('adapter listAvailableTools includes domain tools + tools_search only', () => {
  const adapter = createMcpToolAdapter({});
  const names = adapter.listAvailableTools().map((t) => t.name).sort();
  assert.deepEqual(names, ['contacts', 'pipeline', 'tools_search']);
});

test('adapter excludes static catalog when includeStaticCatalog=false and no dynamic tools provided', () => {
  const adapter = createMcpToolAdapter({ includeStaticCatalog: false });
  const names = adapter.listAvailableTools().map((t) => t.name);
  assert.deepEqual(names, ['tools_search']);
});

test('adapter merges dynamic available tools when includeStaticCatalog=false', () => {
  const dynamicTools: ToolMetadata[] = [
    {
      name: 'persons_create',
      description: 'Create a person',
      inputSchema: { type: 'object', additionalProperties: true },
      kind: 'static',
      domain: 'contacts',
      service: 'contacts',
      requiredScope: 'write',
      availability: { status: 'available' },
      edition: 'all',
    },
  ];
  const adapter = createMcpToolAdapter({
    includeStaticCatalog: false,
    availableTools: dynamicTools,
  });
  const names = adapter.listAvailableTools().map((t) => t.name).sort();
  assert.deepEqual(names, ['contacts', 'tools_search']);
});

test('adapter searchTools surfaces unavailable tools with availability', () => {
  const unavailable: ToolMetadata = {
    name: 'persons_search',
    description: 'Search person records',
    inputSchema: { type: 'object', additionalProperties: true },
    kind: 'static',
    domain: 'contacts',
    service: 'contacts',
    requiredScope: 'read',
    availability: {
      status: 'unavailable',
      reason: 'no persons created yet',
      nextStep: 'Create your first person',
    },
    edition: 'all',
  };
  const adapter = createMcpToolAdapter({
    includeStaticCatalog: false,
    unavailableTools: [unavailable],
  });
  const results = adapter.searchTools('persons');
  const hit = results.find((r) => r.name === 'persons_search');
  assert.ok(hit, 'persons_search must be discoverable');
  assert.equal(hit.availability.status, 'unavailable');
  assert.equal(hit.availability.nextStep, 'Create your first person');
});

test('adapter requiredScopeForTool resolves from static catalog by default', () => {
  const adapter = createMcpToolAdapter({});
  assert.equal(adapter.requiredScopeForTool('persons_create'), 'write');
  assert.equal(adapter.requiredScopeForTool('persons_search'), 'read');
});

test('domain tool is omitted when its domain has zero available tools (dynamic mode)', () => {
  const state: McpToolState = {
    availableTools: [],
    unavailableTools: [],
    dynamicTools: [],
  };
  const adapter = createMcpToolAdapter({ includeStaticCatalog: false, ...state });
  const names = adapter.listAvailableTools().map((t) => t.name);
  assert.deepEqual(names, ['tools_search']);
});
