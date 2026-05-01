import { stagesRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from '../_shared.js';

const MAX_LIMIT = 200;
const PIPELINE_ID_REGEX = /^pl_[a-z0-9]{21}$/;

export async function handleListStages(
  request: Request,
  env: PipelineEnv,
  _actor: Actor,
): Promise<Response> {
  const url = new URL(request.url);

  const pipelineIdRaw = url.searchParams.get('pipelineId');
  if (pipelineIdRaw === null) {
    return badRequest(
      'INVALID_INPUT',
      'pipelineId query parameter is required',
    );
  }
  if (!PIPELINE_ID_REGEX.test(pipelineIdRaw)) {
    return badRequest(
      'INVALID_INPUT',
      'pipelineId must match "pl_<21 lowercase alphanumeric>"',
    );
  }

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

  try {
    const db = getDb(env);
    const result = await stagesRepo.list(db, {
      pipelineId: pipelineIdRaw,
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
