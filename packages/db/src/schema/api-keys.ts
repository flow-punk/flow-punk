import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * API keys for the auth service (both editions).
 *
 * Lives in the per-tenant D1 (managed) or single bound D1 (indie) — never
 * in PARENT_DB. Per ADR-001:19 there is no `tenant_id` column; the
 * tenant is the D1 the row lives in. The encoded `fpk_` token carries
 * the tenant scope as a prefix (`fpk_<scope>.<random>`) so the gateway
 * knows which D1 to route validation to before calling AUTH_SERVICE.
 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    hash: text('hash').notNull(),
    prefix: text('prefix').notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: text('expires_at'),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    userIdx: index('idx_api_keys_user_id').on(t.userId),
    hashIdx: uniqueIndex('idx_api_keys_hash_unique').on(t.hash),
    userLabelActiveUnique: uniqueIndex('idx_api_keys_user_label_active_unique')
      .on(t.userId, t.label)
      .where(sql`revoked_at IS NULL`),
  }),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export const API_KEY_SCOPE_VALUES = ['read', 'write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPE_VALUES)[number];
