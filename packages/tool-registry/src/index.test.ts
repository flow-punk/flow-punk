import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildToolRegistry,
  createMcpToolAdapter,
  type ToolMetadata,
} from './index.js';

test("buildToolRegistry('indie') exposes compact CRM model tools", () => {
  const registry = buildToolRegistry('indie');
  assert.deepEqual(
    registry.modelTools.map((tool) => tool.name).sort(),
    ['accounts', 'deals', 'persons', 'pipelines', 'stages'],
  );
  assert.equal(registry.modelTools.some((tool) => tool.name === 'contacts'), false);
  assert.equal(registry.modelTools.some((tool) => tool.name === 'pipeline'), false);
  assert.equal(registry.modelTools.some((tool) => tool.name === 'tools_search'), false);
});

test("buildToolRegistry('managed') starts from the same shared CRM model surface", () => {
  const indie = buildToolRegistry('indie');
  const managed = buildToolRegistry('managed');
  assert.deepEqual(
    managed.modelTools.map((tool) => tool.name).sort(),
    indie.modelTools.map((tool) => tool.name).sort(),
  );
});

test('model descriptions explain relationships between CRM records', () => {
  const adapter = createMcpToolAdapter();
  const byName = new Map(adapter.listAvailableTools().map((tool) => [tool.name, tool]));
  assert.match(byName.get('persons')!.description, /accountId/);
  assert.match(byName.get('accounts')!.description, /many persons/);
  assert.match(byName.get('deals')!.description, /stages in a pipeline/);
  assert.match(byName.get('stages')!.description, /belongs to a pipeline/);
});

test('model tool schema lists describe plus executable actions', () => {
  const persons = createMcpToolAdapter()
    .listAvailableTools()
    .find((tool) => tool.name === 'persons');
  assert.ok(persons);
  const properties = persons.inputSchema.properties as {
    action: { enum: string[] };
  };
  assert.deepEqual(properties.action.enum, ['describe', 'search', 'get', 'create', 'update']);
});

test('describe returns the full schema for one action', () => {
  const adapter = createMcpToolAdapter();
  const description = adapter.describeModelAction('persons', {
    action: 'describe',
    arguments: { action: 'create' },
  });
  assert.ok(description);
  assert.equal(description.downstreamName, 'persons_create');
  assert.deepEqual(description.inputSchema.required, ['displayName']);
  assert.equal(description.examples?.[0]?.displayName, 'Alex Morgan');
});

test('resolveModelAction maps public model calls to downstream action names', () => {
  const adapter = createMcpToolAdapter();
  const call = adapter.resolveModelAction('persons', {
    action: 'create',
    arguments: { displayName: 'Alex Morgan' },
  });
  assert.ok(call);
  assert.equal(call.downstreamName, 'persons_create');
  assert.deepEqual(call.arguments, { displayName: 'Alex Morgan' });
  assert.equal(call.metadata.requiredScope, 'write');
});

test('downstream action names are not public MCP tools', () => {
  const adapter = createMcpToolAdapter();
  assert.equal(adapter.getToolMetadata('persons_create'), null);
});

test('unavailable actions are omitted from model action enum but still describable', () => {
  const unavailable: ToolMetadata = {
    name: 'persons_search',
    description: 'Search person records',
    inputSchema: { type: 'object', additionalProperties: true },
    kind: 'action',
    model: 'persons',
    service: 'contacts',
    requiredScope: 'read',
    availability: {
      status: 'unavailable',
      reason: 'contacts table is not ready',
      nextStep: 'Run migrations',
    },
    editions: ['indie', 'managed'],
    action: 'search',
    downstreamName: 'persons_search',
  };

  const adapter = createMcpToolAdapter({
    includeStaticCatalog: false,
    availableTools: [
      {
        ...unavailable,
        name: 'persons_create',
        action: 'create',
        downstreamName: 'persons_create',
        description: 'Create a person record',
        requiredScope: 'write',
        availability: { status: 'available' },
      },
    ],
    unavailableTools: [unavailable],
  });

  const persons = adapter.listAvailableTools().find((tool) => tool.name === 'persons');
  assert.ok(persons);
  const properties = persons.inputSchema.properties as {
    action: { enum: string[] };
  };
  assert.deepEqual(properties.action.enum, ['describe', 'create']);

  const description = adapter.describeModelAction('persons', {
    action: 'describe',
    arguments: { action: 'search' },
  });
  assert.equal(description?.availability.status, 'unavailable');
  assert.equal(description?.availability.nextStep, 'Run migrations');
});
