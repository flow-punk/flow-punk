import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

/**
 * Indie OAuth access + refresh tokens. Token plaintext is `mcp_<random>`
 * (no tenant prefix); only the SHA-256 hex hash is stored.
 *
 * `tokenType` distinguishes access vs refresh; the gateway middleware
 * never accepts refresh tokens on the protected resource path.
 *
 * `familyId` / `familyCreatedAt` / `parentTokenId` support refresh-token
 * family rotation and family-wide revocation on reuse.
 */
export const mcpOauthTokens = sqliteTable(
  'mcp_oauth_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenType: text('token_type').notNull().default('access'),
    familyId: text('family_id').notNull().default(''),
    familyCreatedAt: text('family_created_at').notNull().default(''),
    parentTokenId: text('parent_token_id'),
    clientId: text('client_id').notNull(),
    userId: text('user_id').notNull(),
    audience: text('audience').notNull().default(''),
    scope: text('scope').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    userIdx: index('idx_mcp_oauth_tokens_user_id').on(t.userId),
    familyIdx: index('idx_mcp_oauth_tokens_family_id').on(t.familyId),
  }),
);

export type McpOauthToken = typeof mcpOauthTokens.$inferSelect;
export type NewMcpOauthToken = typeof mcpOauthTokens.$inferInsert;
