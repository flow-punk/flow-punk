#!/usr/bin/env tsx
/**
 * Bundle the CLI entry into a single ESM file at `dist/cli.js`.
 *
 * - All `@flowpunk/*` workspace deps are bundled in (so the published tarball
 *   doesn't need them at install time).
 * - Node built-ins, `wrangler`, `@clack/prompts`, `commander`, `picocolors`,
 *   `gradient-string` stay external (declared as runtime deps in package.json).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(SCRIPT_DIR, '..');

const EXTERNAL = [
  '@clack/prompts',
  'commander',
  'gradient-string',
  'picocolors',
  'wrangler',
];

async function main(): Promise<void> {
  await mkdir(resolve(PKG_ROOT, 'dist'), { recursive: true });
  await build({
    entryPoints: [resolve(PKG_ROOT, 'src/cli.ts')],
    outfile: resolve(PKG_ROOT, 'dist/cli.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: EXTERNAL,
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    logLevel: 'info',
  });
  process.stdout.write('built dist/cli.js\n');
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(1);
});
