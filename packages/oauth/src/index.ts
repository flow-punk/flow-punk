/**
 * Indie OAuth route entry. The gateway dispatcher routes `/oauth/*` and
 * `/.well-known/oauth-*` here. Public paths (no auth required); the
 * handlers do their own credential validation per RFC.
 */
import type { OAuthEnv } from './env.js';
import { handleAuthorize } from './handlers/authorize.js';
import { handleApprove, type ApproveSession } from './handlers/approve.js';
import { handleLoginPage, handleLoginSubmit } from './handlers/login.js';
import { handleRegister } from './handlers/register.js';
import { handleRevoke } from './handlers/revoke.js';
import { handleToken } from './handlers/token.js';
import {
  handleAuthorizationServerMetadata,
  handleProtectedResourceMetadata,
} from './handlers/metadata.js';
import { oauthMethodNotAllowed } from './responses.js';

export interface OAuthRouteContext {
  requestId: string;
  /**
   * Caller-resolved session for `/oauth/approve` (the only endpoint that
   * needs authenticated user context). The gateway dispatcher validates
   * the indie session cookie before invoking `route()`.
   */
  session: ApproveSession | null;
}

export async function route(
  request: Request,
  env: OAuthEnv,
  ctx: OAuthRouteContext,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Discovery (always GET).
  if (pathname === '/.well-known/oauth-protected-resource') {
    if (request.method !== 'GET') return oauthMethodNotAllowed('GET');
    return handleProtectedResourceMetadata(request, env);
  }
  if (pathname === '/.well-known/oauth-authorization-server') {
    if (request.method !== 'GET') return oauthMethodNotAllowed('GET');
    return handleAuthorizationServerMetadata(request, env);
  }

  // OAuth endpoints.
  if (pathname === '/oauth/register') {
    if (request.method !== 'POST') return oauthMethodNotAllowed('POST');
    return handleRegister(request, env, ctx.requestId);
  }
  if (pathname === '/oauth/authorize') {
    if (request.method !== 'GET') return oauthMethodNotAllowed('GET');
    return handleAuthorize(request, env, ctx.requestId, ctx.session);
  }
  if (pathname === '/auth/login') {
    if (request.method === 'GET') {
      return handleLoginPage(request, env, ctx.requestId);
    }
    if (request.method === 'POST') {
      return handleLoginSubmit(request, env, ctx.requestId);
    }
    return oauthMethodNotAllowed('GET, POST');
  }
  if (pathname === '/oauth/approve') {
    if (request.method !== 'POST') return oauthMethodNotAllowed('POST');
    return handleApprove(request, env, ctx.requestId, ctx.session);
  }
  if (pathname === '/oauth/token') {
    if (request.method !== 'POST') return oauthMethodNotAllowed('POST');
    return handleToken(request, env, ctx.requestId);
  }
  if (pathname === '/oauth/revoke') {
    if (request.method !== 'POST') return oauthMethodNotAllowed('POST');
    return handleRevoke(request, env, ctx.requestId);
  }

  return new Response('Not Found', { status: 404 });
}

export type { OAuthEnv } from './env.js';
export type { OAuthIdentity } from './validate.js';
export type { ApproveSession } from './handlers/approve.js';
export { validateOAuthToken } from './validate.js';
export {
  protectRevokedOauthTokens,
  writeUserInvalidationTombstone,
  oauthTokenHashFromRawToken,
  type OauthRevocationCacheResult,
} from './revoke-cache.js';
export { isIndieToken, isIndieClientId } from './codec.js';
export { ALLOWED_SCOPES, AS_SCOPES_SUPPORTED, PRM_SCOPES_SUPPORTED } from './policy.js';
export {
  getAllowedResources,
  getIssuerOrigin,
  getProtectedResource,
} from './origin.js';
