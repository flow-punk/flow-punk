import { dealsRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from '../_shared.js';

const MAX_LIMIT = 200;
const PIPELINE_ID_REGEX = /^pl_[a-z0-9]{21}$/;
const STAGE_ID_REGEX = /^stg_[a-z0-9]{21}$/;
const ACCOUNT_ID_REGEX = /^acct_[a-z0-9]{21}$/;
const PERSON_ID_REGEX = /^per_[a-z0-9]{21}$/;
const USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export async function handleListDeals(
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

  const filters: {
    pipelineId?: string;
    stageId?: string;
    accountId?: string;
    primaryPersonId?: string;
    ownerUserId?: string;
  } = {};

  const pipelineIdRaw = url.searchParams.get('pipelineId');
  if (pipelineIdRaw !== null) {
    if (!PIPELINE_ID_REGEX.test(pipelineIdRaw)) {
      return badRequest('INVALID_INPUT', 'pipelineId malformed');
    }
    filters.pipelineId = pipelineIdRaw;
  }

  const stageIdRaw = url.searchParams.get('stageId');
  if (stageIdRaw !== null) {
    if (!STAGE_ID_REGEX.test(stageIdRaw)) {
      return badRequest('INVALID_INPUT', 'stageId malformed');
    }
    filters.stageId = stageIdRaw;
  }

  const accountIdRaw = url.searchParams.get('accountId');
  if (accountIdRaw !== null) {
    if (!ACCOUNT_ID_REGEX.test(accountIdRaw)) {
      return badRequest('INVALID_INPUT', 'accountId malformed');
    }
    filters.accountId = accountIdRaw;
  }

  const primaryPersonIdRaw = url.searchParams.get('primaryPersonId');
  if (primaryPersonIdRaw !== null) {
    if (!PERSON_ID_REGEX.test(primaryPersonIdRaw)) {
      return badRequest('INVALID_INPUT', 'primaryPersonId malformed');
    }
    filters.primaryPersonId = primaryPersonIdRaw;
  }

  const ownerUserIdRaw = url.searchParams.get('ownerUserId');
  if (ownerUserIdRaw !== null) {
    if (!USER_ID_REGEX.test(ownerUserIdRaw)) {
      return badRequest('INVALID_INPUT', 'ownerUserId malformed');
    }
    filters.ownerUserId = ownerUserIdRaw;
  }

  try {
    const db = getDb(env);
    const result = await dealsRepo.list(db, {
      ...filters,
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
