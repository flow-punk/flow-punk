import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import { mcpSessions, type McpSession } from '../schema/mcp-sessions.js';

type Db = DrizzleD1Database<Record<string, never>>;

/**
 * Look up an indie session by SHA-256 hex of its cookie value.
 *
 * Mirrors managed's `findByCookieHash`. The validator runs after this lookup
 * to enforce expiry, revocation, and admin gating.
 */
export async function findByCookieHash(
  db: Db,
  cookieHash: string,
): Promise<McpSession | null> {
  const rows = await db
    .select()
    .from(mcpSessions)
    .where(eq(mcpSessions.cookieHash, cookieHash))
    .limit(1);
  return rows[0] ?? null;
}
