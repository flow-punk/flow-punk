import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Indie OAuth dynamic-registration clients (RFC 7591). Single-tenant —
 * `clientId` is plain `mcpc_<random>` with no tenant prefix.
 *
 * Per ADR-019, registration is unauthenticated. `createdBy` / `updatedBy`
 * are NULLABLE: there is no authenticated actor at registration time.
 * `lastUsedAt` is set on first successful authorize and powers the
 * 90-day stale-client GC.
 */
export const mcpOauthClients = sqliteTable("mcp_oauth_clients", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientName: text("client_name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  grantTypes: text("grant_types").notNull(),
  responseTypes: text("response_types").notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export type McpOauthClient = typeof mcpOauthClients.$inferSelect;
export type NewMcpOauthClient = typeof mcpOauthClients.$inferInsert;
