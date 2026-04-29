import { pipelinesRepo, type CreatePipelineInput } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, requireJsonBody } from '../_shared.js';

export async function handleCreatePipeline(
  request: Request,
  env: PipelineEnv,
  _actor: Actor,
): Promise<Response> {
  const body = await requireJsonBody<CreatePipelineInput>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const pipeline = await pipelinesRepo.create(
      db,
      body.value,
      _actor.userId,
      now,
    );
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(201, { pipeline });
  } catch (err) {
    return mapRepoError(err);
  }
}
