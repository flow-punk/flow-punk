#!/usr/bin/env tsx
/**
 * Prepublish: build all 5 indie worker bundles and bundle the CLI.
 *
 * Steps:
 *   1. For each indie service (gateway/auth/contacts/pipeline/users), run
 *      `wrangler deploy --dry-run --outdir=<svc>/dist` from the service dir.
 *   2. Copy each emitted bundle to `dist/workers/<svc>/index.js`.
 *   3. Copy `indie/packages/db/migrations/*.sql` to `dist/migrations/`.
 *   4. Run `tsx scripts/build-cli.ts` to bundle the CLI.
 *
 * The published tarball contains:
 *   dist/cli.js
 *   dist/workers/<svc>/index.js
 *   dist/migrations/*.sql
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, copyFile, readdir, readFile } from "node:fs/promises";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(SCRIPT_DIR, "..");
// PKG_ROOT = indie/packages/cli; INDIE_ROOT = indie
const INDIE_ROOT = resolve(PKG_ROOT, "..", "..");

const SERVICES = ["gateway", "auth", "contacts", "pipeline", "users"] as const;

async function main(): Promise<void> {
  await mkdir(resolve(PKG_ROOT, "dist/workers"), { recursive: true });
  await mkdir(resolve(PKG_ROOT, "dist/migrations"), { recursive: true });

  for (const svc of SERVICES) {
    const svcDir = resolve(INDIE_ROOT, "services", svc);
    process.stdout.write(`\n=== building worker: ${svc} ===\n`);
    const result = spawnSync(
      "npx",
      ["wrangler", "deploy", "--dry-run", "--outdir=dist"],
      {
        cwd: svcDir,
        stdio: "inherit",
      },
    );
    if (result.status !== 0) {
      throw new Error(`wrangler dry-run failed for ${svc}`);
    }
    const targetDir = resolve(PKG_ROOT, "dist/workers", svc);
    await mkdir(targetDir, { recursive: true });
    await copyFile(
      resolve(svcDir, "dist/index.js"),
      resolve(targetDir, "index.js"),
    );
    process.stdout.write(`  → copied to dist/workers/${svc}/index.js\n`);
  }

  // Migrations.
  process.stdout.write("\n=== copying migrations ===\n");
  const migDir = resolve(INDIE_ROOT, "packages/db/migrations");
  const migFiles = (await readdir(migDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of migFiles) {
    await copyFile(resolve(migDir, f), resolve(PKG_ROOT, "dist/migrations", f));
  }
  process.stdout.write(`  → copied ${migFiles.length} migration(s)\n`);

  // CLI bundle.
  process.stdout.write("\n=== bundling cli ===\n");
  const cli = spawnSync("tsx", [resolve(SCRIPT_DIR, "build-cli.ts")], {
    stdio: "inherit",
    cwd: PKG_ROOT,
  });
  if (cli.status !== 0) throw new Error("build-cli failed");

  // Guard: the published tarball must not reference any `workspace:*` deps.
  // Workspace packages are private and won't resolve for npm consumers; the
  // CLI bundles them via esbuild instead, so they belong in devDependencies.
  process.stdout.write(
    "\n=== verifying no workspace:* in published deps ===\n",
  );
  const pkgJsonRaw = await readFile(resolve(PKG_ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(pkgJsonRaw) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const offenders: string[] = [];
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    const block = pkg[field];
    if (!block) continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec === "string" && spec.startsWith("workspace:")) {
        offenders.push(`${field}.${name}=${spec}`);
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `workspace:* protocol found in published fields: ${offenders.join(", ")}. ` +
        `Move these to devDependencies (esbuild bundles them into dist/cli.js).`,
    );
  }
  process.stdout.write("  → ok, no workspace:* in dependencies\n");

  process.stdout.write("\n=== prepublish complete ===\n");
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(1);
});
