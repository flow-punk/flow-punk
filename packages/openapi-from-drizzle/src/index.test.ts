import assert from 'node:assert/strict';
import test from 'node:test';

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { tableToSchemas } from './index.js';

const sample = sqliteTable('sample', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  count: integer('count').notNull(),
  rating: real('rating'),
  status: text('status').notNull().$type<'active' | 'archived'>(),
  // Default present → optional in Create, no longer marked nullable in storage.
  visibility: text('visibility').notNull().default('public').$type<'public' | 'private'>(),
  // Required-with-default integer.
  retries: integer('retries').notNull().default(0),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

const ENUMS = {
  status: ['active', 'archived'],
  visibility: ['public', 'private'],
} as const;

test('Entity schema includes every column with correct types', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const entity = out.Sample as { type: string; properties: Record<string, { type: string | string[] }> };
  assert.equal(entity.type, 'object');
  assert.deepEqual(entity.properties.id, { type: 'string' });
  assert.deepEqual(entity.properties.name, { type: 'string' });
  assert.deepEqual(entity.properties.count, { type: 'integer' });
  assert.deepEqual(entity.properties.rating, { type: ['number', 'null'] });
  assert.deepEqual(entity.properties.description, { type: ['string', 'null'] });
});

test('Entity required = every column (NULL stored as JSON null)', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const entity = out.Sample as { required: string[] };
  for (const col of [
    'id', 'name', 'description', 'count', 'rating', 'status',
    'visibility', 'retries', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
  ]) {
    assert.ok(entity.required.includes(col), `missing required: ${col}`);
  }
});

test('Entity surfaces enum values from caller-supplied map', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const entity = out.Sample as { properties: Record<string, { type: string | string[]; enum?: unknown[] }> };
  assert.deepEqual(entity.properties.status, { type: 'string', enum: ['active', 'archived'] });
});

test('EntityCreate excludes default audit columns', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const create = out.SampleCreate as { properties: Record<string, unknown> };
  for (const audit of ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'status']) {
    assert.equal(create.properties[audit], undefined, `audit ${audit} should be excluded`);
  }
  assert.ok(create.properties.name);
  assert.ok(create.properties.count);
  assert.ok(create.properties.rating);
});

test('EntityCreate required = notNull AND no default AND not audit', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const create = out.SampleCreate as { required: string[] };
  assert.deepEqual(create.required.sort(), ['count', 'name'].sort());
  // visibility (notNull + default) and retries (notNull + default) should be optional.
  assert.ok(!create.required.includes('visibility'));
  assert.ok(!create.required.includes('retries'));
});

test('EntityCreate exposes default values for defaulted columns', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const create = out.SampleCreate as { properties: Record<string, { default?: unknown }> };
  assert.equal(create.properties.visibility?.default, 'public');
  assert.equal(create.properties.retries?.default, 0);
});

test('EntityCreate has additionalProperties: false', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const create = out.SampleCreate as { additionalProperties: boolean };
  assert.equal(create.additionalProperties, false);
});

test('EntityPatch is omitted when no patch options provided', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  assert.equal(out.SamplePatch, undefined);
});

test('EntityPatch keys = ALLOWED list, no required, additionalProperties: false', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    enums: ENUMS,
    patch: { allowed: ['name', 'description', 'rating'] },
  });
  const patch = out.SamplePatch as {
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
  assert.deepEqual(Object.keys(patch.properties).sort(), ['description', 'name', 'rating']);
  assert.equal(patch.required, undefined);
  assert.equal(patch.additionalProperties, false);
});

test('EntityPatch marks NULLABLE_PATCH_FIELDS as type [T, null]', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    patch: {
      allowed: ['name', 'description'],
      nullable: new Set(['description']),
    },
  });
  const patch = out.SamplePatch as { properties: Record<string, { type: string | string[] }> };
  assert.deepEqual(patch.properties.name, { type: 'string' });
  assert.deepEqual(patch.properties.description, { type: ['string', 'null'] });
});

test('EntityPatch strips defaults (defaults only apply on insert)', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    enums: ENUMS,
    patch: { allowed: ['visibility', 'retries'] },
  });
  const patch = out.SamplePatch as { properties: Record<string, { default?: unknown }> };
  assert.equal(patch.properties.visibility?.default, undefined);
  assert.equal(patch.properties.retries?.default, undefined);
});

test('EntityPatch nullable=array form is accepted', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    patch: {
      allowed: ['description', 'rating'],
      nullable: ['description', 'rating'],
    },
  });
  const patch = out.SamplePatch as { properties: Record<string, { type: string | string[] }> };
  assert.deepEqual(patch.properties.description, { type: ['string', 'null'] });
  assert.deepEqual(patch.properties.rating, { type: ['number', 'null'] });
});

test('EntityPatch throws when allowed includes an unknown column', () => {
  assert.throws(
    () =>
      tableToSchemas(sample, {
        name: 'Sample',
        patch: { allowed: ['nonexistent'] },
      }),
    /not a column on this table/,
  );
});

test('EntityCreate handles an enum-typed column with default', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const create = out.SampleCreate as { properties: Record<string, { type: string | string[]; enum?: unknown[]; default?: unknown }> };
  assert.deepEqual(create.properties.visibility?.type, 'string');
  assert.deepEqual(create.properties.visibility?.enum, ['public', 'private']);
  assert.equal(create.properties.visibility?.default, 'public');
});

test('extraResponseProps merges into Entity (e.g., joined slug field)', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    enums: ENUMS,
    extraResponseProps: { slug: { type: 'string' } },
  });
  const entity = out.Sample as { properties: Record<string, unknown> };
  assert.deepEqual(entity.properties.slug, { type: 'string' });
});

test('Custom audit override replaces the default audit set', () => {
  const out = tableToSchemas(sample, {
    name: 'Sample',
    enums: ENUMS,
    audit: ['id'], // only exclude id
  });
  const create = out.SampleCreate as { properties: Record<string, unknown> };
  // createdAt/createdBy/etc. are no longer excluded under the override.
  assert.ok(create.properties.createdAt);
  assert.ok(create.properties.createdBy);
  assert.equal(create.properties.id, undefined);
});

test('Nullable column without default uses [T, null] in Entity', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const entity = out.Sample as { properties: Record<string, { type: string | string[] }> };
  assert.deepEqual(entity.properties.description, { type: ['string', 'null'] });
  assert.deepEqual(entity.properties.rating, { type: ['number', 'null'] });
});

test('Notnull-with-default column is non-nullable in Entity (default fills it)', () => {
  const out = tableToSchemas(sample, { name: 'Sample', enums: ENUMS });
  const entity = out.Sample as { properties: Record<string, { type: string | string[] }> };
  // visibility: notNull + default → never NULL in storage
  assert.deepEqual(entity.properties.visibility?.type, 'string');
  // retries: notNull + default
  assert.deepEqual(entity.properties.retries?.type, 'integer');
});
