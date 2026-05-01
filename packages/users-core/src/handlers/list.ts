import { isRole, usersRepo, type Role } from '@flowpunk-indie/db';

import type { UsersEnv } from '../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from './_shared.js';

export async function handleList(
  request: Request,
  env: UsersEnv,
): Promise<Response> {
  const url = new URL(request.url);

  const limitParam = url.searchParams.get('limit');
  let limit: number | undefined;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return badRequest('INVALID_LIMIT', 'limit must be a positive integer');
    }
    limit = parsed;
  }

  const cursor = url.searchParams.get('cursor') ?? undefined;
  const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

  let role: Role | undefined;
  const roleParam = url.searchParams.get('role');
  if (roleParam !== null) {
    if (!isRole(roleParam)) {
      return badRequest(
        'INVALID_ROLE',
        'role must be one of owner, admin, member, readonly',
      );
    }
    role = roleParam;
  }

  try {
    const result = await usersRepo.list(getDb(env), {
      limit,
      cursor,
      includeDeleted,
      role,
    });
    return jsonResponse(200, result);
  } catch (err) {
    return mapRepoError(err);
  }
}
