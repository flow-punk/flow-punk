import assert from 'node:assert/strict';
import test from 'node:test';

import { pipelineSpec } from './index.js';

interface Schema {
  type?: unknown;
  properties: Record<
    string,
    { type?: unknown; enum?: readonly unknown[]; default?: unknown }
  >;
  required?: readonly string[];
}

function getSchema(name: string): Schema {
  const schemas = pipelineSpec.components.schemas as unknown as Record<
    string,
    Schema
  >;
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

test('DealHistory schema declares all six kinds + four credential types', () => {
  const dh = getSchema('DealHistory');
  assert.deepEqual(dh.properties.kind?.enum, [
    'created',
    'updated',
    'stage_moved',
    'soft_deleted',
    'contact_added',
    'contact_removed',
  ]);
  assert.deepEqual(dh.properties.credentialType?.enum, [
    'apikey',
    'oauth',
    'session',
    'system',
  ]);
  // `changes` is opaque JSON (nullable for soft_deleted) — schema type is
  // `[string, null]`, NOT a structured object. This is load-bearing for
  // ADR-022's PII redaction posture.
  assert.deepEqual(dh.properties.changes?.type, ['string', 'null']);
});

test('pipelineSpec exposes the two deal-history paths with expected operationIds', () => {
  const paths = pipelineSpec.paths as Record<
    string,
    Record<string, { operationId?: string }>
  >;
  const listOp = paths['/api/v1/deals/{id}/history']?.get;
  const getOp = paths['/api/v1/deal-history/{id}']?.get;
  assert.equal(listOp?.operationId, 'listDealHistoryByDeal');
  assert.equal(getOp?.operationId, 'getDealHistory');
});
