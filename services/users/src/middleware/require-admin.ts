import { drizzle } from 'drizzle-orm/d1';
import type { Logger } from '@flowpunk/service-utils';
import { usersRepo } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import { errorResponse } from '../handlers/_shared.js';
import { parseIdentity } from './identity.js';

export type AdminCheckResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: Response };

/**
 * Pure decision function.
 *
 * Per ADR-012's admin-auth posture (extended for soft-delete in this
 * iteration): platform-admin operations require
 * - session OR oauth credential type (never apikey)
 * - the looked-up user has `isAdmin === true` AND `status === 'active'`
 *
 * A soft-deleted admin row must NOT authorize anything; this is the
 * defense-in-depth predicate for Group A of codex review.
 */
export function evaluateAdmin(
  actor: Actor | null,
  user: { isAdmin: boolean; status: 'active' | 'deleted' } | null,
): AdminCheckResult {
  if (!actor) {
    return { ok: false, response: errorResponse(401, 'UNAUTHENTICATED') };
  }
  if (actor.credentialType !== 'oauth' && actor.credentialType !== 'session') {
    return {
      ok: false,
      response: errorResponse(
        403,
        'ADMIN_CREDENTIAL_REQUIRED',
        'Platform admin operations require session/OAuth authentication.',
      ),
    };
  }
  if (!user || !user.isAdmin || user.status !== 'active') {
    return { ok: false, response: errorResponse(403, 'FORBIDDEN') };
  }
  return { ok: true, actor };
}

export async function requireAdmin(
  request: Request,
  env: UsersEnv,
  logger?: Logger,
): Promise<AdminCheckResult> {
  const actor = parseIdentity(request);
  if (!actor) {
    logAuthFailure(logger, 'identity_missing', null);
    return evaluateAdmin(null, null);
  }
  if (actor.credentialType !== 'oauth' && actor.credentialType !== 'session') {
    logAuthFailure(logger, 'non_admin_credential_type', actor);
    return evaluateAdmin(actor, null);
  }
  const db = drizzle(env.DB);
  // includeDeleted: true so we can produce a precise log reason when the
  // row exists but is soft-deleted; evaluateAdmin still rejects below.
  const user = await usersRepo.findById(db, actor.userId, {
    includeDeleted: true,
  });
  const result = evaluateAdmin(actor, user);
  if (!result.ok) {
    let reason = 'user_not_found';
    if (user) {
      if (user.status !== 'active') reason = 'user_deleted';
      else if (!user.isAdmin) reason = 'user_not_admin';
    }
    logAuthFailure(logger, reason, actor);
  }
  return result;
}

function logAuthFailure(
  logger: Logger | undefined,
  reason: string,
  actor: Actor | null,
): void {
  if (!logger) return;
  logger.warn('users admin guard rejected request', {
    reason,
    ...(actor
      ? {
          credentialType: actor.credentialType,
          userId: actor.userId,
          tenantId: actor.tenantId,
        }
      : {}),
  });
}
