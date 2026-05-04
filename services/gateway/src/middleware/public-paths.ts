/**
 * Public path list and matcher, split out from `middleware/index.ts` so the
 * auth middleware can import it without creating a circular import through
 * the barrel.
 *
 * Per ADR-003 §Public path exemptions:
 *   - `/health`        — load-balancer health checks
 *   - `/.well-known/*` — OAuth/MCP discovery (RFC 8414, RFC 9728)
 *
 * Managed extends this list with `/oauth/register`, `/oauth/authorize`,
 * `/oauth/approve`, `/oauth/token` (see managed gateway's public-paths).
 */
export const INDIE_PUBLIC_PATHS = [
  '/health',
  '/.well-known/*',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
] as const;

/**
 * Local-dev-only paths added to the public list when the gating env flag
 * `OPENAPI_ENABLED === '1'` is set (ADR-014). Production deploys leave the
 * flag undefined so these paths fall through to auth → 401.
 */
export const OPENAPI_LOCAL_PATHS = ['/api/openapi.json', '/api/docs'] as const;

/**
 * Returns true if `path` matches any pattern in `patterns`.
 *
 * Patterns support two forms:
 *   - exact match:   `/health`
 *   - prefix match:  `/.well-known/*` (wildcard only permitted as a trailing segment)
 */
export function isPublicPath(
  path: string,
  patterns: readonly string[] = INDIE_PUBLIC_PATHS,
): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return path.startsWith(pattern.slice(0, -1));
    }
    return path === pattern;
  });
}

/**
 * Returns the effective public-path list for the current request, augmenting
 * the base list with `OPENAPI_LOCAL_PATHS` when the local-dev flag is set.
 * Used by the auth middleware in both editions; `INDIE_PUBLIC_PATHS` and
 * `MANAGED_PUBLIC_PATHS` themselves remain immutable.
 */
export function getPublicPaths(
  env: { OPENAPI_ENABLED?: string },
  base: readonly string[],
): readonly string[] {
  if (env.OPENAPI_ENABLED === '1') {
    return [...base, ...OPENAPI_LOCAL_PATHS];
  }
  return base;
}
