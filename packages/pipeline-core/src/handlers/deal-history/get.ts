import { dealHistoryRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

/**
 * GET /api/v1/deal-history/:id
 *
 * Single history-row read. Returns the row directly (no `dealHistory`
 * envelope key — same shape posture as `GET /api/v1/deals/:id`).
 */
export async function handleGetDealHistory(
  _request: Request,
  env: PipelineEnv,
  _actor: Actor,
  id: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const row = await dealHistoryRepo.findById(db, id);
    if (!row) return notFound();
    return jsonResponse(200, { dealHistory: row });
  } catch (err) {
    return mapRepoError(err);
  }
}
