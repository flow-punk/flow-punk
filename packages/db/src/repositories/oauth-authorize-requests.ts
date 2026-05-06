/**
 * Indie OAuth pending authorize-request repository.
 *
 * Cookie-bound between `/oauth/authorize` (insert) and `/oauth/approve`
 * (consume). The `cookie_binding_hash` is the SHA-256 of the
 * `fp_oauth_approve` cookie value; `csrf_nonce_hash` is the SHA-256 of
 * the form-embedded single-use CSRF nonce. Atomic consume-by-id verifies
 * BOTH and deletes the row in a single statement.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';

import {
  mcpOauthAuthorizeRequests,
  type McpOauthAuthorizeRequest,
  type NewMcpOauthAuthorizeRequest,
} from '../schema/mcp-oauth-authorize-requests.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class OauthAuthorizeRequestsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'OauthAuthorizeRequestsRepoError';
  }
}

export async function create(
  db: Db,
  input: NewMcpOauthAuthorizeRequest,
): Promise<McpOauthAuthorizeRequest> {
  const inserted = await db.insert(mcpOauthAuthorizeRequests).values(input).returning();
  const row = inserted[0];
  if (!row) {
    throw new OauthAuthorizeRequestsRepoError(
      'invariant_violation',
      'insert returned no row',
    );
  }
  return row;
}

export async function findById(
  db: Db,
  id: string,
): Promise<McpOauthAuthorizeRequest | null> {
  const rows = await db
    .select()
    .from(mcpOauthAuthorizeRequests)
    .where(eq(mcpOauthAuthorizeRequests.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomic consume gated on id + cookie_binding_hash + csrf_nonce_hash.
 * Returns the row if deleted, null if the gates fail (replay, stolen
 * cookie alone, stolen nonce alone). The handler should treat null as
 * `invalid_request` per OAuth 2.1.
 */
export async function consumeGated(
  db: Db,
  id: string,
  cookieBindingHash: string,
  csrfNonceHash: string,
): Promise<McpOauthAuthorizeRequest | null> {
  const existing = await findById(db, id);
  if (!existing) return null;
  if (existing.cookieBindingHash !== cookieBindingHash) return null;
  if (existing.csrfNonceHash !== csrfNonceHash) return null;

  const result = await db.run(sql`
    DELETE FROM mcp_oauth_authorize_requests
    WHERE id = ${id}
      AND cookie_binding_hash = ${cookieBindingHash}
      AND csrf_nonce_hash = ${csrfNonceHash}
  `);
  if (getChanges(result) === 0) return null;
  return existing;
}

export async function deleteById(db: Db, id: string): Promise<void> {
  await db.run(sql`
    DELETE FROM mcp_oauth_authorize_requests WHERE id = ${id}
  `);
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
