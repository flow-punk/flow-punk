import { dealsRepo, type UpdateDealPatch } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, requireJsonBody } from '../_shared.js';

export async function handleUpdateDeal(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const body = await requireJsonBody<UpdateDealPatch>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const result = await dealsRepo.update(db, id, body.value, actor.userId, now);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { deal: result.deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
