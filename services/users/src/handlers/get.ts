import { usersRepo } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import { forbidden, getDb, jsonResponse, notFound } from './_shared.js';

/**
 * GET /api/v1/users/:id — self OR admin.
 *
 * The router resolves identity via `requireAuthenticated` and passes
 * both the actor and an `isAdmin` flag here. Self is always allowed for
 * the actor's own row; otherwise admin gating applies.
 */
export async function handleGet(
  _request: Request,
  env: UsersEnv,
  actor: Actor,
  isAdmin: boolean,
  id: string,
): Promise<Response> {
  if (actor.userId !== id && !isAdmin) {
    return forbidden();
  }
  const user = await usersRepo.findById(getDb(env), id);
  if (!user) return notFound();
  return jsonResponse(200, { user });
}
