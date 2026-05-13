import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CustomFieldDefsRepoError,
  archive,
  create,
  findActiveByName,
  findById,
  getMaxVersion,
  list,
  transitionFilterable,
  update,
} from './custom-field-defs.js';

// These tests cover the pure-validation surface and error contract — the
// same posture as the persons/accounts repo tests in this package. Live
// DB integration (cap enforcement against real rows, version-mismatch
// races, partial-unique-index behavior) is exercised by the
// per-tenant-d1 smoke script in PR-β.

test('list rejects an unknown baseModel before hitting the db', async () => {
  await assert.rejects(
    () => list({} as never, 'company' as never),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('findById rejects ids that do not match the cfd_<21> prefix', async () => {
  await assert.rejects(
    () => findById({} as never, 'bad_id'),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('cfd_'),
  );
  await assert.rejects(
    () => findById({} as never, 'cfd_TOOSHORT'),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('findActiveByName validates baseModel and slug shape', async () => {
  await assert.rejects(
    () => findActiveByName({} as never, 'company' as never, 'industry'),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
  await assert.rejects(
    () => findActiveByName({} as never, 'person', 'Industry'),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('^[a-z]'),
  );
});

test('getMaxVersion rejects unknown baseModel', async () => {
  await assert.rejects(
    () => getMaxVersion({} as never, 'lead' as never),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('create rejects illegal slug shapes', async () => {
  await assert.rejects(
    () =>
      create(
        {} as never,
        { baseModel: 'person', name: 'Industry' },
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('^[a-z]'),
  );
  await assert.rejects(
    () =>
      create(
        {} as never,
        { baseModel: 'person', name: 'foo-bar' },
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('create rejects an unknown baseModel', async () => {
  await assert.rejects(
    () =>
      create(
        {} as never,
        { baseModel: 'company' as never, name: 'industry' },
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('baseModel'),
  );
});

test('create rejects an invalid actorId format', async () => {
  await assert.rejects(
    () =>
      create(
        {} as never,
        { baseModel: 'person', name: 'industry' },
        '2026-05-13T00:00:00.000Z',
        'invalid user id with spaces',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('actorId'),
  );
});

test('update rejects malformed id and non-positive expectedVersion', async () => {
  await assert.rejects(
    () =>
      update(
        {} as never,
        'bad',
        {},
        1,
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
  await assert.rejects(
    () =>
      update(
        {} as never,
        'cfd_aaaaaaaaaaaaaaaaaaaaa',
        {},
        0,
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input' &&
      err.message.includes('expectedVersion'),
  );
});

test('transitionFilterable rejects malformed id', async () => {
  await assert.rejects(
    () =>
      transitionFilterable(
        {} as never,
        'bad',
        'pending',
        1,
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('archive rejects malformed id', async () => {
  await assert.rejects(
    () =>
      archive(
        {} as never,
        'bad',
        1,
        '2026-05-13T00:00:00.000Z',
        'user_alice',
      ),
    (err: unknown) =>
      err instanceof CustomFieldDefsRepoError &&
      err.code === 'invalid_input',
  );
});

test('CustomFieldDefsRepoError preserves its code field for callers', () => {
  const err = new CustomFieldDefsRepoError('cap_exceeded', 'too many');
  assert.equal(err.code, 'cap_exceeded');
  assert.equal(err.name, 'CustomFieldDefsRepoError');
  assert.equal(err.message, 'too many');
});
