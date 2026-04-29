import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_PATCH_FIELDS,
  EMAIL_CONSENT_VALUES,
  IMMUTABLE_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  PHONE1_TYPE_VALUES,
  isAllowedPatchField,
  isImmutablePatchField,
} from './persons.js';

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
  assert.equal(isAllowedPatchField('accountId'), true);
  assert.equal(isAllowedPatchField('emailPrimary'), true);
  assert.equal(isAllowedPatchField('phone1Type'), true);
  assert.equal(isAllowedPatchField('consentEmail'), true);
  assert.equal(isAllowedPatchField('id'), false);
  assert.equal(isAllowedPatchField('createdAt'), false);
  assert.equal(isAllowedPatchField('arbitraryUserKey'), false);
});

test('isImmutablePatchField rejects normal data fields', () => {
  assert.equal(isImmutablePatchField('id'), true);
  assert.equal(isImmutablePatchField('createdAt'), true);
  assert.equal(isImmutablePatchField('displayName'), false);
  assert.equal(isImmutablePatchField('accountId'), false);
  assert.equal(isImmutablePatchField('consentEmail'), false);
});

test('NULLABLE_PATCH_FIELDS does not include displayName (NOT NULL column)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('displayName'), false);
});

test('NULLABLE_PATCH_FIELDS does not include consentEmail (has meaningful default)', () => {
  // To clear consent, callers send the literal "no_consent" string — never
  // null. Permitting null PATCH would round-trip to the default and confuse
  // the consent-state model.
  assert.equal(NULLABLE_PATCH_FIELDS.has('consentEmail'), false);
});

test('NULLABLE_PATCH_FIELDS includes accountId (link is severable)', () => {
  assert.equal(NULLABLE_PATCH_FIELDS.has('accountId'), true);
});

test('PHONE1_TYPE_VALUES is the canonical enum', () => {
  assert.deepEqual(
    [...PHONE1_TYPE_VALUES],
    ['mobile', 'landline', 'voip', 'fax', 'other'],
  );
});

test('EMAIL_CONSENT_VALUES is the canonical enum', () => {
  assert.deepEqual(
    [...EMAIL_CONSENT_VALUES],
    ['subscribed', 'unsubscribed', 'no_consent'],
  );
});
