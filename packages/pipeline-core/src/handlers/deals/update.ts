import { dealsRepo, type UpdateDealPatch } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import {
  buildMutationCtx,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from '../_shared.js';

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
    const ctx = buildMutationCtx(actor, env, now);
    const result = await dealsRepo.update(db, id, body.value, ctx);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { deal: result.deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
