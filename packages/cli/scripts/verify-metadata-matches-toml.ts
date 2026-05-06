#!/usr/bin/env tsx
/**
 * CI guard: parse each indie service's wrangler.toml and diff its top-level
 * runtime configuration (compatibility_date, compatibility_flags, vars,
 * workers_dev, KV/D1/service/DO bindings) against the constants in
 * `src/flow/script-metadata.ts`. Exits non-zero on drift.
 *
 * Why this exists: the CLI does not parse wrangler.toml at runtime. If a
 * developer adds a new binding, var, or compatibility flag to the live
 * wrangler.toml without updating script-metadata.ts, the next CLI release
 * silently ships the old configuration.
 *
 * NOTE: This is a structural guard, not a strict equality check. We compare
 * the union of binding keys, the set of vars, the compatibility_date, and
 * compatibility_flags. Service-binding TARGET names in wrangler.toml include
 * managed-only entries (AUTOMATIONS_SERVICE, etc.) — those are EXPECTED
 * exclusions per ADR-017 and are reported as "ok: managed-only excluded"
 * rather than as drift.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildScriptMetadata,
  isPubliclyExposed,
  scriptName,
} from '../src/flow/script-metadata.js';
import type { BindingMetadata } from '@flowpunk/cf-admin';
import type { ResourceInventory, ServiceName } from '../src/types.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(SCRIPT_DIR, '..');
const INDIE_ROOT = resolve(PKG_ROOT, '..', '..');

const SERVICES: ServiceName[] = ['gateway', 'auth', 'contacts', 'pipeline', 'users'];

// Service bindings that exist in indie's gateway wrangler.toml but target
// managed-only services and are EXPECTED to be excluded from CLI metadata.
const EXPECTED_MANAGED_ONLY_SERVICE_BINDINGS = new Set([
  'AUTOMATIONS_SERVICE',
  'FORMINPUTS_SERVICE',
  'CMS_SERVICE',
]);

interface TomlConfig {
  compatibilityDate: string | null;
  compatibilityFlags: string[];
  workersDev: boolean | null; // null = not specified (CF default = true)
  vars: Record<string, string>;
  d1Bindings: Set<string>;
  kvBindings: Set<string>;
  serviceBindings: Set<string>;
  doBindings: Set<string>;
  doMigrationTags: string[];
}

function parseToml(text: string): TomlConfig {
  const config: TomlConfig = {
    compatibilityDate: null,
    compatibilityFlags: [],
    workersDev: null,
    vars: {},
    d1Bindings: new Set(),
    kvBindings: new Set(),
    serviceBindings: new Set(),
    doBindings: new Set(),
    doMigrationTags: [],
  };

  const lines = text.split('\n');
  let section: string | null = null;
  let arrayContext: { type: string; current: Record<string, string> } | null = null;

  const commitArray = () => {
    if (!arrayContext) return;
    const { type, current } = arrayContext;
    switch (type) {
      case 'kv_namespaces':
        if (current.binding) config.kvBindings.add(current.binding);
        break;
      case 'd1_databases':
        if (current.binding) config.d1Bindings.add(current.binding);
        break;
      case 'services':
        if (current.binding) config.serviceBindings.add(current.binding);
        break;
      case 'durable_objects.bindings':
        if (current.name) config.doBindings.add(current.name);
        break;
      case 'migrations':
        if (current.tag) config.doMigrationTags.push(current.tag);
        break;
    }
    arrayContext = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      commitArray();
      const name = line.slice(2, -2).trim();
      arrayContext = { type: name, current: {} };
      section = null;
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      commitArray();
      section = line.slice(1, -1).trim();
      continue;
    }

    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!.trim();

    if (arrayContext) {
      arrayContext.current[key] = stripQuotes(value);
      continue;
    }

    if (section === null) {
      if (key === 'compatibility_date') {
        config.compatibilityDate = stripQuotes(value);
      } else if (key === 'compatibility_flags') {
        config.compatibilityFlags = parseStringArray(value);
      } else if (key === 'workers_dev') {
        config.workersDev = value === 'true';
      }
    } else if (section === 'vars') {
      config.vars[key] = stripQuotes(value);
    }
  }
  commitArray();

  return config;
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
}

function parseStringArray(s: string): string[] {
  // Match anything between the outermost brackets.
  const m = s.match(/^\[\s*(.*)\s*\]$/);
  if (!m) return [];
  return (m[1] ?? '')
    .split(',')
    .map((p) => stripQuotes(p.trim()))
    .filter(Boolean);
}

interface CheckResult {
  service: ServiceName;
  errors: string[];
  warnings: string[];
}

function diffService(service: ServiceName, toml: TomlConfig): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build CLI metadata using a fixture inventory.
  const inventory: ResourceInventory = {
    d1: { id: 'fixture-d1', name: 'fixture' },
    kv: {
      MCP_TOOLS_KV: 'kv-1',
      MCP_SESSIONS_KV: 'kv-2',
      LAST_USED_KV: 'kv-3',
      IDEMPOTENCY_KV_CONTACTS: 'kv-4',
      IDEMPOTENCY_KV_PIPELINE: 'kv-5',
      IDEMPOTENCY_KV_USERS: 'kv-6',
    },
    workers: {
      gateway: { name: scriptName('flowpunk', 'gateway') },
      auth: { name: scriptName('flowpunk', 'auth') },
      contacts: { name: scriptName('flowpunk', 'contacts') },
      pipeline: { name: scriptName('flowpunk', 'pipeline') },
      users: { name: scriptName('flowpunk', 'users') },
    },
    doMigrationTag: 'mcp-session-do-v1',
  };
  const cli = buildScriptMetadata({
    service,
    inventory,
    gatewayUrl: 'https://flowpunk-gateway.example.workers.dev',
    isFreshDeploy: true,
    mainModuleFilename: 'index.js',
  });

  // 1. compatibility_date.
  if (cli.compatibility_date !== toml.compatibilityDate) {
    errors.push(
      `compatibility_date: CLI=${cli.compatibility_date} vs wrangler.toml=${toml.compatibilityDate}`,
    );
  }

  // 2. compatibility_flags. CLI omits when none; wrangler.toml may also omit.
  const cliFlags = (cli.compatibility_flags ?? []).slice().sort();
  const tomlFlags = toml.compatibilityFlags.slice().sort();
  if (JSON.stringify(cliFlags) !== JSON.stringify(tomlFlags)) {
    errors.push(
      `compatibility_flags: CLI=${JSON.stringify(cliFlags)} vs wrangler.toml=${JSON.stringify(tomlFlags)}`,
    );
  }

  // 3. workers_dev posture.
  const cliWantsPublic = isPubliclyExposed(service);
  const tomlPublic = toml.workersDev === null ? true : toml.workersDev;
  if (cliWantsPublic !== tomlPublic) {
    errors.push(
      `workers_dev: CLI emits ${cliWantsPublic} but wrangler.toml has ${tomlPublic}`,
    );
  }

  // 4. Bindings — collect what the CLI emits.
  const cliBindings: BindingMetadata[] = cli.bindings ?? [];
  const cliKv = new Set(
    cliBindings.filter((b) => b.type === 'kv_namespace').map((b) => b.name),
  );
  const cliD1 = new Set(
    cliBindings.filter((b) => b.type === 'd1').map((b) => b.name),
  );
  const cliService = new Set(
    cliBindings.filter((b) => b.type === 'service').map((b) => b.name),
  );
  const cliDo = new Set(
    cliBindings
      .filter((b) => b.type === 'durable_object_namespace')
      .map((b) => b.name),
  );
  const cliVars = new Set(
    cliBindings
      .filter((b) => b.type === 'plain_text' || b.type === 'secret_text')
      .map((b) => b.name),
  );

  // 5. KV bindings — must match exactly.
  if (!setsEqual(cliKv, toml.kvBindings)) {
    errors.push(`KV bindings drift: CLI=${[...cliKv].sort().join(',')} vs toml=${[...toml.kvBindings].sort().join(',')}`);
  }

  // 6. D1 bindings — must match exactly.
  if (!setsEqual(cliD1, toml.d1Bindings)) {
    errors.push(`D1 bindings drift: CLI=${[...cliD1].sort().join(',')} vs toml=${[...toml.d1Bindings].sort().join(',')}`);
  }

  // 7. Service bindings — TOML may legitimately have managed-only ones.
  const tomlServiceBindings = new Set(toml.serviceBindings);
  const tomlExtras = [...tomlServiceBindings].filter((n) => !cliService.has(n));
  const unexpectedExtras = tomlExtras.filter(
    (n) => !EXPECTED_MANAGED_ONLY_SERVICE_BINDINGS.has(n),
  );
  if (unexpectedExtras.length > 0) {
    errors.push(
      `Service bindings in toml not in CLI (and not in managed-only allowlist): ${unexpectedExtras.join(',')}`,
    );
  }
  const cliExtras = [...cliService].filter((n) => !tomlServiceBindings.has(n));
  if (cliExtras.length > 0) {
    errors.push(
      `Service bindings in CLI not in toml: ${cliExtras.join(',')}`,
    );
  }
  if (tomlExtras.length > 0 && unexpectedExtras.length === 0) {
    warnings.push(
      `Managed-only service bindings excluded from CLI: ${tomlExtras.join(', ')}`,
    );
  }

  // 8. DO bindings — must match.
  if (!setsEqual(cliDo, toml.doBindings)) {
    errors.push(`DO bindings drift: CLI=${[...cliDo].sort().join(',')} vs toml=${[...toml.doBindings].sort().join(',')}`);
  }

  // 9. Vars — wrangler.toml [vars] keys must equal CLI plain_text/secret_text bindings.
  const tomlVars = new Set(Object.keys(toml.vars));
  if (!setsEqual(cliVars, tomlVars)) {
    errors.push(
      `Vars drift: CLI=${[...cliVars].sort().join(',')} vs toml=${[...tomlVars].sort().join(',')}`,
    );
  } else {
    // Same keys — check values too.
    for (const key of cliVars) {
      const cliBinding = cliBindings.find(
        (b) => b.name === key && (b.type === 'plain_text' || b.type === 'secret_text'),
      );
      if (!cliBinding || (cliBinding.type !== 'plain_text' && cliBinding.type !== 'secret_text')) {
        continue;
      }
      const cliValue = cliBinding.text;
      const tomlValue = toml.vars[key];
      // ALLOWED_ORIGINS is computed at runtime (gateway URL), so don't byte-compare.
      if (key === 'ALLOWED_ORIGINS') continue;
      if (cliValue !== tomlValue) {
        errors.push(`Var ${key}: CLI="${cliValue}" vs toml="${tomlValue}"`);
      }
    }
  }

  return { service, errors, warnings };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

async function main(): Promise<void> {
  let totalErrors = 0;
  for (const service of SERVICES) {
    const tomlPath = resolve(INDIE_ROOT, 'services', service, 'wrangler.toml');
    const text = await readFile(tomlPath, 'utf8');
    const toml = parseToml(text);
    const result = diffService(service, toml);
    process.stdout.write(`\n=== ${service} ===\n`);
    if (result.errors.length === 0) {
      process.stdout.write(`  ✓ no drift\n`);
    } else {
      totalErrors += result.errors.length;
      for (const e of result.errors) process.stdout.write(`  ✗ ${e}\n`);
    }
    for (const w of result.warnings) process.stdout.write(`  • ${w}\n`);
  }
  process.stdout.write('\n');
  if (totalErrors > 0) {
    process.stderr.write(
      `${totalErrors} drift error(s) found. Update src/flow/script-metadata.ts to match wrangler.toml (or vice versa).\n`,
    );
    process.exit(1);
  }
  process.stdout.write('All services: script-metadata.ts matches wrangler.toml.\n');
}

main().catch((err) => {
  process.stderr.write(`${err}\n`);
  process.exit(2);
});
