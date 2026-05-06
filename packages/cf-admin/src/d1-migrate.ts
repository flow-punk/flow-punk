import { type CfClient } from './client.js';
import { applyD1Migrations, queryD1 } from './d1.js';

const TRACKING_TABLE = 'd1_migrations';

export interface MigrationFile {
  /** Filename, e.g. `0001_users.sql`. Used as the unique tracking key. */
  name: string;
  sql: string;
}

export interface MigrateResult {
  applied: string[];
  pending: string[];
  alreadyApplied: string[];
  failed?: { name: string; error: string };
}

/**
 * Apply migration files against a D1 database with applied-state tracking.
 *
 * Maintains a `d1_migrations` table (wrangler-compatible schema). On each
 * call, lists applied migrations, diffs against the supplied list (in
 * lexical order — files MUST be pre-sorted, typically `0001_*.sql .. NNNN_*.sql`),
 * applies pending ones, and records each successful apply in the tracking
 * table. Stops on first failure.
 */
export async function migrateD1(
  client: CfClient,
  input: { databaseId: string; migrations: ReadonlyArray<MigrationFile> },
): Promise<MigrateResult> {
  await ensureTrackingTable(client, input.databaseId);
  const appliedSet = await listApplied(client, input.databaseId);

  const alreadyApplied: string[] = [];
  const pending: MigrationFile[] = [];
  for (const m of input.migrations) {
    if (appliedSet.has(m.name)) {
      alreadyApplied.push(m.name);
    } else {
      pending.push(m);
    }
  }

  const applied: string[] = [];
  for (const migration of pending) {
    const result = await applyD1Migrations(client, {
      databaseId: input.databaseId,
      migrations: [migration],
    });
    if (result.failed) {
      return {
        applied,
        pending: pending.slice(applied.length).map((m) => m.name),
        alreadyApplied,
        failed: result.failed,
      };
    }
    await queryD1(client, {
      databaseId: input.databaseId,
      sql: `INSERT INTO ${TRACKING_TABLE} (name) VALUES (?);`,
      params: [migration.name],
    });
    applied.push(migration.name);
  }

  return {
    applied,
    pending: pending.slice(applied.length).map((m) => m.name),
    alreadyApplied,
  };
}

/** Read the set of applied migration names. */
export async function listAppliedMigrations(
  client: CfClient,
  databaseId: string,
): Promise<string[]> {
  await ensureTrackingTable(client, databaseId);
  const set = await listApplied(client, databaseId);
  return Array.from(set).sort();
}

async function ensureTrackingTable(
  client: CfClient,
  databaseId: string,
): Promise<void> {
  await queryD1(client, {
    databaseId,
    sql: `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  });
}

async function listApplied(
  client: CfClient,
  databaseId: string,
): Promise<Set<string>> {
  const rows = await queryD1(client, {
    databaseId,
    sql: `SELECT name FROM ${TRACKING_TABLE};`,
  });
  const names = new Set<string>();
  for (const r of rows) {
    if (Array.isArray(r.results)) {
      for (const row of r.results) {
        if (row && typeof row === 'object' && 'name' in row) {
          const n = (row as { name: unknown }).name;
          if (typeof n === 'string') names.add(n);
        }
      }
    }
  }
  return names;
}
