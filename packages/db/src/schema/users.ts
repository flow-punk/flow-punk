import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Indie platform users (single bound D1).
 *
 * Indie is multi-user (multiple humans share one deployment) but
 * single-tenant per ADR-011 §Tenancy. Exactly one row carries
 * `isAdmin = 1` — the operator. Per ADR-012's admin-auth posture, only
 * the admin user can mint API keys; other users authenticate via session
 * cookie (no OAuth in indie).
 *
 * The first admin row is bootstrapped via `wrangler d1 execute` (operator-
 * local, no HTTP path) — see C4 of the Phase 2b plan and the future indie
 * init CLI.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by'),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
