/**
 * Indie OAuth authorization-code repository.
 *
 * Single-use codes; consumption is a single-statement
 * `UPDATE … SET used_at = … WHERE used_at IS NULL` so a replay race
 * cannot mint two token pairs from one code.
 */
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";

import {
  mcpOauthCodes,
  type McpOauthCode,
  type NewMcpOauthCode,
} from "../schema/mcp-oauth-codes.js";

type Db = DrizzleD1Database<Record<string, never>>;

export class OauthCodesRepoError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_input"
      | "wrong_state"
      | "invariant_violation",
    message: string,
  ) {
    super(message);
    this.name = "OauthCodesRepoError";
  }
}

export async function create(
  db: Db,
  input: NewMcpOauthCode,
): Promise<McpOauthCode> {
  const inserted = await db.insert(mcpOauthCodes).values(input).returning();
  const row = inserted[0];
  if (!row) {
    throw new OauthCodesRepoError(
      "invariant_violation",
      "insert returned no row",
    );
  }
  return row;
}

export async function findByHash(
  db: Db,
  codeHash: string,
): Promise<McpOauthCode | null> {
  const rows = await db
    .select()
    .from(mcpOauthCodes)
    .where(eq(mcpOauthCodes.codeHash, codeHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomic single-use consumption. Returns the row if marked used, null
 * if the code was already consumed.
 */
export async function consume(
  db: Db,
  codeHash: string,
  now: string,
): Promise<McpOauthCode | null> {
  const result = await db.run(sql`
    UPDATE mcp_oauth_codes
    SET used_at = ${now},
        updated_at = ${now},
        updated_by = 'oauth-token'
    WHERE code_hash = ${codeHash}
      AND used_at IS NULL
  `);
  if (getChanges(result) === 0) return null;
  return findByHash(db, codeHash);
}

interface RunResult {
  meta?: { changes?: number };
  changes?: number;
}

function getChanges(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const r = result as RunResult;
  if (typeof r.changes === "number") return r.changes;
  if (r.meta && typeof r.meta.changes === "number") return r.meta.changes;
  return 0;
}
