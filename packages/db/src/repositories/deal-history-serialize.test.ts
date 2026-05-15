/**
 * Byte-exact tests for `deal_history.changes` JSON payloads.
 *
 * The serializer's output is contract: the dashboard reads these strings
 * directly and the redaction-coverage rule depends on `changes` being
 * produced through a single helper module (so no caller can sidestep PII
 * marking). Field order is pinned for `created`; `updated` /
 * `stage_moved` reflect the caller's iteration order, which the deals
 * repo derives from `ALLOWED_PATCH_FIELDS`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Deal } from '../schema/deals.js';
import {
  serializeCreated,
  serializeSoftDeleted,
  serializeStageMoved,
  serializeUpdated,
} from './deal-history-serialize.js';

const baseDeal: Deal = {
  id: 'deal_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Acme Renewal',
  pipelineId: 'pipe_bbbbbbbbbbbbbbbbbbbbb',
  stageId: 'stag_ccccccccccccccccccccc',
  stageEnteredAt: '2026-05-15T00:00:00.000Z',
  accountId: null,
  primaryPersonId: null,
  amount: null,
  currency: null,
  expectedCloseDate: null,
  probability: null,
  ownerUserId: null,
  lostReason: null,
  status: 'active',
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  createdBy: 'usr_1',
  updatedAt: '2026-05-15T00:00:00.000Z',
  updatedBy: 'usr_1',
};

test('serializeCreated includes only non-null fields in pinned order', () => {
  const json = serializeCreated(baseDeal);
  const parsed = JSON.parse(json) as Array<{
    field: string;
    from: null;
    to: unknown;
  }>;
  assert.deepEqual(parsed, [
    { field: 'name', from: null, to: 'Acme Renewal' },
    {
      field: 'pipelineId',
      from: null,
      to: 'pipe_bbbbbbbbbbbbbbbbbbbbb',
    },
    { field: 'stageId', from: null, to: 'stag_ccccccccccccccccccccc' },
    {
      field: 'stageEnteredAt',
      from: null,
      to: '2026-05-15T00:00:00.000Z',
    },
  ]);
});

test('serializeCreated emits all optional fields when set', () => {
  const deal: Deal = {
    ...baseDeal,
    accountId: 'acct_ddddddddddddddddddddd',
    primaryPersonId: 'per_eeeeeeeeeeeeeeeeeeeee',
    amount: 5000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    probability: 75,
    ownerUserId: 'usr_2',
    lostReason: null,
  };
  const json = serializeCreated(deal);
  const parsed = JSON.parse(json) as Array<{ field: string }>;
  assert.deepEqual(
    parsed.map((e) => e.field),
    [
      'name',
      'pipelineId',
      'stageId',
      'stageEnteredAt',
      'accountId',
      'primaryPersonId',
      'amount',
      'currency',
      'expectedCloseDate',
      'probability',
      'ownerUserId',
    ],
  );
});

test('serializeUpdated returns the diff array verbatim', () => {
  const diffs = [
    { field: 'amount', from: 5000, to: 10000 },
    { field: 'probability', from: 50, to: 75 },
  ];
  const json = serializeUpdated(diffs);
  assert.equal(json, JSON.stringify(diffs));
});

test('serializeStageMoved wraps from/to_stage_id around co-diffs', () => {
  const json = serializeStageMoved(
    'stag_aaaaaaaaaaaaaaaaaaaaa',
    'stag_bbbbbbbbbbbbbbbbbbbbb',
    [{ field: 'probability', from: 50, to: 90 }],
  );
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assert.deepEqual(parsed, {
    from_stage_id: 'stag_aaaaaaaaaaaaaaaaaaaaa',
    to_stage_id: 'stag_bbbbbbbbbbbbbbbbbbbbb',
    changes: [{ field: 'probability', from: 50, to: 90 }],
  });
});

test('serializeStageMoved emits empty changes array for pure stage move', () => {
  const json = serializeStageMoved(
    'stag_aaaaaaaaaaaaaaaaaaaaa',
    'stag_bbbbbbbbbbbbbbbbbbbbb',
    [],
  );
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assert.deepEqual(parsed['changes'], []);
});

test('serializeSoftDeleted returns null', () => {
  assert.equal(serializeSoftDeleted(), null);
});
