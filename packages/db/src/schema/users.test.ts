import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_PATCH_FIELDS,
  IMMUTABLE_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  SELF_ALLOWED_PATCH_FIELDS,
  USER_STATUS_VALUES,
  isAllowedPatchField,
  isImmutablePatchField,
  isSelfPatchField,
} from './users.js';

test('ALLOWED_PATCH_FIELDS does not include any audit/system column', () => {
  for (const banned of [
    'id',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy',
    'status',
    'deletedAt',
    'deletedBy',
    'lastLoginAt',
  ]) {
    assert.equal(
      (ALLOWED_PATCH_FIELDS as readonly string[]).includes(banned),
      false,
      `${banned} must not be patchable`,
    );
  }
});

test('IMMUTABLE_PATCH_FIELDS covers every system column including lastLoginAt', () => {
  for (const expected of [
    'id',
    'createdAt',
    'createdBy',
    'status',
    'deletedAt',
    'deletedBy',
    'lastLoginAt',
  ]) {
    assert.ok(
      (IMMUTABLE_PATCH_FIELDS as readonly string[]).includes(expected),
      `${expected} must be immutable`,
    );
  }
});

test('isAllowedPatchField only accepts whitelist members', () => {
  assert.equal(isAllowedPatchField('email'), true);
  assert.equal(isAllowedPatchField('displayName'), true);
  assert.equal(isAllowedPatchField('firstName'), true);
  assert.equal(isAllowedPatchField('isAdmin'), true);
  assert.equal(isAllowedPatchField('id'), false);
  assert.equal(isAllowedPatchField('status'), false);
  assert.equal(isAllowedPatchField('lastLoginAt'), false);
  assert.equal(isAllowedPatchField('arbitraryKey'), false);
});

test('isImmutablePatchField rejects normal data fields', () => {
  assert.equal(isImmutablePatchField('id'), true);
  assert.equal(isImmutablePatchField('lastLoginAt'), true);
  assert.equal(isImmutablePatchField('email'), false);
  assert.equal(isImmutablePatchField('displayName'), false);
  assert.equal(isImmutablePatchField('isAdmin'), false);
});

test('SELF_ALLOWED_PATCH_FIELDS excludes email and isAdmin', () => {
  // Email is admin-only because it is an identifier; self change requires
  // a verification flow which is out of scope for this iteration.
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('email'), false);
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('isAdmin'), false);
});

test('SELF_ALLOWED_PATCH_FIELDS includes only PII display fields', () => {
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('displayName'), true);
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('firstName'), true);
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('lastName'), true);
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.size, 3);
});

test('isSelfPatchField mirrors SELF_ALLOWED_PATCH_FIELDS', () => {
  assert.equal(isSelfPatchField('displayName'), true);
  assert.equal(isSelfPatchField('email'), false);
  assert.equal(isSelfPatchField('isAdmin'), false);
  assert.equal(isSelfPatchField('id'), false);
});

test('NULLABLE_PATCH_FIELDS does not include email or displayName (NOT NULL columns)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('email'), false);
  assert.equal(NULLABLE_PATCH_FIELDS.has('displayName'), false);
});

test('NULLABLE_PATCH_FIELDS does not include isAdmin (NOT NULL boolean)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('isAdmin'), false);
});

test('NULLABLE_PATCH_FIELDS includes optional name fields', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('firstName'), true);
  assert.equal(NULLABLE_PATCH_FIELDS.has('lastName'), true);
});

test('USER_STATUS_VALUES is the canonical enum', () => {
  assert.deepEqual([...USER_STATUS_VALUES], ['active', 'deleted']);
});
