import { drizzle } from 'drizzle-orm/d1';
import { hasAdminRights, usersRepo, type Role } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import { errorResponse } from '../handlers/_shared.js';
import { parseIdentity } from './identity.js';

export type AuthCheckResult =
  | {
      ok: true;
      actor: Actor;
      role: Role;
      isAdmin: boolean;
    }
  | { ok: false; response: Response };

/**
 * Softer guard for self-or-admin endpoints (GET /:id, PATCH /:id).
 *
 * Returns the actor, the actor's role, and an `isAdmin` boolean
 * (`hasAdminRights(role)`) so handlers can dispatch on self vs admin.
 * Like `requireAdmin`, rejects API-key auth — users CRUD is
 * session/oauth-only at every entrypoint per ADR-012. A soft-deleted
 * actor cannot use any endpoint.
 */
export async function requireAuthenticated(
  request: Request,
  env: UsersEnv,
): Promise<AuthCheckResult> {
  const actor = parseIdentity(request);
  if (!actor) {
    return { ok: false, response: errorResponse(401, 'UNAUTHENTICATED') };
  }
  if (actor.credentialType !== 'oauth' && actor.credentialType !== 'session') {
    return {
      ok: false,
      response: errorResponse(
        403,
        'ADMIN_CREDENTIAL_REQUIRED',
        'Users endpoints require session/OAuth authentication.',
      ),
    };
  }
  const db = drizzle(env.DB);
  const user = await usersRepo.findById(db, actor.userId, {
    includeDeleted: true,
  });
  if (!user || user.status !== 'active') {
    return { ok: false, response: errorResponse(403, 'FORBIDDEN') };
  }
  return {
    ok: true,
    actor,
    role: user.role,
    isAdmin: hasAdminRights(user.role),
  };
}
