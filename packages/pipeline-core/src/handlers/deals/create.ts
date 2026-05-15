import { dealsRepo, type CreateDealInput } from '@flowpunk-indie/db';

import type { Actor, PipelineCoreOptions, PipelineEnv } from '../../types.js';
import {
  buildHistoryOpts,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

export async function handleCreateDeal(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
  options: PipelineCoreOptions,
): Promise<Response> {
  const body = await requireJsonBody<CreateDealInput>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const deal = await dealsRepo.create(
      db,
      body.value,
      actor.userId,
      now,
      buildHistoryOpts(actor, options),
    );
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(201, { deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
