import { dealsRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { buildMutationCtx, getDb, jsonResponse, mapRepoError } from '../_shared.js';

export async function handleSoftDeleteDeal(
  _request: Request,
  env: PipelineEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const ctx = buildMutationCtx(actor, env, now);
    const deal = await dealsRepo.softDelete(db, id, ctx);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
