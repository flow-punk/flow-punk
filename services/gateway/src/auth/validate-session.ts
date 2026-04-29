import { drizzle } from 'drizzle-orm/d1';
import { mcpSessionsRepo, usersRepo } from '@flowpunk-indie/db';
import { parseCookies } from './cookies.js';
import { sha256Hex } from './sha256.js';
import type { Env } from '../types.js';

export const SESSION_COOKIE_NAME = 'fp_session';
export const SESSION_SCOPE = 'admin';

const MAX_CACHE_TTL_SECONDS = 60;
const SESSION_CACHE_PREFIX = 'session:';
const SESSION_REVOKED_PREFIX = 'session:revoked:';

export interface SessionIdentity {
  tenantId: string;
  userId: string;
  scope: 'admin';
  credentialType: 'session';
  credentialId: string;
  expiresAt: string;
}

/**
 * Validates an indie-edition session cookie.
 *
 * Mirrors the managed validator (same KV+D1 lookup shape, same TOCTOU
 * tombstone re-check, same admin gating). The only divergence today is the
 * D1 binding: indie reads from `env.DB`; managed reads from `env.PARENT_DB`.
 * Duplicated because this is edition-owned gateway service code (not part of
 * the gateway's exported surface) with edition-specific DB/env coupling
 * (`@flowpunk-indie/db` here, `@flowpunk-managed/db` there). ADR-011
 * §Behavioral variation would justify further divergence later.
 *
 * Path scoping in the indie gateway middleware confines this validator to
 * the admin-REST surface. Sessions never reach `/mcp`.
 */
export async function validateSession(
  env: Env,
  request: Request,
): Promise<SessionIdentity | null> {
  const cookies = parseCookies(request);
  const cookieValue = cookies.get(SESSION_COOKIE_NAME);
  if (!cookieValue) return null;

  const cookieHash = await sha256Hex(cookieValue);
  const cacheKey = `${SESSION_CACHE_PREFIX}${cookieHash}`;
  const revocationKey = `${SESSION_REVOKED_PREFIX}${cookieHash}`;

  const revocationState = await readRevocationState(env, revocationKey);
  if (revocationState === 'revoked') return null;

  if (revocationState === 'clear') {
    try {
      const cached = await env.MCP_SESSIONS_KV.get<SessionIdentity>(
        cacheKey,
        'json',
      );
      if (cached && isStillValid(cached.expiresAt)) {
        return cached;
      }
    } catch {
      // fail open — fall through to DB
    }
  }

  let row: Awaited<ReturnType<typeof mcpSessionsRepo.findByCookieHash>>;
  try {
    const db = drizzle(env.DB);
    row = await mcpSessionsRepo.findByCookieHash(db, cookieHash);
  } catch {
    return null;
  }

  if (!row) return null;
  if (row.revokedAt) return null;
  if (!isStillValid(row.expiresAt)) return null;

  // Admin gate AND active-status gate. `includeDeleted: true` so the
  // soft-delete check is explicit (defense in depth alongside the cascade
  // in `usersRepo.softDelete` that revokes mcp_sessions on delete). A
  // soft-deleted admin must not authenticate even if their session row
  // wasn't successfully revoked during cascade.
  let user: Awaited<ReturnType<typeof usersRepo.findById>>;
  try {
    const db = drizzle(env.DB);
    user = await usersRepo.findById(db, row.userId, { includeDeleted: true });
  } catch {
    return null;
  }
  if (!user || !user.isAdmin || user.status !== 'active') return null;

  const identity: SessionIdentity = {
    tenantId: row.tenantId,
    userId: row.userId,
    scope: SESSION_SCOPE,
    credentialType: 'session',
    credentialId: row.id,
    expiresAt: row.expiresAt,
  };

  const expiresAtMs = Date.parse(row.expiresAt);
  const secondsUntilExpiry = Math.floor((expiresAtMs - Date.now()) / 1000);
  if (secondsUntilExpiry >= MAX_CACHE_TTL_SECONDS) {
    const revocationBeforeWrite = await readRevocationState(env, revocationKey);
    if (revocationBeforeWrite === 'clear') {
      try {
        await env.MCP_SESSIONS_KV.put(cacheKey, JSON.stringify(identity), {
          expirationTtl: Math.min(MAX_CACHE_TTL_SECONDS, secondsUntilExpiry),
        });
      } catch {
        // silent — caching is a perf layer, not correctness
      }
    }
  }

  return identity;
}

async function readRevocationState(
  env: Env,
  revocationKey: string,
): Promise<'clear' | 'revoked' | 'unknown'> {
  try {
    const tombstone = await env.MCP_SESSIONS_KV.get(revocationKey);
    return tombstone ? 'revoked' : 'clear';
  } catch {
    return 'unknown';
  }
}

function isStillValid(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}
