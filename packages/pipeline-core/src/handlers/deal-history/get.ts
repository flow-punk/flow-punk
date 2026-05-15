/**
 * Handler for `GET /api/v1/deal-history/:id` — single history-row read
 * (ADR-022 §15). Returns 404 if no row with that id.
 *
 * `deal_history` is immutable (no PATCH / DELETE) — the kind-CHECK
 * constraint and append-only emit path are the only ways to insert. This
 * handler is read-only.
 */
import { dealHistoryRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { getDb, jsonResponse, mapRepoError, notFound } from '../_shared.js';

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
    return jsonResponse(200, { deal_history: row });
  } catch (err) {
    return mapRepoError(err);
  }
}
