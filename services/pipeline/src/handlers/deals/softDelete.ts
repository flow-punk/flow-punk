import { dealsRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError } from '../_shared.js';

export async function handleSoftDeleteDeal(
  _request: Request,
  env: PipelineEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const deal = await dealsRepo.softDelete(db, id, actor.userId, now);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
