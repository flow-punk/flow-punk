/**
 * KV revocation tombstone for indie OAuth tokens. Mirrors the managed
 * pattern: when a token is revoked we (a) write a short-TTL tombstone
 * keyed by token hash so any cached identity is treated as invalid, and
 * (b) delete any cached identity entry. Composes with the user-invalidation
 * tombstone (see ADR-019 §10) which is set by the indie users wrapper on
 * soft-delete.
 */
import { sha256Hex } from '@flowpunk-indie/oauth-protocol';
import type { OAuthEnv } from './env.js';

export const OAUTH_TOKEN_CACHE_PREFIX = 'oauth:';
export const OAUTH_TOKEN_REVOCATION_PREFIX = 'oauth:revoked:';
export const OAUTH_USER_INVALIDATION_PREFIX = 'user_invalidated:';
export const OAUTH_TOKEN_REVOCATION_TTL_SECONDS = 60;
export const OAUTH_USER_INVALIDATION_TTL_SECONDS = 60;

export interface RevocableOauthToken {
  tokenHash: string;
  tokenType: string;
}

export interface OAuthRevocationTombstone {
  kind: 'revoked';
  tokenHash: string;
  revokedAt: string;
}

export interface OauthRevocationCacheFailure {
  operation: 'put_tombstone' | 'delete_identity';
  tokenHash: string;
  cacheKey: string;
  errorName: string;
  errorMessage: string;
}

export interface OauthRevocationCacheResult {
  tokenHashes: string[];
  tombstonesWritten: number;
  identityDeletes: number;
  failures: OauthRevocationCacheFailure[];
}

export async function oauthTokenHashFromRawToken(rawToken: string): Promise<string> {
  return sha256Hex(rawToken);
}

export function oauthTokenCacheKeyFromTokenHash(tokenHash: string): string {
  return `${OAUTH_TOKEN_CACHE_PREFIX}${tokenHash}`;
}

export function oauthTokenRevocationKeyFromTokenHash(tokenHash: string): string {
  return `${OAUTH_TOKEN_REVOCATION_PREFIX}${tokenHash}`;
}

/**
 * User-invalidation tombstone key per ADR-019 §10. Set by the indie users
 * wrapper on soft-delete. Indie has only `_system` as scope, but the key
 * shape is `user_invalidated:<scope>:<userId>` for symmetry with managed.
 */
export function userInvalidationKey(scope: string, userId: string): string {
  return `${OAUTH_USER_INVALIDATION_PREFIX}${scope}:${userId}`;
}

export async function readOauthTokenRevocationTombstone(
  env: OAuthEnv,
  tokenHash: string,
): Promise<OAuthRevocationTombstone | null> {
  const tombstone = await env.OAUTH_TOKEN_CACHE.get<OAuthRevocationTombstone>(
    oauthTokenRevocationKeyFromTokenHash(tokenHash),
    'json',
  );
  if (!tombstone || tombstone.kind !== 'revoked' || tombstone.tokenHash !== tokenHash) {
    return null;
  }
  return tombstone;
}

export async function readUserInvalidationTombstone(
  env: OAuthEnv,
  scope: string,
  userId: string,
): Promise<boolean> {
  const value = await env.OAUTH_TOKEN_CACHE.get(userInvalidationKey(scope, userId));
  return value !== null;
}

export async function writeUserInvalidationTombstone(
  env: OAuthEnv,
  scope: string,
  userId: string,
): Promise<void> {
  await env.OAUTH_TOKEN_CACHE.put(
    userInvalidationKey(scope, userId),
    new Date().toISOString(),
    { expirationTtl: OAUTH_USER_INVALIDATION_TTL_SECONDS },
  );
}

export async function protectRevokedOauthTokens(
  env: OAuthEnv,
  tokens: Iterable<RevocableOauthToken>,
): Promise<OauthRevocationCacheResult> {
  const tokenHashes = new Set<string>();
  for (const token of tokens) {
    if (token.tokenType !== 'access') continue;
    tokenHashes.add(token.tokenHash);
  }

  const result: OauthRevocationCacheResult = {
    tokenHashes: [...tokenHashes],
    tombstonesWritten: 0,
    identityDeletes: 0,
    failures: [],
  };

  if (result.tokenHashes.length === 0) return result;

  const revokedAt = new Date().toISOString();

  await Promise.all(
    result.tokenHashes.map(async (tokenHash) => {
      const tombstone: OAuthRevocationTombstone = { kind: 'revoked', tokenHash, revokedAt };
      const tombstoneKey = oauthTokenRevocationKeyFromTokenHash(tokenHash);
      const identityKey = oauthTokenCacheKeyFromTokenHash(tokenHash);

      try {
        await env.OAUTH_TOKEN_CACHE.put(tombstoneKey, JSON.stringify(tombstone), {
          expirationTtl: OAUTH_TOKEN_REVOCATION_TTL_SECONDS,
        });
        result.tombstonesWritten += 1;
      } catch (error) {
        result.failures.push({
          operation: 'put_tombstone',
          tokenHash,
          cacheKey: tombstoneKey,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'unknown',
        });
      }

      try {
        await env.OAUTH_TOKEN_CACHE.delete(identityKey);
        result.identityDeletes += 1;
      } catch (error) {
        result.failures.push({
          operation: 'delete_identity',
          tokenHash,
          cacheKey: identityKey,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : 'unknown',
        });
      }
    }),
  );

  return result;
}
