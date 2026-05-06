export interface Env {
  // Service bindings
  CONTACTS_SERVICE: Fetcher;
  PIPELINE_SERVICE: Fetcher;
  AUTOMATIONS_SERVICE: Fetcher;
  AUTH_SERVICE: Fetcher;
  FORMINPUTS_SERVICE: Fetcher;
  CMS_SERVICE: Fetcher;
  USERS_SERVICE: Fetcher;

  // KV namespaces
  MCP_TOOLS_KV: KVNamespace;
  MCP_SESSIONS_KV: KVNamespace;
  MCP_SESSION_DO: DurableObjectNamespace;

  // OAuth (per ADR-019). `OAUTH_TOKEN_CACHE` carries identity-cache
  // entries (60s TTL), revocation tombstones (`oauth:revoked:<hash>`),
  // and user-invalidation tombstones (`user_invalidated:_system:<userId>`).
  // First-line anti-abuse on `/oauth/register` is the per-install client
  // cap (50) enforced inside `@flowpunk-indie/oauth`. Operators that want
  // IP rate limiting can add Cloudflare WAF rules; managed-edition adds
  // its own `ANON_OAUTH_RATE_LIMITER` binding via `ManagedEnv`.
  OAUTH_TOKEN_CACHE: KVNamespace;
  /**
   * The canonical issuer URL for indie OAuth metadata. Single-tenant indie
   * has one global value (e.g. `https://crm.example.com`). Required for
   * non-loopback requests; loopback dev falls back to the request origin.
   */
  GATEWAY_PUBLIC_ORIGIN?: string;
  /**
   * Comma-separated allowed RFC 8707 `resource` values. Defaults to the
   * configured issuer origin when unset.
   */
  OAUTH_RESOURCE_ALLOWLIST?: string;

  // D1 — indie platform DB (users, mcp_sessions, mcp_oauth_*)
  DB: D1Database;

  // Configuration
  MAX_REQUEST_BODY_BYTES: string;
  SERVICE_TIMEOUT_MS: string;
  ALLOWED_ORIGINS: string;
  /**
   * Comma-separated list of MCP service domains (`contacts`, `pipeline`, …)
   * whose `GET /mcp/tools` endpoint is adopted. Listed services are queried
   * dynamically; unlisted services use the static-registry fallback. Empty
   * string → all services use static fallback (default for new
   * deployments). Setting this is the gating mechanism for staged rollout.
   */
  MCP_TOOLS_DYNAMIC_SERVICES: string;
  /**
   * Build-time edition marker injected by each gateway wrapper's wrangler
   * config. `'all'` = indie subset only; `'managed'` = indie subset plus
   * managed-only tools. Edition is a wrapper concern, not a per-tenant
   * concern; it is set once per worker deployment.
   */
  EDITION: 'all' | 'managed';
  /**
   * Local-dev-only flag (ADR-014). When set to `'1'`, exposes the OpenAPI
   * spec at `/openapi.json` and Swagger UI at `/docs`. The flag MUST live
   * in `.dev.vars` only — never in `wrangler.toml` `[vars]` — so it is
   * undefined on deployed workers.
   */
  OPENAPI_ENABLED?: string;
}

import type { CredentialType } from './auth/identity-headers.js';

export interface AppContext {
  request: Request;
  env: Env;
  requestId: string;
  tenantId?: string;
  userId?: string;
  credentialId?: string;
  credentialType?: CredentialType;
  keyLabel?: string | null;
  scope?: string;
}

export type Middleware = (
  ctx: AppContext,
  next: () => Promise<Response>,
) => Promise<Response>;
