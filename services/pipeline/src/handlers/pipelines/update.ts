import { pipelinesRepo, type UpdatePipelinePatch } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, requireJsonBody } from '../_shared.js';

export async function handleUpdatePipeline(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
  id: string,
): Promise<Response> {
  const body = await requireJsonBody<UpdatePipelinePatch>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const result = await pipelinesRepo.update(
      db,
      id,
      body.value,
      actor.userId,
      now,
    );
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(200, { pipeline: result.pipeline });
  } catch (err) {
    return mapRepoError(err);
  }
}
