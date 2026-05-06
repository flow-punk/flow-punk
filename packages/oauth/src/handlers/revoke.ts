import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  mcpOauthTokens,
  oauthClientsRepo,
  oauthTokensRepo,
} from '@flowpunk-indie/db';
import { isoNow, sha256Hex } from '@flowpunk-indie/oauth-protocol';

import type { OAuthEnv } from '../env.js';
import { isIndieToken } from '../codec.js';
import { safeFormUrlEncoded } from '../body.js';
import { oauthJsonError } from '../responses.js';
import { protectRevokedOauthTokens } from '../revoke-cache.js';

/**
 * RFC 7009 token revocation. Always-200 semantics for unknown tokens
 * (no enumeration). Mismatched client/token rejected silently with 200.
 */
export async function handleRevoke(
  request: Request,
  env: OAuthEnv,
  requestId: string,
): Promise<Response> {
  const form = await safeFormUrlEncoded(request, env, requestId);
  if (form instanceof Response) return form;
  if (!form) return oauthJsonError(400, 'invalid_request');

  const token = form.get('token');
  const clientId = form.get('client_id');
  if (typeof token !== 'string' || typeof clientId !== 'string') {
    return oauthJsonError(400, 'invalid_request');
  }

  if (!isIndieToken(token)) {
    return new Response(null, { status: 200 });
  }

  const db = drizzle(env.DB);
  const client = await oauthClientsRepo.findByClientId(db, clientId);
  if (!client || client.tokenEndpointAuthMethod !== 'none') {
    return oauthJsonError(401, 'invalid_client');
  }

  const tokenHash = await sha256Hex(token);
  const row = await oauthTokensRepo.findByHash(db, tokenHash);
  if (!row || row.clientId !== client.clientId) {
    return new Response(null, { status: 200 });
  }

  if (row.tokenType === 'refresh') {
    // Family-wide revoke for a refresh token.
    const familyTokens = await db
      .select({
        tokenHash: mcpOauthTokens.tokenHash,
        tokenType: mcpOauthTokens.tokenType,
      })
      .from(mcpOauthTokens)
      .where(eq(mcpOauthTokens.familyId, row.familyId));
    await oauthTokensRepo.revokeFamily(db, row.familyId, isoNow());
    await protectRevokedOauthTokens(env, familyTokens);
    return new Response(null, { status: 200 });
  }

  // Single-token revoke (access).
  await oauthTokensRepo.revokeByHash(db, tokenHash, isoNow());
  await protectRevokedOauthTokens(env, [{ tokenHash, tokenType: row.tokenType }]);
  return new Response(null, { status: 200 });
}
