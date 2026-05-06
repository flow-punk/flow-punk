/**
 * Indie OAuth token repository.
 *
 * Tokens are minted as `mcp_<random>` (no tenant prefix). This repo
 * never sees the plaintext — only the SHA-256 hex hash. All single-
 * statement updates are proxy-safe.
 *
 * `revokeForUser` is called by the indie users wrapper on a successful
 * soft-delete (cascade revocation).
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  mcpOauthTokens,
  type McpOauthToken,
  type NewMcpOauthToken,
} from '../schema/mcp-oauth-tokens.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class OauthTokensRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'OauthTokensRepoError';
  }
}

export async function create(db: Db, input: NewMcpOauthToken): Promise<McpOauthToken> {
  const inserted = await db.insert(mcpOauthTokens).values(input).returning();
  const row = inserted[0];
  if (!row) {
    throw new OauthTokensRepoError('invariant_violation', 'insert returned no row');
  }
  return row;
}

export async function findByHash(
  db: Db,
  tokenHash: string,
): Promise<McpOauthToken | null> {
  const rows = await db
    .select()
    .from(mcpOauthTokens)
    .where(eq(mcpOauthTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeByHash(db: Db, tokenHash: string, now: string): Promise<void> {
  await db
    .update(mcpOauthTokens)
    .set({ revokedAt: now, updatedAt: now, updatedBy: 'oauth-revoke' })
    .where(and(eq(mcpOauthTokens.tokenHash, tokenHash), isNull(mcpOauthTokens.revokedAt)));
}

/**
 * Family-wide revoke: refresh-token reuse detection. When a refresh
 * token is replayed, the entire family is revoked.
 */
export async function revokeFamily(db: Db, familyId: string, now: string): Promise<void> {
  if (!familyId) return;
  await db
    .update(mcpOauthTokens)
    .set({ revokedAt: now, updatedAt: now, updatedBy: 'oauth-revoke-family' })
    .where(and(eq(mcpOauthTokens.familyId, familyId), isNull(mcpOauthTokens.revokedAt)));
}

/**
 * Cascade revoke: every active token for a user. Called by the indie
 * users wrapper after a successful soft-delete (idempotency replay does
 * NOT trigger this — original-request semantics).
 */
export async function revokeForUser(
  db: Db,
  userId: string,
  now: string,
): Promise<number> {
  const result = await db.run(sql`
    UPDATE mcp_oauth_tokens
    SET revoked_at = ${now},
        updated_at = ${now},
        updated_by = 'users-cascade'
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `);
  return getChanges(result);
}

interface RunResult {
  meta?: { changes?: number };
  changes?: number;
}

function getChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as RunResult;
  if (typeof r.changes === 'number') return r.changes;
  if (r.meta && typeof r.meta.changes === 'number') return r.meta.changes;
  return 0;
}
