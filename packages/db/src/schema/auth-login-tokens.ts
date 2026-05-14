import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Short-lived, one-shot login tokens minted by `flowpunk connect` and
 * consumed at `POST /auth/login` to mint a fresh `mcp_sessions` row.
 *
 * Per ADR-019 amendment 2026-05-06 (two-token bootstrap model): this
 * table is the *only* token type the `/auth/login` form accepts; the
 * long-lived `fp_session` cookie is generated server-side by the login
 * handler and never traverses the operator's terminal.
 *
 * Storage contract:
 * - `tokenHash` = SHA-256 hex of the plaintext token (CLI prints the
 *   plaintext exactly once). UNIQUE index for lookup.
 * - `expiresAt` = ISO 8601 timestamp; CLI sets `now + 5min`.
 * - `consumedAt` = NULL until the login handler atomically marks it on
 *   first use; second-use lookups still find the row but the handler
 *   rejects on the non-null marker.
 */
export const authLoginTokens = sqliteTable(
  "auth_login_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (t) => ({
    userIdx: index("idx_auth_login_tokens_user_id").on(t.userId),
  }),
);

export type AuthLoginToken = typeof authLoginTokens.$inferSelect;
export type NewAuthLoginToken = typeof authLoginTokens.$inferInsert;
