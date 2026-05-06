/**
 * Environment shape required by the indie OAuth package.
 *
 * The indie gateway's `Env` includes these bindings (added in the gateway
 * wiring step). The OAuth handlers only use this minimal subset.
 */
export interface OAuthEnv {
  DB: D1Database;
  OAUTH_TOKEN_CACHE: KVNamespace;
  GATEWAY_PUBLIC_ORIGIN?: string;
  OAUTH_RESOURCE_ALLOWLIST?: string;
  MAX_REQUEST_BODY_BYTES?: string;
}

/**
 * Indie tokens carry `_system` as their scope segment per ADR-013's
 * scoped-credential format. The full encoding for an indie OAuth access
 * token is `mcp__system.<base64url-random>` (literal: `mcp_` prefix +
 * `_system` scope + `.` separator + payload).
 *
 * Indie has no per-tenant routing — the `_system` scope is a constant
 * sentinel that signals "this is an indie credential".
 */
export const INDIE_SCOPE = '_system';
