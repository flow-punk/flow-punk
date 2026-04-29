import { stagesRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

export async function handleGetStage(
  _request: Request,
  env: PipelineEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const stage = await stagesRepo.findById(db, id);
    if (!stage) return notFound();
    return jsonResponse(200, { stage });
  } catch (err) {
    return mapRepoError(err);
  }
}
