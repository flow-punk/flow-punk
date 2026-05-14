import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

/**
 * Indie OAuth pending authorize requests (cookie-bound between
 * `/oauth/authorize` and `/oauth/approve`). The `cookie_binding_hash`
 * is the SHA-256 of the `fp_oauth_approve` cookie; `csrf_nonce_hash` is
 * the SHA-256 of a single-use nonce embedded in the consent form. Both
 * ship from day one — defense in depth.
 */
export const mcpOauthAuthorizeRequests = sqliteTable(
  "mcp_oauth_authorize_requests",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    resource: text("resource").notNull(),
    state: text("state").notNull(),
    scope: text("scope").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    cookieBindingHash: text("cookie_binding_hash").notNull(),
    csrfNonceHash: text("csrf_nonce_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => ({
    clientIdx: index("idx_mcp_oauth_authorize_requests_client_id").on(
      t.clientId,
    ),
  }),
);

export type McpOauthAuthorizeRequest =
  typeof mcpOauthAuthorizeRequests.$inferSelect;
export type NewMcpOauthAuthorizeRequest =
  typeof mcpOauthAuthorizeRequests.$inferInsert;
