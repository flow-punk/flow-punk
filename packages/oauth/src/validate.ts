import { drizzle } from "drizzle-orm/d1";
import { oauthTokensRepo, usersRepo } from "@flowpunk-indie/db";

import type { OAuthEnv } from "./env.js";
import { INDIE_SCOPE } from "./env.js";
import { isIndieToken } from "./codec.js";
import {
  oauthTokenCacheKeyFromTokenHash,
  oauthTokenHashFromRawToken,
  readOauthTokenRevocationTombstone,
  readUserInvalidationTombstone,
} from "./revoke-cache.js";
import {
  isExpired,
  scopeListFromSerialized,
} from "@flowpunk-indie/oauth-protocol";

const IDENTITY_CACHE_TTL_SECONDS = 60;

export interface OAuthIdentity {
  userId: string;
  clientId: string;
  scope: string;
  scopes: string[];
  audience: string;
  tokenHash: string;
  expiresAt: string;
}

interface CachedIdentity extends OAuthIdentity {
  cachedAt: string;
}

/**
 * Validate an indie OAuth bearer token against an allowlist of accepted
 * resource audiences. Returns null on any rejection (unknown / malformed
 * / revoked / expired / user soft-deleted / wrong audience). The gateway
 * middleware must translate null into a 401 with `WWW-Authenticate:
 * Bearer …` per RFC 9728 §5.1.
 *
 * `allowedAudiences` is a list because indie advertises the canonical
 * MCP endpoint URL (`<origin>/mcp`) in PRM but historically accepted
 * tokens minted with the bare-origin audience. Both forms are valid;
 * the validator passes if `row.audience` matches any entry. Per-request
 * routing concerns (e.g., the gateway requiring the MCP-form audience
 * for /mcp specifically) live in the gateway middleware.
 *
 * Cache flow per ADR-019 §10:
 *   1. Token-revocation tombstone (`oauth:revoked:<hash>`) — fail closed.
 *   2. User-invalidation tombstone (`user_invalidated:<scope>:<userId>`) —
 *      fail closed (closes the 60s soft-delete TOCTOU window).
 *   3. Identity-cache hit (`oauth:<hash>`) — only honored after BOTH
 *      tombstones come up clean.
 *   4. DB lookup on miss; defense-in-depth user-status check via
 *      `usersRepo.findById({ includeDeleted: true })` — soft-deleted users
 *      always reject.
 *   5. Cache write on success (TTL = min(60, secondsUntilExpiry)).
 */
export async function validateOAuthToken(
  env: OAuthEnv,
  rawCredential: string,
  allowedAudiences: readonly string[],
): Promise<OAuthIdentity | null> {
  if (!isIndieToken(rawCredential)) return null;
  if (allowedAudiences.length === 0) return null;

  const tokenHash = await oauthTokenHashFromRawToken(rawCredential);
  const cacheKey = oauthTokenCacheKeyFromTokenHash(tokenHash);

  // 1. Token revocation tombstone.
  const tombstone = await readOauthTokenRevocationTombstone(env, tokenHash);
  if (tombstone) return null;

  // 2-3. Identity cache hit (gated on user-invalidation tombstone).
  const cached = await env.OAUTH_TOKEN_CACHE.get<CachedIdentity>(
    cacheKey,
    "json",
  );
  if (cached) {
    if (cached.tokenHash !== tokenHash) {
      // KV value should never disagree with key; defensive.
      await env.OAUTH_TOKEN_CACHE.delete(cacheKey).catch(() => {});
    } else if (!allowedAudiences.includes(cached.audience)) {
      // Audience mismatch is not a cache problem — it's a per-request
      // policy reject. Don't evict; just deny.
      return null;
    } else if (isExpired(cached.expiresAt)) {
      await env.OAUTH_TOKEN_CACHE.delete(cacheKey).catch(() => {});
    } else {
      const userInvalidated = await readUserInvalidationTombstone(
        env,
        INDIE_SCOPE,
        cached.userId,
      );
      if (userInvalidated) {
        await env.OAUTH_TOKEN_CACHE.delete(cacheKey).catch(() => {});
      } else {
        return strip(cached);
      }
    }
  }

  // 4. DB lookup (cache miss or invalidated).
  const db = drizzle(env.DB);
  const row = await oauthTokensRepo.findByHash(db, tokenHash);
  if (!row) return null;
  if (row.tokenType !== "access") return null;
  if (row.revokedAt) return null;
  if (isExpired(row.expiresAt)) return null;
  if (!allowedAudiences.includes(row.audience)) return null;

  // Defense-in-depth user soft-delete check.
  const user = await usersRepo.findById(db, row.userId, {
    includeDeleted: true,
  });
  if (!user || user.deletedAt) return null;

  const identity: OAuthIdentity = {
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    scopes: scopeListFromSerialized(row.scope),
    audience: row.audience,
    tokenHash,
    expiresAt: row.expiresAt,
  };

  // 5. Cache write — TTL bounded by min(60s, secondsUntilExpiry). Skip on
  // tokens close to expiry (we'd cache a value about to be wrong anyway).
  const secondsUntil = Math.max(
    0,
    Math.floor((Date.parse(row.expiresAt) - Date.now()) / 1000),
  );
  const ttl = Math.min(IDENTITY_CACHE_TTL_SECONDS, secondsUntil);
  if (ttl > 0) {
    // TOCTOU re-check: if a revocation landed mid-validation, don't cache
    // the now-stale identity.
    const recheck = await readOauthTokenRevocationTombstone(env, tokenHash);
    if (!recheck) {
      const cachedValue: CachedIdentity = {
        ...identity,
        cachedAt: new Date().toISOString(),
      };
      try {
        await env.OAUTH_TOKEN_CACHE.put(cacheKey, JSON.stringify(cachedValue), {
          expirationTtl: ttl,
        });
      } catch {
        // KV failure should not block validation; identity returns OK.
      }
    }
  }

  return identity;
}

function strip(cached: CachedIdentity): OAuthIdentity {
  const { cachedAt: _drop, ...identity } = cached;
  return identity;
}
