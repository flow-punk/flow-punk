import type { AppContext, Middleware } from '../types.js';
import { extractAuthMaterial } from '../auth/extract-material.js';
import { enforceRestScope } from '../auth/scope.js';
import { validateApiKey } from '../auth/validate-apikey.js';
import {
  stripIdentityHeadersFromRequest,
  withIdentityHeaders,
} from '../auth/identity-headers.js';
import { unauthorized } from '../auth/unauthorized.js';
import { validateSession } from '../auth/validate-session.js';
import { isPublicPath, INDIE_PUBLIC_PATHS } from './public-paths.js';

/**
 * Paths where a `Cookie: fp_session=...` cookie is accepted as a credential
 * on the indie edition.
 *
 * Indie's admin-REST surface is currently empty — its API-key management
 * endpoints (the natural future consumer) ship with the future indie
 * AUTH_SERVICE work, not in this plan. The session validator is wired
 * here so future admin endpoints can opt in by adding their prefix.
 *
 * Sessions MUST NOT be accepted on `/mcp` — sessions are admin-REST-only
 * (ADR-011 §MCP auth). This function returning `false` for `/mcp` is the
 * first of two defenses; the second is `validateMcpSessionIdentity`'s
 * runtime reject of `'session'` credential type.
 */
function isSessionAllowedPath(pathname: string): boolean {
  // Users CRUD is the first reachable admin-REST surface on indie. Other
  // session-allowed prefixes (e.g. future indie AUTH_SERVICE endpoints)
  // can be added here.
  return (
    pathname === '/api/v1/users' ||
    pathname.startsWith('/api/v1/users/')
  );
}

/**
 * Auth middleware (indie edition).
 */
export const authMiddleware: Middleware = async (
  ctx: AppContext,
  next: () => Promise<Response>,
): Promise<Response> => {
  const url = new URL(ctx.request.url);
  if (isPublicPath(url.pathname, INDIE_PUBLIC_PATHS)) {
    ctx.request = stripIdentityHeadersFromRequest(ctx.request);
    return next();
  }

  // Session-cookie path — admin-REST surface only (currently empty in indie).
  // Runs before the API-key path so admin endpoints, when they ship, are
  // session-only. On validation failure we fall through so a stale cookie
  // alongside a valid API key still authenticates.
  if (isSessionAllowedPath(url.pathname)) {
    const session = await validateSession(ctx.env, ctx.request);
    if (session) {
      ctx.tenantId = session.tenantId;
      ctx.userId = session.userId;
      ctx.credentialId = session.credentialId;
      ctx.credentialType = 'session';
      ctx.scope = session.scope;

      ctx.request = new Request(ctx.request, {
        headers: withIdentityHeaders(ctx.request.headers, {
          tenantId: session.tenantId,
          userId: session.userId,
          scope: session.scope,
          credentialType: 'session',
          credentialId: session.credentialId,
        }),
      });

      return next();
    }
  }

  const material = extractAuthMaterial(ctx.request);
  if (!material || material.credentialType !== 'apikey') {
    return unauthorized();
  }

  const validation = await validateApiKey(
    ctx.env.AUTH_SERVICE,
    material.rawCredential,
    ctx.env.SERVICE_TIMEOUT_MS,
  );
  if (!validation) return unauthorized({ invalidToken: true });

  ctx.tenantId = validation.tenantId;
  ctx.userId = validation.userId;
  ctx.credentialId = validation.credentialId;
  ctx.credentialType = 'apikey';
  ctx.keyLabel = validation.keyLabel ?? null;
  ctx.scope = validation.scope;

  const scopeDenial = enforceRestScope(ctx.request.method, validation.scope);
  if (scopeDenial) return scopeDenial;

  ctx.request = new Request(ctx.request, {
    headers: withIdentityHeaders(ctx.request.headers, {
      tenantId: validation.tenantId,
      userId: validation.userId,
      scope: validation.scope,
      credentialType: 'apikey',
      credentialId: validation.credentialId,
    }),
  });

  return next();
};
