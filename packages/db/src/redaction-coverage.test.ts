/**
 * Redaction-coverage test (ADR-022 §9).
 *
 * `deal_history.changes` is `pii()`-marked at the schema layer; the
 * structured logger's redactor treats the column blob as opaque. But the
 * pii() marker only works if NO code path parses `changes` and then logs
 * the parsed object — that would bypass the marker entirely.
 *
 * Rule: `changes` is logged as opaque text or not at all. This test
 * greps the indie source tree for forbidden patterns. It is a coverage
 * check, not a runtime guard — a regression here means a code reviewer
 * missed a future logger call that touched `changes.from` / `changes.to`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk indie/packages and indie/services (the entire indie source tree
// that touches deal_history). Skip node_modules and dist folders.
const INDIE_ROOT = resolve(__dirname, '../../..');

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') {
      continue;
    }
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      yield full;
    }
  }
}

// Forbidden patterns: a logger / structured-error / JSON-stringify call
// that references parsed `changes.from` or `changes.to` cleartext.
// Comments inside the source are allowed — they're stripped before
// matching (single-line and block-comment elision).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN = [
  // `logger.info('...', { ...changes.from })` or `.changes.to` etc.
  /\bchanges\.(from|to)\b/,
  // `JSON.parse(...changes...)` followed by logging is impossible to
  // grep deterministically without a parser; the rule above catches
  // the common dotted-access shape.
];

test('no source file accesses changes.from / changes.to cleartext', async () => {
  const offenders: string[] = [];
  for await (const file of walk(INDIE_ROOT)) {
    // Allow the serializer module itself — it CONSTRUCTS the payload but
    // never logs it.
    if (file.endsWith('deal-history-serialize.ts')) continue;
    const raw = await readFile(file, 'utf8');
    const src = stripComments(raw);
    for (const pattern of FORBIDDEN) {
      if (pattern.test(src)) {
        offenders.push(`${file} matches ${pattern}`);
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Forbidden cleartext access to deal_history.changes:\n${offenders.join('\n')}`,
  );
});
