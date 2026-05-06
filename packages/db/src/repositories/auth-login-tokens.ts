import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';

import {
  authLoginTokens,
  type AuthLoginToken,
  type NewAuthLoginToken,
} from '../schema/auth-login-tokens.js';

type Db = DrizzleD1Database<Record<string, never>>;

export async function insert(db: Db, row: NewAuthLoginToken): Promise<void> {
  await db.insert(authLoginTokens).values(row);
}

/**
 * Look up by SHA-256 hex of the plaintext token. Caller is responsible
 * for checking `expiresAt` and `consumedAt` — this returns the row even
 * if expired/consumed so the handler can distinguish "unknown token"
 * from "stale token" if it ever needs to (today both surface as the
 * same generic error to avoid leaking liveness).
 */
export async function findByHash(
  db: Db,
  tokenHash: string,
): Promise<AuthLoginToken | null> {
  const rows = await db
    .select()
    .from(authLoginTokens)
    .where(eq(authLoginTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically mark a token consumed iff `consumed_at` is still NULL.
 * Returns true on the call that performed the marking; false if the
 * row was already consumed or doesn't exist. Race-safe single-shot.
 *
 * Mirrors the `db.run(sql`...`)` + `getChanges` pattern established by
 * `oauth-authorize-requests.consumeGated` and the users repo.
 */
export async function consume(
  db: Db,
  id: string,
  nowIso: string,
): Promise<boolean> {
  const result = await db.run(sql`
    UPDATE auth_login_tokens
    SET consumed_at = ${nowIso}
    WHERE id = ${id} AND consumed_at IS NULL
  `);
  return getChanges(result) > 0;
}

interface RunResult {
  meta?: { changes?: number; rows_written?: number };
  changes?: number;
}

function getChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as RunResult;
  if (typeof r.changes === 'number') return r.changes;
  if (r.meta && typeof r.meta.changes === 'number') return r.meta.changes;
  if (r.meta && typeof r.meta.rows_written === 'number') return r.meta.rows_written;
  return 0;
}
