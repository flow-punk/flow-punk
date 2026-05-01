import {
  ALLOWED_PATCH_FIELDS,
  SELF_ALLOWED_PATCH_FIELDS,
  isAllowedPatchField,
  usersRepo,
  type UpdateUserPatch,
  type UserPatchableField,
} from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import {
  emitUsersAudit,
  forbidden,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from './_shared.js';

/**
 * PATCH /api/v1/users/:id — self OR admin.
 *
 * Self can only patch fields in `SELF_ALLOWED_PATCH_FIELDS` (display
 * name + first/last name). `email` and `role` are admin-only because
 * email is an identifier (changing it without verification is an
 * account-takeover vector) and role is a privilege transition.
 *
 * Role transitions are race-safe (`enforceSingleOwner` + atomic
 * single-statement UPDATEs in the repo). The `users.updated` audit
 * fields-changed list includes `role` when it transitions; a separate
 * `users.roleChanged` event is emitted by `usersRepo.setRole` (future).
 */
export async function handleUpdate(
  request: Request,
  env: UsersEnv,
  actor: Actor,
  isAdmin: boolean,
  id: string,
): Promise<Response> {
  const body = await requireJsonBody<Record<string, unknown>>(request);
  if (body.kind === 'err') return body.response;
  const patch = body.value;

  const isSelf = actor.userId === id;
  if (!isSelf && !isAdmin) {
    return forbidden();
  }

  // Surface "field not patchable" before any privilege check so the
  // client gets the same INVALID_INPUT shape from the repo whether or
  // not it's caller-mediated.
  for (const key of Object.keys(patch)) {
    if (!isAllowedPatchField(key)) continue; // repo validates immutable + unknown
    if (!isAdmin && !SELF_ALLOWED_PATCH_FIELDS.has(key as UserPatchableField)) {
      return forbidden('FORBIDDEN_FIELD', `field "${key}" is admin-only`);
    }
  }

  const now = new Date().toISOString();
  try {
    const result = await usersRepo.update(
      getDb(env),
      id,
      patch as UpdateUserPatch,
      actor.userId,
      now,
      { enforceSingleOwner: env.USERS_OPTIONS.enforceSingleOwner },
    );
    if (result.fieldsChanged.length > 0) {
      emitUsersAudit(actor, {
        action: 'users.updated',
        resourceType: 'user',
        resourceId: id,
        detail: {
          fieldsChanged: result.fieldsChanged.filter((f) =>
            (ALLOWED_PATCH_FIELDS as readonly string[]).includes(f),
          ),
        },
      });
    }
    return jsonResponse(200, { user: result.user });
  } catch (err) {
    return mapRepoError(err);
  }
}
