import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleSpec } from './assemble.js';
import type { OpenAPIFragment } from './types.js';

const INFO = { title: 'Test API', version: '0.0.0' } as const;

test('assembleSpec: merges paths from multiple fragments', () => {
  const a: OpenAPIFragment = {
    paths: {
      '/foo': { get: { responses: { '200': { description: 'ok' } } } },
    },
  };
  const b: OpenAPIFragment = {
    paths: {
      '/bar': { post: { responses: { '201': { description: 'created' } } } },
    },
  };

  const spec = assembleSpec({ info: INFO, fragments: [a, b] });

  assert.ok(spec.paths['/foo']?.get);
  assert.ok(spec.paths['/bar']?.post);
});

test('assembleSpec: merges different methods on the same path', () => {
  const a: OpenAPIFragment = {
    paths: { '/items': { get: { responses: { '200': { description: 'ok' } } } } },
  };
  const b: OpenAPIFragment = {
    paths: { '/items': { post: { responses: { '201': { description: 'created' } } } } },
  };

  const spec = assembleSpec({ info: INFO, fragments: [a, b] });

  assert.ok(spec.paths['/items']?.get);
  assert.ok(spec.paths['/items']?.post);
});

test('assembleSpec: throws on path+method collision', () => {
  const a: OpenAPIFragment = {
    paths: { '/items': { get: { responses: { '200': { description: 'a' } } } } },
  };
  const b: OpenAPIFragment = {
    paths: { '/items': { get: { responses: { '200': { description: 'b' } } } } },
  };

  assert.throws(
    () => assembleSpec({ info: INFO, fragments: [a, b] }),
    /path collision: GET \/items/,
  );
});

test('assembleSpec: deep-merges components.schemas across fragments', () => {
  const a: OpenAPIFragment = {
    components: { schemas: { Foo: { type: 'object' } } },
  };
  const b: OpenAPIFragment = {
    components: { schemas: { Bar: { type: 'string' } } },
  };

  const spec = assembleSpec({ info: INFO, fragments: [a, b] });

  assert.deepEqual(spec.components.schemas?.Foo, { type: 'object' });
  assert.deepEqual(spec.components.schemas?.Bar, { type: 'string' });
});

test('assembleSpec: allows identical schema re-declarations', () => {
  const shared = { type: 'object', properties: { id: { type: 'string' } } };
  const a: OpenAPIFragment = { components: { schemas: { Shared: shared } } };
  const b: OpenAPIFragment = { components: { schemas: { Shared: shared } } };

  const spec = assembleSpec({ info: INFO, fragments: [a, b] });

  assert.deepEqual(spec.components.schemas?.Shared, shared);
});

test('assembleSpec: throws on conflicting schema definitions', () => {
  const a: OpenAPIFragment = {
    components: { schemas: { Item: { type: 'object' } } },
  };
  const b: OpenAPIFragment = {
    components: { schemas: { Item: { type: 'string' } } },
  };

  assert.throws(
    () => assembleSpec({ info: INFO, fragments: [a, b] }),
    /components\.schemas collision: "Item"/,
  );
});

test('assembleSpec: dedupes tags by name and sorts alphabetically', () => {
  const a: OpenAPIFragment = {
    tags: [{ name: 'Zeta' }, { name: 'Alpha' }],
  };
  const b: OpenAPIFragment = {
    tags: [{ name: 'Alpha', description: 'first' }, { name: 'Beta' }],
  };

  const spec = assembleSpec({ info: INFO, fragments: [a, b] });

  assert.deepEqual(spec.tags?.map((t) => t.name), ['Alpha', 'Beta', 'Zeta']);
  // Description from `b` fills in where `a` had none.
  assert.equal(spec.tags?.find((t) => t.name === 'Alpha')?.description, 'first');
});

test('assembleSpec: emits valid OpenAPI 3.1 envelope', () => {
  const spec = assembleSpec({ info: INFO, fragments: [] });
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'Test API');
  assert.deepEqual(spec.paths, {});
});

test('assembleSpec: applies top-level security when provided', () => {
  const spec = assembleSpec({
    info: INFO,
    fragments: [],
    security: [{ BearerAuth: [] }],
  });
  assert.deepEqual(spec.security, [{ BearerAuth: [] }]);
});

test('assembleSpec: omits security when not provided', () => {
  const spec = assembleSpec({ info: INFO, fragments: [] });
  assert.equal(spec.security, undefined);
});
