import { stagesRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError } from '../_shared.js';

export async function handleSoftDeleteStage(
  _request: Request,
  env: PipelineEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const stage = await stagesRepo.softDelete(db, id, actor.userId, now);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { stage });
  } catch (err) {
    return mapRepoError(err);
  }
}
