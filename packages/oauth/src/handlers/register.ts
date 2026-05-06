import { drizzle } from 'drizzle-orm/d1';
import { oauthClientsRepo } from '@flowpunk-indie/db';
import {
  isoNow,
  normalizeScope,
  randomOpaqueId,
  validateRedirectUriList,
} from '@flowpunk-indie/oauth-protocol';

import type { OAuthEnv } from '../env.js';
import { mintIndieClientId } from '../codec.js';
import { safeJson } from '../body.js';
import { oauthJsonError } from '../responses.js';
import {
  ALLOWED_SCOPES,
  DCR_AUDIT_ACTOR,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENTS_PER_INSTALL,
  MAX_REDIRECT_URI_LENGTH,
  MAX_REDIRECT_URIS_PER_CLIENT,
} from '../policy.js';

interface RegisterRequestBody {
  client_name?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  scope?: unknown;
}

/**
 * RFC 7591 Dynamic Client Registration. Unauthenticated per ADR-019 §5.
 * Anti-abuse: gateway-level IP rate limiter + per-install cap (here) +
 * redirect-URI / name length caps + stale-client GC.
 */
export async function handleRegister(
  request: Request,
  env: OAuthEnv,
  requestId: string,
): Promise<Response> {
  const parsed = await safeJson(request, env, requestId);
  if (parsed instanceof Response) return parsed;
  if (!parsed || typeof parsed !== 'object') {
    return oauthJsonError(400, 'invalid_request');
  }
  const body = parsed as RegisterRequestBody;

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((v): v is string => typeof v === 'string')
    : [];
  const redirectCheck = validateRedirectUriList(redirectUris, {
    maxLength: MAX_REDIRECT_URI_LENGTH,
    maxPerClient: MAX_REDIRECT_URIS_PER_CLIENT,
  });
  if (!redirectCheck.ok) {
    const errorCode =
      redirectCheck.error === 'too_many' || redirectCheck.error === 'too_long'
        ? 'invalid_client_metadata'
        : 'invalid_redirect_uri';
    return oauthJsonError(400, errorCode);
  }

  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.length > 0
      ? (body.grant_types as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : ['authorization_code', 'refresh_token'];
  if (
    grantTypes.length === 0 ||
    grantTypes.some((v) => v !== 'authorization_code' && v !== 'refresh_token')
  ) {
    return oauthJsonError(400, 'invalid_client_metadata');
  }

  const responseTypes =
    Array.isArray(body.response_types) && body.response_types.length > 0
      ? (body.response_types as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : ['code'];
  if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
    return oauthJsonError(400, 'invalid_client_metadata');
  }

  const tokenAuthMethod =
    typeof body.token_endpoint_auth_method === 'string'
      ? body.token_endpoint_auth_method
      : 'none';
  if (tokenAuthMethod !== 'none') {
    return oauthJsonError(400, 'invalid_client_metadata');
  }

  const scopeInput = typeof body.scope === 'string' ? body.scope : '';
  const scopeResult = normalizeScope(scopeInput, ALLOWED_SCOPES, {
    defaultIfEmpty: ['mcp'],
  });
  if (!scopeResult.ok) {
    return oauthJsonError(400, 'invalid_scope');
  }

  const clientName =
    typeof body.client_name === 'string' && body.client_name.trim() !== ''
      ? body.client_name.trim()
      : 'FlowPunk MCP Client';
  if (clientName.length > MAX_CLIENT_NAME_LENGTH) {
    return oauthJsonError(400, 'invalid_client_metadata');
  }

  const db = drizzle(env.DB);

  // Per-install cap (ADR-019 §5).
  const existingCount = await oauthClientsRepo.count(db);
  if (existingCount >= MAX_CLIENTS_PER_INSTALL) {
    return oauthJsonError(429, 'too_many_clients');
  }

  const clientId = mintIndieClientId();
  const now = isoNow();

  try {
    await oauthClientsRepo.create(db, {
      id: randomOpaqueId(),
      clientId,
      clientName,
      redirectUris: JSON.stringify(redirectUris),
      grantTypes: JSON.stringify(grantTypes),
      responseTypes: JSON.stringify(responseTypes),
      tokenEndpointAuthMethod: 'none',
      lastUsedAt: null,
      createdAt: now,
      createdBy: DCR_AUDIT_ACTOR,
      updatedAt: now,
      updatedBy: DCR_AUDIT_ACTOR,
    });
  } catch (err) {
    if (err instanceof Error && /CLIENT_ID_TAKEN/.test(err.message)) {
      // Vanishingly unlikely with 24-byte random, but fail gracefully.
      return oauthJsonError(503, 'temporarily_unavailable');
    }
    throw err;
  }

  return Response.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: 'none',
      scope: scopeResult.serialized,
    },
    { status: 201 },
  );
}
