import { drizzle } from 'drizzle-orm/d1';
import {
  oauthAuthorizeRequestsRepo,
  oauthCodesRepo,
} from '@flowpunk-indie/db';
import {
  isExpired,
  isoNow,
  isoSecondsFromNow,
  randomBase64Url,
  randomOpaqueId,
  sha256Hex,
} from '@flowpunk-indie/oauth-protocol';
import { clearCookie, parseCookies } from '../_lib/cookies.js';

import type { OAuthEnv } from '../env.js';
import {
  AUTH_CODE_TTL_SECONDS,
  AUTHORIZE_REQUEST_COOKIE,
  OAUTH_ACTOR,
} from '../policy.js';
import { safeFormUrlEncoded } from '../body.js';
import { getIssuerOrigin } from '../origin.js';
import { oauthJsonError, oauthRedirectError } from '../responses.js';

export interface ApproveSession {
  userId: string;
}

/**
 * POST /oauth/approve — consume the authorize-request atomically and
 * mint an authorization code (or redirect with `access_denied`).
 *
 * Approve-origin policy per ADR-019 §B4: `Origin` must equal the
 * resolved indie issuer origin (NOT `ALLOWED_ORIGINS`).
 *
 * Caller (gateway dispatcher) must validate the indie session and pass
 * its userId in `session`. The OAuth package does not know about the
 * gateway's session storage.
 */
export async function handleApprove(
  request: Request,
  env: OAuthEnv,
  requestId: string,
  session: ApproveSession | null,
): Promise<Response> {
  // Origin gate: only the issuer's own browser surface may submit consent.
  const origin = request.headers.get('Origin');
  let issuerOrigin: string;
  try {
    issuerOrigin = getIssuerOrigin(env, request);
  } catch {
    return oauthJsonError(500, 'server_error');
  }
  if (!origin || origin !== issuerOrigin) {
    return oauthJsonError(400, 'invalid_request');
  }

  // Form parse with body-size guard.
  const form = await safeFormUrlEncoded(request, env, requestId);
  if (form instanceof Response) return form;
  if (!form) return oauthJsonError(400, 'invalid_request');

  const arId = form.get('request_id');
  const decision = form.get('decision');
  const csrfNonce = form.get('csrf_nonce');
  if (
    typeof arId !== 'string' ||
    typeof decision !== 'string' ||
    typeof csrfNonce !== 'string' ||
    csrfNonce.length === 0
  ) {
    return oauthJsonError(400, 'invalid_request');
  }

  // Session required — the OAuth handler does not validate; the gateway
  // dispatcher does and passes the result.
  if (!session) {
    return oauthJsonError(401, 'invalid_token', 'session_required');
  }

  const db = drizzle(env.DB);
  const ar = await oauthAuthorizeRequestsRepo.findById(db, arId);
  if (!ar || isExpired(ar.expiresAt)) {
    return oauthJsonError(400, 'invalid_request');
  }

  const cookieValue = parseCookies(request).get(AUTHORIZE_REQUEST_COOKIE);
  if (!cookieValue) return oauthJsonError(400, 'invalid_request');

  const cookieHash = await sha256Hex(cookieValue);
  const submittedNonceHash = await sha256Hex(csrfNonce);

  // Snapshot fields needed downstream; the consume step deletes the row.
  const redirectUri = ar.redirectUri;
  const state = ar.state;
  const arClientId = ar.clientId;
  const arResource = ar.resource;
  const arScope = ar.scope;
  const arCodeChallenge = ar.codeChallenge;
  const arCodeChallengeMethod = ar.codeChallengeMethod;

  // Atomic gated consume — single DELETE that fails if cookie/nonce
  // don't match. Wrong cookie/nonce/already-consumed all surface as the
  // same `invalid_request` (fail-closed, no leak).
  const consumed = await oauthAuthorizeRequestsRepo.consumeGated(
    db,
    arId,
    cookieHash,
    submittedNonceHash,
  );
  if (!consumed) return oauthJsonError(400, 'invalid_request');

  if (decision !== 'approve') {
    return withClearedApprovalCookie(
      oauthRedirectError(redirectUri, 'access_denied', state),
    );
  }

  const code = randomBase64Url(32);
  const codeHash = await sha256Hex(code);
  const now = isoNow();

  await oauthCodesRepo.create(db, {
    id: randomOpaqueId(),
    codeHash,
    clientId: arClientId,
    userId: session.userId,
    redirectUri,
    resource: arResource,
    scope: arScope,
    codeChallenge: arCodeChallenge,
    codeChallengeMethod: arCodeChallengeMethod,
    expiresAt: isoSecondsFromNow(AUTH_CODE_TTL_SECONDS),
    usedAt: null,
    createdAt: now,
    createdBy: OAUTH_ACTOR,
    updatedAt: now,
    updatedBy: OAUTH_ACTOR,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', state);
  return withClearedApprovalCookie(Response.redirect(redirect.toString(), 302));
}

function withClearedApprovalCookie(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', clearCookie(AUTHORIZE_REQUEST_COOKIE));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
