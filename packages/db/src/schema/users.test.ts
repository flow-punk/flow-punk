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
import {
  ROLE_VALUES,
  ROLE_PRIVILEGES,
  hasAdminRights,
  canManageUsers,
  canMintApiKeys,
  isRole,
} from '../utils/roles.js';

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
  assert.equal(isAllowedPatchField('role'), true);
  assert.equal(isAllowedPatchField('isAdmin'), false);
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
  assert.equal(isImmutablePatchField('role'), false);
});

test('SELF_ALLOWED_PATCH_FIELDS excludes email and role', () => {
  // Email is admin-only because it is an identifier; self change requires
  // a verification flow which is out of scope for this iteration. Role
  // is admin-only because it is a privilege transition.
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('email'), false);
  assert.equal(SELF_ALLOWED_PATCH_FIELDS.has('role'), false);
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
  assert.equal(isSelfPatchField('role'), false);
  assert.equal(isSelfPatchField('id'), false);
});

test('NULLABLE_PATCH_FIELDS does not include email or displayName (NOT NULL columns)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('email'), false);
  assert.equal(NULLABLE_PATCH_FIELDS.has('displayName'), false);
});

test('NULLABLE_PATCH_FIELDS does not include role (NOT NULL with default)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('role'), false);
});

test('NULLABLE_PATCH_FIELDS includes optional name fields', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('firstName'), true);
  assert.equal(NULLABLE_PATCH_FIELDS.has('lastName'), true);
});

test('USER_STATUS_VALUES is the canonical enum', () => {
  assert.deepEqual([...USER_STATUS_VALUES], ['active', 'deleted']);
});

test('ROLE_VALUES is the canonical enum (owner, admin, member, readonly)', () => {
  assert.deepEqual([...ROLE_VALUES], ['owner', 'admin', 'member', 'readonly']);
});

test('isRole accepts all canonical values and rejects unknowns', () => {
  for (const r of ROLE_VALUES) assert.equal(isRole(r), true);
  assert.equal(isRole('superuser'), false);
  assert.equal(isRole(''), false);
  assert.equal(isRole(null), false);
  assert.equal(isRole(undefined), false);
});

test('hasAdminRights covers owner+admin only', () => {
  assert.equal(hasAdminRights('owner'), true);
  assert.equal(hasAdminRights('admin'), true);
  assert.equal(hasAdminRights('member'), false);
  assert.equal(hasAdminRights('readonly'), false);
});

test('canManageUsers covers owner+admin only', () => {
  assert.equal(canManageUsers('owner'), true);
  assert.equal(canManageUsers('admin'), true);
  assert.equal(canManageUsers('member'), false);
  assert.equal(canManageUsers('readonly'), false);
});

test('canMintApiKeys covers owner+admin only', () => {
  assert.equal(canMintApiKeys('owner'), true);
  assert.equal(canMintApiKeys('admin'), true);
  assert.equal(canMintApiKeys('member'), false);
  assert.equal(canMintApiKeys('readonly'), false);
});

test('readonly role can read but not write', () => {
  assert.equal(ROLE_PRIVILEGES.readonly.read, true);
  assert.equal(ROLE_PRIVILEGES.readonly.write, false);
});

test('only owner can manageTenantSettings', () => {
  assert.equal(ROLE_PRIVILEGES.owner.manageTenantSettings, true);
  assert.equal(ROLE_PRIVILEGES.admin.manageTenantSettings, false);
  assert.equal(ROLE_PRIVILEGES.member.manageTenantSettings, false);
  assert.equal(ROLE_PRIVILEGES.readonly.manageTenantSettings, false);
});
