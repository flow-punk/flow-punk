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

import type { OAuthEnv } from './env.js';

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
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
    'GATEWAY_PUBLIC_ORIGIN is required for non-loopback OAuth metadata requests',
  );
}

export function getProtectedResource(env: OAuthEnv, request: Request): string {
  // Indie protects the gateway itself (resource = issuer); /mcp and
  // /api/v1/* are sub-paths under the same audience.
  return getIssuerOrigin(env, request);
}

export function getAllowedResources(env: OAuthEnv, request: Request): string[] {
  const configured = env.OAUTH_RESOURCE_ALLOWLIST?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;
  return [getProtectedResource(env, request)];
}

export function getSingleResource(
  values: string[],
  allowedResources: string[],
): { ok: true; resource: string } | { ok: false; error: string } {
  if (values.length !== 1) {
    return { ok: false, error: 'invalid_target' };
  }
  const resource = values[0];
  if (!resource || !allowedResources.includes(resource)) {
    return { ok: false, error: 'invalid_target' };
  }
  return { ok: true, resource };
}
