import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INDIE_PUBLIC_PATHS,
  OPENAPI_LOCAL_PATHS,
  getPublicPaths,
  isPublicPath,
} from './public-paths.js';

test('getPublicPaths: returns base list when OPENAPI_ENABLED is undefined', () => {
  const paths = getPublicPaths({}, INDIE_PUBLIC_PATHS);
  assert.deepEqual(paths, INDIE_PUBLIC_PATHS);
});

test('getPublicPaths: returns base list when OPENAPI_ENABLED is empty string', () => {
  const paths = getPublicPaths({ OPENAPI_ENABLED: '' }, INDIE_PUBLIC_PATHS);
  assert.deepEqual(paths, INDIE_PUBLIC_PATHS);
});

test('getPublicPaths: returns base list when OPENAPI_ENABLED is "0"', () => {
  const paths = getPublicPaths({ OPENAPI_ENABLED: '0' }, INDIE_PUBLIC_PATHS);
  assert.deepEqual(paths, INDIE_PUBLIC_PATHS);
});

test('getPublicPaths: returns base list when OPENAPI_ENABLED is "true" (only "1" enables)', () => {
  const paths = getPublicPaths({ OPENAPI_ENABLED: 'true' }, INDIE_PUBLIC_PATHS);
  assert.deepEqual(paths, INDIE_PUBLIC_PATHS);
});

test('getPublicPaths: appends /docs and /openapi.json when OPENAPI_ENABLED === "1"', () => {
  const paths = getPublicPaths({ OPENAPI_ENABLED: '1' }, INDIE_PUBLIC_PATHS);
  assert.deepEqual(paths, [...INDIE_PUBLIC_PATHS, ...OPENAPI_LOCAL_PATHS]);
});

test('getPublicPaths: does not mutate the base list', () => {
  const baseLen = INDIE_PUBLIC_PATHS.length;
  getPublicPaths({ OPENAPI_ENABLED: '1' }, INDIE_PUBLIC_PATHS);
  assert.equal(INDIE_PUBLIC_PATHS.length, baseLen);
});

test('isPublicPath: matches /docs against the augmented list', () => {
  const paths = getPublicPaths({ OPENAPI_ENABLED: '1' }, INDIE_PUBLIC_PATHS);
  assert.equal(isPublicPath('/api/docs', paths), true);
  assert.equal(isPublicPath('/api/openapi.json', paths), true);
});

test('isPublicPath: does NOT match /docs against the base list (flag unset)', () => {
  assert.equal(isPublicPath('/api/docs', INDIE_PUBLIC_PATHS), false);
  assert.equal(isPublicPath('/api/openapi.json', INDIE_PUBLIC_PATHS), false);
});
