import { dealContactsRepo } from "@flowpunk-indie/db";

import type { Actor, PipelineEnv } from "../../types.js";
import {
  buildMutationCtx,
  getDb,
  jsonResponse,
  mapRepoError,
} from "../_shared.js";

/**
 * DELETE /api/v1/deals/:id/contacts/:personId
 *
 * Atomically removes the contact row AND clears `deals.primaryPersonId`
 * when it equals `personId` (single D1 batch). Active-deal gated: 404
 * when the parent deal is missing, 409 when soft-deleted, 404 when the
 * contact row itself is missing.
 */
export async function handleRemoveDealContact(
  _request: Request,
  env: PipelineEnv,
  actor: Actor,
  dealId: string,
  personId: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const ctx = buildMutationCtx(actor, env, now);
    await dealContactsRepo.remove(db, dealId, personId, ctx);
    return jsonResponse(200, { success: true });
  } catch (err) {
    return mapRepoError(err);
  }
}
