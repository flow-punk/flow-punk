import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

/**
 * Indie OAuth authorization codes (PKCE). Single-use; consumption is a
 * single-statement `UPDATE … SET used_at = … WHERE used_at IS NULL` so a
 * replay race cannot consume the same code twice.
 */
export const mcpOauthCodes = sqliteTable(
  "mcp_oauth_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    resource: text("resource").notNull(),
    scope: text("scope").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => ({
    clientIdx: index("idx_mcp_oauth_codes_client_id").on(t.clientId),
  }),
);

export type McpOauthCode = typeof mcpOauthCodes.$inferSelect;
export type NewMcpOauthCode = typeof mcpOauthCodes.$inferInsert;
