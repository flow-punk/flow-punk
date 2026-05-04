import assert from 'node:assert/strict';
import test from 'node:test';

import { contactsSpec } from './index.js';

interface Schema {
  type?: unknown;
  properties: Record<string, { type?: unknown; enum?: unknown[]; default?: unknown }>;
  required?: string[];
}

function getSchema(name: string): Schema {
  const schemas = contactsSpec.components.schemas as Record<string, Schema>;
  const out = schemas[name];
  if (!out) throw new Error(`schema ${name} missing`);
  return out;
}

test('contactsSpec exposes Account, AccountCreate, AccountPatch schemas', () => {
  assert.ok(getSchema('Account'));
  assert.ok(getSchema('AccountCreate'));
  assert.ok(getSchema('AccountPatch'));
});

test('Account response shape includes the actual table columns (catches Phase-1 drift)', () => {
  const account = getSchema('Account');
  for (const col of [
    'displayName', 'streetLine1', 'city', 'country',
    'phone1Number', 'phone2Number', 'imageLogo',
    'latitude', 'longitude',
  ]) {
    assert.ok(account.properties[col], `${col} missing`);
  }
  for (const ghost of ['name', 'employeeCount', 'annualRevenue']) {
    assert.equal(account.properties[ghost], undefined, `invented field "${ghost}" should not exist`);
  }
});

test('AccountCreate requires displayName and excludes audit columns', () => {
  const create = getSchema('AccountCreate');
  assert.ok(create.required?.includes('displayName'), 'displayName must be required');
  for (const audit of ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status', 'deletedAt', 'deletedBy']) {
    assert.equal(create.properties[audit], undefined, `${audit} should be excluded from POST body`);
  }
});

test('Person response shape includes consentEmail enum + accountId nullable', () => {
  const person = getSchema('Person');
  const consent = person.properties.consentEmail;
  assert.ok(consent);
  assert.equal(consent.type, 'string');
  assert.deepEqual(consent.enum, ['subscribed', 'unsubscribed', 'no_consent']);
  const accountId = person.properties.accountId;
  assert.ok(accountId);
  assert.deepEqual(accountId.type, ['string', 'null']);
});

test('PersonPatch supports clearing email/phones via null', () => {
  const patch = getSchema('PersonPatch');
  const email = patch.properties.emailPrimary;
  const phone = patch.properties.phone1Number;
  const display = patch.properties.displayName;
  assert.ok(email && phone && display);
  assert.deepEqual(email.type, ['string', 'null']);
  assert.deepEqual(phone.type, ['string', 'null']);
  assert.deepEqual(display.type, 'string');
});

test('contactsSpec paths cover the documented routes', () => {
  const paths = Object.keys(contactsSpec.paths);
  for (const p of ['/api/v1/accounts', '/api/v1/accounts/{id}', '/api/v1/persons', '/api/v1/persons/{id}']) {
    assert.ok(paths.includes(p), `${p} missing`);
  }
});
