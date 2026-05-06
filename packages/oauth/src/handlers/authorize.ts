import { drizzle } from 'drizzle-orm/d1';
import {
  oauthAuthorizeRequestsRepo,
  oauthClientsRepo,
} from '@flowpunk-indie/db';
import {
  isoNow,
  isoSecondsFromNow,
  normalizeScope,
  randomBase64Url,
  randomOpaqueId,
  redirectUriMatches,
  sha256Hex,
  isSupportedPkceMethod,
} from '@flowpunk-indie/oauth-protocol';
import { buildCookie } from '../_lib/cookies.js';

import type { OAuthEnv } from '../env.js';
import {
  ALLOWED_SCOPES,
  AUTHORIZE_REQUEST_COOKIE,
  AUTHORIZE_REQUEST_TTL_SECONDS,
  OAUTH_ACTOR,
} from '../policy.js';
import { consentPage } from '../consent.js';
import { getAllowedResources, getIssuerOrigin, getSingleResource } from '../origin.js';
import { oauthJsonError, oauthRedirectError } from '../responses.js';

interface ParsedClientRow {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

/**
 * GET /oauth/authorize — establishes an authorize-request row and renders
 * the consent page. Cookie-binds the request via `fp_oauth_approve` and
 * issues a single-use CSRF nonce embedded in the form.
 */
export async function handleAuthorize(
  request: Request,
  env: OAuthEnv,
  requestId: string,
  session: { userId: string } | null,
): Promise<Response> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const scopeParam = url.searchParams.get('scope');

  if (!clientId || !redirectUri || responseType !== 'code') {
    return oauthJsonError(400, 'invalid_request');
  }

  const db = drizzle(env.DB);
  const clientRow = await oauthClientsRepo.findByClientId(db, clientId);
  if (!clientRow) {
    return oauthJsonError(400, 'invalid_request');
  }
  const client = parseClient(clientRow);
  if (!client.redirectUris.some((u) => redirectUriMatches(redirectUri, [u]))) {
    return oauthJsonError(400, 'invalid_request');
  }

  if (!state) return oauthRedirectError(redirectUri, 'invalid_request');

  const allowedResources = getAllowedResources(env, request);
  const resourceResult = getSingleResource(
    url.searchParams.getAll('resource'),
    allowedResources,
  );
  if (!resourceResult.ok) {
    return oauthRedirectError(redirectUri, resourceResult.error, state);
  }

  const scopeResult = normalizeScope(scopeParam, ALLOWED_SCOPES, {
    defaultIfEmpty: ['mcp'],
  });
  if (!scopeResult.ok) {
    return oauthRedirectError(redirectUri, 'invalid_scope', state);
  }
  const grantedScope = scopeResult.serialized;
  if (grantedScope.length === 0) {
    return oauthRedirectError(redirectUri, 'invalid_scope', state);
  }

  if (!codeChallenge || !isSupportedPkceMethod(codeChallengeMethod)) {
    return oauthRedirectError(redirectUri, 'invalid_request', state);
  }

  // Session gate — per ADR-019 amendment 2026-05-06. We send unauthenticated
  // browsers to /auth/login with the full authorize URL preserved as
  // `return_to`. Runs AFTER all parameter validation so a malformed request
  // surfaces as 400 immediately rather than bouncing the operator through
  // login first only to fail right after.
  if (!session) {
    let issuerOrigin: string;
    try {
      issuerOrigin = getIssuerOrigin(env, request);
    } catch {
      return oauthJsonError(500, 'server_error');
    }
    const loginUrl = new URL('/auth/login', issuerOrigin);
    loginUrl.searchParams.set(
      'return_to',
      `${url.pathname}${url.search}`,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl.toString(),
        'Cache-Control': 'no-store',
        'X-Request-ID': requestId,
      },
    });
  }

  const cookieBindingValue = randomBase64Url(24);
  const cookieBindingHash = await sha256Hex(cookieBindingValue);
  const csrfNonce = randomBase64Url(32);
  const csrfNonceHash = await sha256Hex(csrfNonce);
  const now = isoNow();
  const arId = randomOpaqueId();

  await oauthAuthorizeRequestsRepo.create(db, {
    id: arId,
    clientId: client.clientId,
    redirectUri,
    resource: resourceResult.resource,
    state,
    scope: grantedScope,
    codeChallenge,
    codeChallengeMethod,
    cookieBindingHash,
    csrfNonceHash,
    expiresAt: isoSecondsFromNow(AUTHORIZE_REQUEST_TTL_SECONDS),
    createdAt: now,
    createdBy: OAUTH_ACTOR,
    updatedAt: now,
    updatedBy: OAUTH_ACTOR,
  });

  const response = consentPage({
    clientName: client.clientName,
    requestId: arId,
    resource: resourceResult.resource,
    scope: grantedScope,
    csrfNonce,
    responseRequestId: requestId,
  });
  response.headers.append(
    'Set-Cookie',
    buildCookie(AUTHORIZE_REQUEST_COOKIE, cookieBindingValue, {
      maxAge: AUTHORIZE_REQUEST_TTL_SECONDS,
      sameSite: 'Strict',
    }),
  );
  return response;
}

function parseClient(row: {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string;
}): ParsedClientRow {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris: safeJsonArray(row.redirectUris),
  };
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}
