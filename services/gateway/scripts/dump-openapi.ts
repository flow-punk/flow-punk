#!/usr/bin/env node
/**
 * Dumps the assembled indie OpenAPI spec to stdout (or to a file via
 * `--out <path>`). Run via `pnpm -C indie/services/gateway spec:dump`.
 *
 * Indie standalone safe — never references any path inside `managed/`.
 * The parent-root `pnpm spec:dump` orchestrates writing the output into
 * `managed/docs/api-spec/indie.openapi.json`.
 */

import { writeFileSync } from 'node:fs';
import { stdout } from 'node:process';

import { buildIndieSpec } from '../src/openapi/indie-spec.js';

function parseArgs(argv: string[]): { out?: string } {
  const result: { out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      result.out = argv[i + 1];
      i++;
    } else if (arg && arg.startsWith('--out=')) {
      result.out = arg.slice('--out='.length);
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const json = JSON.stringify(buildIndieSpec(), null, 2);

if (args.out) {
  writeFileSync(args.out, json + '\n', 'utf8');
} else {
  stdout.write(json + '\n');
}
