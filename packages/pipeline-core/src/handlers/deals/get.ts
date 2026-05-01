import { dealsRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

export async function handleGetDeal(
  _request: Request,
  env: PipelineEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const deal = await dealsRepo.findById(db, id);
    if (!deal) return notFound();
    return jsonResponse(200, { deal });
  } catch (err) {
    return mapRepoError(err);
  }
}
