import { pipelinesRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

export async function handleGetPipeline(
  _request: Request,
  env: PipelineEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const pipeline = await pipelinesRepo.findById(db, id);
    if (!pipeline) return notFound();
    return jsonResponse(200, { pipeline });
  } catch (err) {
    return mapRepoError(err);
  }
}
