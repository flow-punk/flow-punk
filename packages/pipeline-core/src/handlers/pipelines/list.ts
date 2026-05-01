import { pipelinesRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from '../_shared.js';

const MAX_LIMIT = 200;

export async function handleListPipelines(
  request: Request,
  env: PipelineEnv,
  _actor: Actor,
): Promise<Response> {
  const url = new URL(request.url);

  let limit: number | undefined;
  const limitRaw = url.searchParams.get('limit');
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return badRequest(
        'INVALID_INPUT',
        `limit must be an integer in [1, ${MAX_LIMIT}]`,
      );
    }
    limit = parsed;
  }

  const cursor = url.searchParams.get('cursor');

  // includeDeleted is intentionally NOT exposed (matches contacts posture).
  try {
    const db = getDb(env);
    const result = await pipelinesRepo.list(db, {
      limit,
      cursor,
      includeDeleted: false,
    });
    return jsonResponse(200, {
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return mapRepoError(err);
  }
}
