import { dealContactsRepo } from "@flowpunk-indie/db";

import type { Actor, PipelineEnv } from "../../types.js";
import { getDb, jsonResponse, mapRepoError } from "../_shared.js";

/**
 * GET /api/v1/deals/:id/contacts
 *
 * Lists contacts for an active deal. Soft-deleted parent → 404 (mirrors
 * `GET /api/v1/deals/:id` with default `includeDeleted=false`). Order is
 * `(created_at ASC, person_id ASC)` for stable history.
 */
export async function handleListDealContacts(
  _request: Request,
  env: PipelineEnv,
  _actor: Actor,
  dealId: string,
): Promise<Response> {
  try {
    const db = getDb(env);
    const result = await dealContactsRepo.listByDeal(db, dealId);
    return jsonResponse(200, { items: result.items });
  } catch (err) {
    return mapRepoError(err);
  }
}
