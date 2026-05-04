import assert from 'node:assert/strict';
import test from 'node:test';

import { pipelineSpec } from './index.js';

interface Schema {
  type?: unknown;
  properties: Record<string, { type?: unknown; enum?: unknown[]; default?: unknown }>;
  required?: string[];
}

function getSchema(name: string): Schema {
  const schemas = pipelineSpec.components.schemas as Record<string, Schema>;
  const out = schemas[name];
  if (!out) throw new Error(`schema ${name} missing`);
  return out;
}

test('pipelineSpec exposes schemas for all three entities', () => {
  for (const name of [
    'Pipeline', 'PipelineCreate', 'PipelinePatch',
    'Stage', 'StageCreate', 'StagePatch',
    'Deal', 'DealCreate', 'DealPatch',
  ]) {
    assert.ok(getSchema(name), `${name} missing`);
  }
});

test('PipelineCreate requires name; isDefault has default 0', () => {
  const create = getSchema('PipelineCreate');
  assert.ok(create.required?.includes('name'));
  assert.equal(create.properties.isDefault?.default, 0);
});

test('Stage.terminalKind is enum nullable (not notNull, no default)', () => {
  const terminalKind = getSchema('Stage').properties.terminalKind;
  assert.ok(terminalKind);
  assert.deepEqual(terminalKind.type, ['string', 'null']);
  assert.deepEqual(terminalKind.enum, ['won', 'lost', null]);
});

test('DealCreate requires name + pipelineId + stageId + stageEnteredAt; nullable contact fields optional', () => {
  const create = getSchema('DealCreate');
  for (const req of ['name', 'pipelineId', 'stageId', 'stageEnteredAt']) {
    assert.ok(create.required?.includes(req), `${req} should be required`);
  }
  assert.ok(!create.required?.includes('accountId'));
  assert.ok(!create.required?.includes('amount'));
});

test('DealPatch supports clearing nullable fields, but stageId is non-null on patch', () => {
  const patch = getSchema('DealPatch');
  const amount = patch.properties.amount;
  const lostReason = patch.properties.lostReason;
  const stageId = patch.properties.stageId;
  assert.ok(amount && lostReason && stageId);
  assert.deepEqual(amount.type, ['number', 'null']);
  assert.deepEqual(lostReason.type, ['string', 'null']);
  assert.deepEqual(stageId.type, 'string');
});
