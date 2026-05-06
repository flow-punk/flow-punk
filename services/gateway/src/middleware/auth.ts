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
import { getPublicPaths, isPublicPath, INDIE_PUBLIC_PATHS } from './public-paths.js';
import { getProtectedResource, validateOAuthToken } from '@flowpunk-indie/oauth';

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
    pathname.startsWith('/api/v1/users/') ||
    pathname === '/api/v1/auth/keys' ||
    pathname.startsWith('/api/v1/auth/keys/')
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
  if (isPublicPath(url.pathname, getPublicPaths(ctx.env, INDIE_PUBLIC_PATHS))) {
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
  if (!material) return unauthorized();

  // OAuth token path (per ADR-019). Tokens with prefix `mcp_` are validated
  // here; managed-shaped `mcp_<tenantId>.<...>` tokens are rejected by
  // `isIndieToken` inside `validateOAuthToken` (returns null → 401).
  if (material.credentialType === 'oauth') {
    return handleOAuthCredential(ctx, url, material.rawCredential, next);
  }

  if (material.credentialType !== 'apikey') {
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

/**
 * OAuth-credential branch of the auth middleware. Per ADR-019:
 *
 *   - `/api/v1/users*` and `/api/v1/auth/keys*` are session-only —
 *     OAuth tokens are rejected before validation (no scope can grant
 *     access to admin/credential surfaces; see `users-core` invariants).
 *   - Required scope by route group: `/mcp*` → `mcp`; `/api/v1/*` → `flowpunk`.
 *   - Invalid scope → 403 with full RFC 6750 §3.1 challenge
 *     (insufficient_scope + scope + resource_metadata + error_description).
 *   - Invalid token → 401 with RFC 9728 §5.1 challenge.
 */
async function handleOAuthCredential(
  ctx: AppContext,
  url: URL,
  rawCredential: string,
  next: () => Promise<Response>,
): Promise<Response> {
  // Carve-out: admin/credential paths reject OAuth tokens entirely.
  if (isAdminPath(url.pathname)) {
    return oauthSessionRequired(ctx);
  }

  const required = requiredScopeFor(url.pathname);
  if (required === null) {
    // Unknown route — fall through to 404. (Shouldn't happen post-router,
    // but defensive.)
    return next();
  }

  const audience = getProtectedResource(ctx.env, ctx.request);
  const identity = await validateOAuthToken(ctx.env, rawCredential, audience);
  if (!identity) {
    return oauthInvalidToken(ctx);
  }

  if (!identity.scopes.includes(required)) {
    return oauthInsufficientScope(ctx, required);
  }

  ctx.tenantId = '_system';
  ctx.userId = identity.userId;
  ctx.credentialId = identity.tokenHash;
  ctx.credentialType = 'oauth';
  ctx.scope = identity.scope;

  ctx.request = new Request(ctx.request, {
    headers: withIdentityHeaders(ctx.request.headers, {
      tenantId: '_system',
      userId: identity.userId,
      scope: identity.scope,
      credentialType: 'oauth',
      credentialId: identity.tokenHash,
    }),
  });

  return next();
}

function isAdminPath(pathname: string): boolean {
  return (
    pathname === '/api/v1/users' ||
    pathname.startsWith('/api/v1/users/') ||
    pathname === '/api/v1/auth/keys' ||
    pathname.startsWith('/api/v1/auth/keys/')
  );
}

function requiredScopeFor(pathname: string): string | null {
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return 'mcp';
  if (pathname.startsWith('/api/v1/')) return 'flowpunk';
  return null;
}

function challengeHeaders(
  ctx: AppContext,
  challenge: string,
): Headers {
  const issuer = (() => {
    try {
      return getProtectedResource(ctx.env, ctx.request);
    } catch {
      return new URL(ctx.request.url).origin;
    }
  })();
  return new Headers({
    'WWW-Authenticate': `${challenge}, resource_metadata="${issuer}/.well-known/oauth-protected-resource"`,
    'Content-Type': 'application/json',
  });
}

function oauthInvalidToken(ctx: AppContext): Response {
  return new Response(JSON.stringify({ error: 'invalid_token' }), {
    status: 401,
    headers: challengeHeaders(
      ctx,
      'Bearer error="invalid_token", error_description="The access token is invalid or expired"',
    ),
  });
}

function oauthInsufficientScope(ctx: AppContext, required: string): Response {
  return new Response(
    JSON.stringify({ error: 'insufficient_scope', scope: required }),
    {
      status: 403,
      headers: challengeHeaders(
        ctx,
        `Bearer error="insufficient_scope", scope="${required}", error_description="The access token does not have the required scope"`,
      ),
    },
  );
}

function oauthSessionRequired(ctx: AppContext): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: 'session required for this resource',
    }),
    {
      status: 403,
      headers: challengeHeaders(
        ctx,
        'Bearer error="invalid_token", error_description="session required for this resource"',
      ),
    },
  );
}
