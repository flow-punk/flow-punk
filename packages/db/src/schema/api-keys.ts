import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * API keys for the indie auth service.
 *
 * Indie is single-tenant, but API keys still carry a `tenantId` so the
 * gateway can stamp the same trusted identity header shape in both editions.
 * Auth service creation always stores the `_system` sentinel for indie.
 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
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
    tenantIdx: index('idx_api_keys_tenant_id').on(t.tenantId),
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
