/**
 * Indie OAuth client repository.
 *
 * Single-tenant indie. Registration is unauthenticated per ADR-019;
 * `createdBy` / `updatedBy` are nullable. The DCR cap is enforced by
 * the OAuth handler reading `count()` before insert; this repo just
 * surfaces the count and never gates writes itself.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';

import {
  mcpOauthClients,
  type McpOauthClient,
  type NewMcpOauthClient,
} from '../schema/mcp-oauth-clients.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class OauthClientsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
    public readonly detailCode?: string,
  ) {
    super(message);
    this.name = 'OauthClientsRepoError';
  }
}

export async function create(db: Db, input: NewMcpOauthClient): Promise<McpOauthClient> {
  try {
    const inserted = await db.insert(mcpOauthClients).values(input).returning();
    const row = inserted[0];
    if (!row) {
      throw new OauthClientsRepoError('invariant_violation', 'insert returned no row');
    }
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new OauthClientsRepoError(
        'wrong_state',
        'client_id already exists',
        'CLIENT_ID_TAKEN',
      );
    }
    throw err;
  }
}

export async function findByClientId(
  db: Db,
  clientId: string,
): Promise<McpOauthClient | null> {
  const rows = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

export async function count(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(mcpOauthClients);
  return Number(rows[0]?.n ?? 0);
}

export async function touchLastUsed(
  db: Db,
  clientId: string,
  now: string,
): Promise<void> {
  await db
    .update(mcpOauthClients)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(mcpOauthClients.clientId, clientId));
}

/**
 * Stale-client GC candidates: never used (`last_used_at IS NULL`) and
 * registered more than `cutoffIso` ago. ADR-019 §12 sets cutoff to 90
 * days; the operator-side scheduler decides cadence.
 */
export async function listStale(
  db: Db,
  cutoffIso: string,
): Promise<McpOauthClient[]> {
  return db
    .select()
    .from(mcpOauthClients)
    .where(and(isNull(mcpOauthClients.lastUsedAt), lt(mcpOauthClients.createdAt, cutoffIso)));
}

export async function deleteByClientId(db: Db, clientId: string): Promise<void> {
  await db.delete(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    /unique constraint|constraint failed|SQLITE_CONSTRAINT/i.test(err.message)
  );
}
