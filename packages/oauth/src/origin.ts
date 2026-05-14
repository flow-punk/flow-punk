/**
 * Indie OAuth issuer / resource URL resolution.
 *
 * Indie has a single global issuer = `env.GATEWAY_PUBLIC_ORIGIN`. The
 * audience parameter (RFC 8707 `resource`) defaults to the issuer
 * itself but is overridable via `OAUTH_RESOURCE_ALLOWLIST` for installs
 * that protect non-root endpoints under the same origin.
 *
 * Per ADR-019 §B2, indie does NOT trust `Host` / `X-Forwarded-Host`
 * reflectively. The configured `GATEWAY_PUBLIC_ORIGIN` is authoritative;
 * we only fall back to `request.url`'s origin for loopback dev.
 */

import type { OAuthEnv } from "./env.js";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export function getIssuerOrigin(env: OAuthEnv, request: Request): string {
  if (env.GATEWAY_PUBLIC_ORIGIN) {
    return stripTrailingSlash(env.GATEWAY_PUBLIC_ORIGIN);
  }
  const url = new URL(request.url);
  if (isLoopbackHost(url.hostname)) {
    return stripTrailingSlash(url.origin);
  }
  throw new Error(
    "GATEWAY_PUBLIC_ORIGIN is required for non-loopback OAuth metadata requests",
  );
}

/**
 * Canonical protected-resource identifier advertised in
 * `/.well-known/oauth-protected-resource` and used as the audience the
 * gateway expects on incoming OAuth tokens.
 *
 * Per RFC 9728 + the MCP authorization convention, the protected
 * resource for the MCP server is the **MCP endpoint URL** itself
 * (`<origin>/mcp`), not the bare issuer origin. Clients like Claude.ai's
 * MCP connector use this advertised value to know where to POST MCP
 * traffic; advertising bare `<origin>` makes them try the root path and
 * 404 with `McpEndpointNotFound` — see ADR-019 amendment 2026-05-06b.
 *
 * The OAuth issuer (`getIssuerOrigin`) remains the bare origin; only the
 * resource identifier moves to the `/mcp` form.
 */
export function getProtectedResource(env: OAuthEnv, request: Request): string {
  return `${getIssuerOrigin(env, request)}/mcp`;
}

export function getAllowedResources(env: OAuthEnv, request: Request): string[] {
  const configured = env.OAUTH_RESOURCE_ALLOWLIST?.split(",")
    .map((value) => value.trim())
    .map(stripTrailingSlash)
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;
  // Accept both the bare issuer origin AND the canonical MCP endpoint
  // URL `<origin>/mcp`. Some MCP clients (Claude.ai's earlier flow) send
  // the bare origin as the `resource` parameter at /authorize; current
  // implementations follow PRM and send the canonical `<origin>/mcp`.
  // Tokens minted from either path remain valid for /mcp validation
  // because the validator widens its audience check across this same
  // list.
  const issuer = getIssuerOrigin(env, request);
  return [issuer, `${issuer}/mcp`];
}

export function getSingleResource(
  values: string[],
  allowedResources: string[],
): { ok: true; resource: string } | { ok: false; error: string } {
  if (values.length !== 1) {
    return { ok: false, error: "invalid_target" };
  }
  const raw = values[0];
  if (!raw) {
    return { ok: false, error: "invalid_target" };
  }
  // Tolerate trailing-slash variants on both sides — clients commonly
  // canonicalize bare origins by appending `/`. Match is otherwise
  // exact (no fuzzy path / scheme handling).
  const normalized = stripTrailingSlash(raw);
  const allowed = allowedResources.map(stripTrailingSlash);
  if (!allowed.includes(normalized)) {
    return { ok: false, error: "invalid_target" };
  }
  return { ok: true, resource: normalized };
}
