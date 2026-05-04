import assert from 'node:assert/strict';
import test from 'node:test';

import { usersSpec } from './index.js';

interface Schema {
  type?: unknown;
  properties: Record<string, { type?: unknown; enum?: unknown[]; default?: unknown }>;
  required?: string[];
}

function getSchema(name: string): Schema {
  const schemas = usersSpec.components.schemas as Record<string, Schema>;
  const out = schemas[name];
  if (!out) throw new Error(`schema ${name} missing`);
  return out;
}

test('User schema includes the actual table columns', () => {
  const user = getSchema('User');
  for (const col of ['id', 'email', 'displayName', 'firstName', 'lastName', 'role', 'status', 'lastLoginAt']) {
    assert.ok(user.properties[col], `${col} missing on User`);
  }
});

test('User.role is enum with default member (notNull + default)', () => {
  const role = getSchema('User').properties.role;
  assert.ok(role);
  assert.equal(role.type, 'string');
  assert.ok(Array.isArray(role.enum));
  assert.ok((role.enum as string[]).includes('member'));
  assert.equal(role.default, 'member');
});

test('UserCreate requires email + displayName, role is optional with default', () => {
  const create = getSchema('UserCreate');
  assert.ok(create.required?.includes('email'));
  assert.ok(create.required?.includes('displayName'));
  assert.ok(!create.required?.includes('role'));
  assert.equal(create.properties.role?.default, 'member');
});

test('UserPatch covers ALLOWED_PATCH_FIELDS and only NULLABLE ones can be cleared', () => {
  const patch = getSchema('UserPatch');
  assert.deepEqual(Object.keys(patch.properties).sort(), ['displayName', 'email', 'firstName', 'lastName', 'role'].sort());
  const firstName = patch.properties.firstName;
  const lastName = patch.properties.lastName;
  const email = patch.properties.email;
  const display = patch.properties.displayName;
  assert.ok(firstName && lastName && email && display);
  assert.deepEqual(firstName.type, ['string', 'null']);
  assert.deepEqual(lastName.type, ['string', 'null']);
  assert.deepEqual(email.type, 'string');
  assert.deepEqual(display.type, 'string');
});
