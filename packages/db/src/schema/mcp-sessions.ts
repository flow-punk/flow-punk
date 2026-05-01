import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Cookie-backed sessions for both editions' admin-REST surface.
 *
 * This table lives in the per-tenant D1 (managed) or the single bound D1
 * (indie) — never in PARENT_DB. Per ADR-001:19 there is no `tenant_id`
 * column; the tenant is the D1 the row lives in. The encoded `fp_session`
 * cookie carries the tenant scope as a prefix (`<scope>.<sessionId>`)
 * so the gateway validator knows which D1 to query.
 *
 * Storage contract:
 * - `cookieHash` is the SHA-256 hex of the *raw* cookie value (the full
 *   `<scope>.<sessionId>` string). Plaintext cookie is never persisted.
 * - `cookieHash` is UNIQUE.
 * - `userId` references `users.id`; role gating happens in the validator
 *   (`hasAdminRights(user.role)` for admin-REST paths).
 * - `expiresAt` / `revokedAt` are ISO 8601 text timestamps.
 */
export const mcpSessions = sqliteTable(
  'mcp_sessions',
  {
    id: text('id').primaryKey(),
    cookieHash: text('cookie_hash').notNull().unique(),
    userId: text('user_id').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by'),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by'),
  },
  (t) => ({
    userIdx: index('idx_mcp_sessions_user_id').on(t.userId),
  }),
);

export type McpSession = typeof mcpSessions.$inferSelect;
export type NewMcpSession = typeof mcpSessions.$inferInsert;
