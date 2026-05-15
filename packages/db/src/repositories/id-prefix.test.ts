import assert from 'node:assert/strict';
import test from 'node:test';

import { generateId } from '@flowpunk/service-utils';

import * as dealsRepo from './deals.js';
import * as stagesRepo from './stages.js';

test('generateId produces pipe_ prefix for pipelines', () => {
  assert.match(generateId('pipe'), /^pipe_[a-z0-9]{21}$/);
});

test('generateId produces stag_ prefix for stages', () => {
  assert.match(generateId('stag'), /^stag_[a-z0-9]{21}$/);
});

test('generateId produces deal_ prefix for deals', () => {
  assert.match(generateId('deal'), /^deal_[a-z0-9]{21}$/);
});

test('generateId produces dhx_ prefix for deal_history rows', () => {
  assert.match(generateId('dhx'), /^dhx_[a-z0-9]{21}$/);
});

test('generateId produces akey_ prefix for api-key row ids', () => {
  assert.match(generateId('akey'), /^akey_[a-z0-9]{21}$/);
});

test('generateId produces logn_ prefix for cli login tokens', () => {
  assert.match(generateId('logn'), /^logn_[a-z0-9]{21}$/);
});

test('dealsRepo.list rejects pipelineId with old "pl_" prefix', async () => {
  await assert.rejects(
    () =>
      dealsRepo.list({} as never, {
        pipelineId: 'pl_aaaaaaaaaaaaaaaaaaaaa',
      }),
    (err: Error) =>
      err.message.includes('pipelineId must match "pipe_<21'),
  );
});

test('dealsRepo.list rejects stageId with old "stg_" prefix', async () => {
  await assert.rejects(
    () =>
      dealsRepo.list({} as never, {
        stageId: 'stg_aaaaaaaaaaaaaaaaaaaaa',
      }),
    (err: Error) =>
      err.message.includes('stageId must match "stag_<21'),
  );
});

test('stagesRepo.list rejects pipelineId with old "pl_" prefix', async () => {
  await assert.rejects(
    () =>
      stagesRepo.list({} as never, {
        pipelineId: 'pl_aaaaaaaaaaaaaaaaaaaaa',
      }),
    (err: Error) =>
      err.message.includes('pipelineId must match "pipe_<21'),
  );
});
