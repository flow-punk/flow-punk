#!/usr/bin/env node
/**
 * Indie-bundle scrub (Phase 6 / ADR-020 §5 + dashboard implementation
 * plan §"Guiding rules" — "Indie must not hint at managed features").
 *
 * Walks the emitted Vite bundle under `dist/` and fails the build if
 * any forbidden marker string appears in any JS file. This is the
 * runtime invariant behind the indie-side guarantee that no
 * cross-host switcher / managed-only auth code reaches end users.
 *
 * Forbidden markers cover the four entry points we care about:
 *   - `/__session/redeem`      — the redeem route path. If it appears
 *                                in a JS file the route must have
 *                                been registered.
 *   - `WorkspaceSwitcher`      — the React component name. esbuild
 *                                does NOT mangle top-level function
 *                                names by default (no `--minify` for
 *                                indie dev/preview builds), and the
 *                                managed app's main.tsx imports the
 *                                symbol by name — bundling it would
 *                                leave the identifier in the chunk.
 *   - `@flowpunk-managed/dashboard-auth` — the managed package id.
 *                                Vite resolves this at module
 *                                graph build; any import path that
 *                                survives would show the package id
 *                                in chunk metadata.
 *   - `crossHostSwitcher`      — the feature flag key. Indie's
 *                                `createDashboardApp({features: {}})`
 *                                doesn't reference the flag at all;
 *                                presence implies the managed code
 *                                paths got bundled.
 *
 * Exits non-zero on any hit so CI can hard-fail.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(process.cwd(), "dist");

const FORBIDDEN = [
  "/__session/redeem",
  "WorkspaceSwitcher",
  "@flowpunk-managed/dashboard-auth",
  "crossHostSwitcher",
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && /\.(js|mjs|cjs|html)$/.test(entry)) {
      yield full;
    }
  }
}

function main() {
  try {
    statSync(DIST);
  } catch {
    console.error(`verify-bundle-clean: dist/ not found at ${DIST}.`);
    console.error("Run `pnpm build` first.");
    process.exit(1);
  }

  const offenders = [];
  for (const file of walk(DIST)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const marker of FORBIDDEN) {
      if (text.includes(marker)) {
        offenders.push({ file, marker });
      }
    }
  }

  if (offenders.length === 0) {
    console.log(
      `verify-bundle-clean: OK (${FORBIDDEN.length} markers checked across dist/)`,
    );
    process.exit(0);
  }

  console.error("verify-bundle-clean: FORBIDDEN markers found in indie bundle");
  for (const o of offenders) {
    console.error(`  ${o.marker}  →  ${o.file}`);
  }
  console.error(
    "\nIndie builds must not hint at managed-only features. " +
      "Either the conditional gating in dashboard-app regressed, or a " +
      "managed-only package was pulled into the indie module graph.",
  );
  process.exit(1);
}

main();
