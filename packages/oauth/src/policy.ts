/**
 * DCR safety policy per ADR-019 §5.
 *
 * Anti-abuse on the unauthenticated `/oauth/register` endpoint relies on:
 *   1. The `ANON_OAUTH_RATE_LIMITER` Durable Object (gateway-level, IP-based).
 *   2. Per-install client cap (this constant).
 *   3. Per-client redirect URI count + length caps.
 *   4. Client name length cap.
 *   5. Stale-client GC after `STALE_CLIENT_DAYS` with no `last_used_at`.
 */

export const MAX_CLIENTS_PER_INSTALL = 50;
export const MAX_REDIRECT_URIS_PER_CLIENT = 10;
export const MAX_CLIENT_NAME_LENGTH = 200;
export const MAX_REDIRECT_URI_LENGTH = 2048;
export const STALE_CLIENT_DAYS = 90;

export const ALLOWED_SCOPES = ['mcp', 'flowpunk'] as const;
export type AllowedScope = (typeof ALLOWED_SCOPES)[number];

/**
 * Scopes advertised in PRM (`/.well-known/oauth-protected-resource`).
 * Per ADR-019 §7, PRM lists ONLY `mcp` so MCP clients request
 * least-privilege initial consent. AS metadata advertises both.
 */
export const PRM_SCOPES_SUPPORTED: readonly string[] = ['mcp'];

/** Scopes advertised in AS metadata (`/.well-known/oauth-authorization-server`). */
export const AS_SCOPES_SUPPORTED: readonly string[] = ['mcp', 'flowpunk'];

/** TTLs (seconds). */
export const AUTHORIZE_REQUEST_TTL_SECONDS = 5 * 60;
export const AUTH_CODE_TTL_SECONDS = 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_FAMILY_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Cookie name for the authorize-request binding (matches managed). */
export const AUTHORIZE_REQUEST_COOKIE = 'fp_oauth_approve';

/** OAuth actor written into audit columns by handler-side updates. */
export const OAUTH_ACTOR = 'gateway.oauth';

/**
 * `created_by` / `updated_by` value used when an unauthenticated DCR
 * creates a client. Indie schema permits NULL — see ADR-019 §11.
 */
export const DCR_AUDIT_ACTOR: string | null = null;
