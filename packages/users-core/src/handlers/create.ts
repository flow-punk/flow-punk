import { isRole, usersRepo, type Role } from '@flowpunk-indie/db';

import type { Actor, UsersEnv } from '../types.js';
import {
  badRequest,
  emitUsersAudit,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from './_shared.js';

interface CreateBody {
  email?: unknown;
  displayName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  role?: unknown;
}

export async function handleCreate(
  request: Request,
  env: UsersEnv,
  actor: Actor,
): Promise<Response> {
  const body = await requireJsonBody<CreateBody>(request);
  if (body.kind === 'err') return body.response;
  const input = body.value;

  if (typeof input.email !== 'string') return badRequest('INVALID_EMAIL');
  if (typeof input.displayName !== 'string') return badRequest('INVALID_DISPLAY_NAME');
  if (input.firstName !== undefined && input.firstName !== null && typeof input.firstName !== 'string') {
    return badRequest('INVALID_FIRST_NAME');
  }
  if (input.lastName !== undefined && input.lastName !== null && typeof input.lastName !== 'string') {
    return badRequest('INVALID_LAST_NAME');
  }
  let role: Role | undefined;
  if (input.role !== undefined) {
    if (!isRole(input.role)) {
      return badRequest('INVALID_ROLE', 'role must be one of owner, admin, member, readonly');
    }
    role = input.role;
  }

  const now = new Date().toISOString();
  try {
    const user = await usersRepo.create(
      getDb(env),
      {
        email: input.email,
        displayName: input.displayName,
        firstName: input.firstName as string | null | undefined,
        lastName: input.lastName as string | null | undefined,
        role,
      },
      actor.userId,
      now,
      { enforceSingleOwner: env.USERS_OPTIONS.enforceSingleOwner },
    );
    emitUsersAudit(actor, {
      action: 'users.created',
      resourceType: 'user',
      resourceId: user.id,
      detail: { role: user.role },
    });
    return jsonResponse(201, { user });
  } catch (err) {
    return mapRepoError(err);
  }
}
