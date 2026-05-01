import { usersRepo } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import {
  emitUsersAudit,
  getDb,
  jsonResponse,
  mapRepoError,
} from './_shared.js';

/**
 * DELETE /api/v1/users/:id — admin only.
 *
 * Soft-deletes the user, then revokes their auth state (mcp_sessions
 * indie-side; managed extends with mcp_oauth_tokens via its own repo).
 * The cascade runs after the row update because both writes target
 * different tables and SQLite's `db.batch` is atomic at the wire level
 * but not transactional in the SQL ACID sense — the §8 defense-in-depth
 * predicate (`status='active'` checked at session/OAuth validation)
 * tolerates the brief eventually-consistent window.
 */
export async function handleSoftDelete(
  _request: Request,
  env: UsersEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const now = new Date().toISOString();
  try {
    const user = await usersRepo.softDelete(getDb(env), id, actor.userId, now);
    await usersRepo.revokeAuthStateForUser(getDb(env), id, now);
    emitUsersAudit(actor, {
      action: 'users.softDeleted',
      resourceType: 'user',
      resourceId: id,
      detail: {},
    });
    return jsonResponse(200, { user });
  } catch (err) {
    return mapRepoError(err);
  }
}
