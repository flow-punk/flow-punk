import { stagesRepo, type CreateStageInput } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, requireJsonBody } from '../_shared.js';

export async function handleCreateStage(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
): Promise<Response> {
  const body = await requireJsonBody<CreateStageInput>(request);
  if (body.kind === 'err') return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const stage = await stagesRepo.create(db, body.value, actor.userId, now);
    // audit emission deferred — see plan §Out of scope
    return jsonResponse(201, { stage });
  } catch (err) {
    return mapRepoError(err);
  }
}
