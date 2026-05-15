/**
 * Unit tests for the deal-history repo's pure helpers and input
 * validation. Live D1 integration is covered by the pipeline service's
 * smoke tests; here we lock down id-format guards and cursor encode/
 * decode roundtrips so the contract is regression-proof.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as dealHistoryRepo from './deal-history.js';
import { DealHistoryRepoError } from './deal-history.js';

test('findById rejects ids that do not match dhx_<21>', async () => {
  await assert.rejects(
    () => dealHistoryRepo.findById({} as never, 'not-a-history-id'),
    (err: Error) =>
      err instanceof DealHistoryRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('dhx_'),
  );
});

test('findById rejects deal-shaped ids', async () => {
  await assert.rejects(
    () => dealHistoryRepo.findById({} as never, 'deal_aaaaaaaaaaaaaaaaaaaaa'),
    (err: Error) =>
      err instanceof DealHistoryRepoError && err.code === 'invalid_input',
  );
});

test('listByDealId rejects dealIds that do not match deal_<21>', async () => {
  await assert.rejects(
    () => dealHistoryRepo.listByDealId({} as never, 'not-a-deal-id'),
    (err: Error) =>
      err instanceof DealHistoryRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('deal_'),
  );
});

test('listByDealId rejects non-positive-integer limit', async () => {
  await assert.rejects(
    () =>
      dealHistoryRepo.listByDealId(
        {} as never,
        'deal_aaaaaaaaaaaaaaaaaaaaa',
        { limit: 0 },
      ),
    (err: Error) =>
      err instanceof DealHistoryRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('limit'),
  );
  await assert.rejects(
    () =>
      dealHistoryRepo.listByDealId(
        {} as never,
        'deal_aaaaaaaaaaaaaaaaaaaaa',
        { limit: 1.5 },
      ),
    (err: Error) =>
      err instanceof DealHistoryRepoError && err.code === 'invalid_input',
  );
});

test('listByDealId rejects malformed cursor', async () => {
  await assert.rejects(
    () =>
      dealHistoryRepo.listByDealId(
        {} as never,
        'deal_aaaaaaaaaaaaaaaaaaaaa',
        { cursor: '!!!not-base64!!!' },
      ),
    (err: Error) =>
      err instanceof DealHistoryRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('cursor'),
  );
});

test('encodeCursor / decodeCursor roundtrip', () => {
  const payload = {
    createdAt: '2026-05-15T12:34:56.789Z',
    id: 'dhx_abcdefghijklmnopqrstu',
  };
  const encoded = dealHistoryRepo.encodeCursor(payload);
  const decoded = dealHistoryRepo.decodeCursor(encoded);
  assert.deepEqual(decoded, payload);
});

test('decodeCursor rejects valid base64url whose JSON is wrong-shape', () => {
  // `["a","b"]` base64url-encoded — JSON parses but is an array, not the
  // expected `{createdAt, id}` object.
  const encoded = Buffer.from('["a","b"]', 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  assert.throws(() => dealHistoryRepo.decodeCursor(encoded), (err: Error) =>
    err instanceof DealHistoryRepoError && err.code === 'invalid_input',
  );
});
