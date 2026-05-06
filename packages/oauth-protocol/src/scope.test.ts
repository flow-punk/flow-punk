import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeScope, scopeListFromSerialized, scopeSatisfies } from './scope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(__dirname, '../test/vectors/scope.json'), 'utf8'),
) as {
  allowed: string[];
  cases: Array<{
    input: string;
    ok: boolean;
    granted?: string[];
    serialized?: string;
    error?: string;
    unsupported?: string[];
  }>;
};

describe('normalizeScope (vectors)', () => {
  for (const c of vectors.cases) {
    it(`input=${JSON.stringify(c.input)} → ok=${c.ok}`, () => {
      const r = normalizeScope(c.input, vectors.allowed);
      assert.equal(r.ok, c.ok);
      if (r.ok) {
        assert.deepEqual(r.granted, c.granted);
        assert.equal(r.serialized, c.serialized);
      } else {
        assert.equal(r.error, c.error);
        if (c.unsupported) assert.deepEqual(r.unsupported.sort(), c.unsupported.slice().sort());
      }
    });
  }
});

describe('normalizeScope defaultIfEmpty', () => {
  it('returns default when input empty', () => {
    const r = normalizeScope('', ['mcp', 'flowpunk'], { defaultIfEmpty: ['mcp'] });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.granted, ['mcp']);
  });
});

describe('scopeListFromSerialized', () => {
  it('parses serialized form', () => {
    assert.deepEqual(scopeListFromSerialized('mcp flowpunk'), ['mcp', 'flowpunk']);
    assert.deepEqual(scopeListFromSerialized(''), []);
    assert.deepEqual(scopeListFromSerialized(null), []);
  });
});

describe('scopeSatisfies', () => {
  it('exact membership', () => {
    assert.equal(scopeSatisfies(['mcp'], 'mcp'), true);
    assert.equal(scopeSatisfies(['mcp'], 'flowpunk'), false);
    assert.equal(scopeSatisfies([], 'mcp'), false);
  });
});
