import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ServiceName } from '../types.js';
import type { MigrationFile } from '@flowpunk/cf-admin';
import { CliError } from '../util/errors.js';

/**
 * Locate the bundled artifacts shipped inside the npm tarball.
 *
 * Layout (set up by scripts/prepublish.ts):
 *   dist/
 *     cli.js                (the entry; not used here)
 *     workers/
 *       gateway/index.js
 *       auth/index.js
 *       contacts/index.js
 *       pipeline/index.js
 *       users/index.js
 *     migrations/
 *       0001_users.sql ... 0008_*.sql
 *
 * The CLI runs from `dist/cli.js`, so resolving `../workers/...` from this
 * file's import.meta.url lands at `dist/workers/...` after bundling.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// During development (tsx) HERE is .../src/flow. After bundling HERE is .../dist.
// The bundled CLI is a single file at dist/cli.js, so worker artifacts live at
// dist/workers/... — relative path is `./workers/...` from the bundle.
// In dev, the prepublish script writes into `dist/workers/` from repo root, and
// we still resolve via `../../dist/workers` from here.
function bundleRoot(): string {
  // dist build (single bundled file): import.meta.url is dist/cli.js
  if (HERE.endsWith('/dist') || HERE.endsWith('\\dist')) {
    return HERE;
  }
  // dev (tsx run from src/flow): bundles live at <pkg>/dist
  return join(HERE, '..', '..', 'dist');
}

export async function loadWorkerBundle(service: ServiceName): Promise<Uint8Array> {
  const root = bundleRoot();
  const path = join(root, 'workers', service, 'index.js');
  try {
    const buf = await readFile(path);
    return new Uint8Array(buf);
  } catch (err) {
    throw new CliError(
      `Worker bundle not found for ${service}`,
      `Expected at ${path}. Did the prepublish step run? (${(err as Error).message})`,
    );
  }
}

export function hashBundle(bytes: Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

export async function loadMigrations(): Promise<MigrationFile[]> {
  const root = bundleRoot();
  const dir = join(root, 'migrations');
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    throw new CliError(
      'Migration files not found',
      `Expected directory ${dir}. Did the prepublish step run? (${(err as Error).message})`,
    );
  }
  const out: MigrationFile[] = [];
  for (const name of files) {
    const sql = await readFile(join(dir, name), 'utf8');
    out.push({ name, sql });
  }
  return out;
}
