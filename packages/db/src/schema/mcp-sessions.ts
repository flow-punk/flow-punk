import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Cookie-backed sessions for indie's admin-REST surface.
 *
 * Mirrors the managed `mcp_sessions` schema exactly so `validate-session.ts`
 * is structurally identical between editions (the only difference is which
 * D1 binding it reads from — `DB` in indie, `PARENT_DB` in managed). Per
 * ADR-011 §Behavioral variation, the implementations are duplicated rather
 * than shared.
 *
 * `tenantId` is NOT NULL even though indie is single-tenant per ADR-011 —
 * populated with whatever single-tenant identifier the deploy uses. This
 * avoids cross-edition divergence at the validator level.
 *
 * Storage contract:
 * - `cookieHash` is the SHA-256 hex of the random cookie value. Plaintext
 *   cookie is never persisted.
 * - `cookieHash` is UNIQUE.
 * - `userId` references `users.id`; admin gating happens in the validator
 *   (`users.isAdmin === true`).
 * - `expiresAt` / `revokedAt` are ISO 8601 text timestamps.
 */
export const mcpSessions = sqliteTable(
  'mcp_sessions',
  {
    id: text('id').primaryKey(),
    cookieHash: text('cookie_hash').notNull().unique(),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
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
