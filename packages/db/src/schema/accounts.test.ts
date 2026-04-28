import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_PATCH_FIELDS,
  IMMUTABLE_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  isAllowedPatchField,
  isImmutablePatchField,
} from './accounts.js';

test('ALLOWED_PATCH_FIELDS does not include any audit/system column', () => {
  for (const banned of ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status', 'deletedAt', 'deletedBy']) {
    assert.equal(
      (ALLOWED_PATCH_FIELDS as readonly string[]).includes(banned),
      false,
      `${banned} must not be patchable`,
    );
  }
});

test('IMMUTABLE_PATCH_FIELDS covers every system column', () => {
  for (const expected of ['id', 'createdAt', 'createdBy', 'status', 'deletedAt', 'deletedBy']) {
    assert.ok(
      (IMMUTABLE_PATCH_FIELDS as readonly string[]).includes(expected),
      `${expected} must be immutable`,
    );
  }
});

test('isAllowedPatchField only accepts whitelist members', () => {
  assert.equal(isAllowedPatchField('displayName'), true);
  assert.equal(isAllowedPatchField('country'), true);
  assert.equal(isAllowedPatchField('id'), false);
  assert.equal(isAllowedPatchField('createdAt'), false);
  assert.equal(isAllowedPatchField('arbitraryUserKey'), false);
});

test('isImmutablePatchField rejects normal data fields', () => {
  assert.equal(isImmutablePatchField('id'), true);
  assert.equal(isImmutablePatchField('createdAt'), true);
  assert.equal(isImmutablePatchField('displayName'), false);
  assert.equal(isImmutablePatchField('country'), false);
});

test('NULLABLE_PATCH_FIELDS does not include displayName (NOT NULL column)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('displayName'), false);
  assert.equal(NULLABLE_PATCH_FIELDS.has('domain'), true);
  assert.equal(NULLABLE_PATCH_FIELDS.has('country'), true);
});
