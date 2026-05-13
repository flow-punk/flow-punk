import { dealHistoryRepo } from "@flowpunk-indie/db";

import type { Actor, PipelineEnv } from "../../types.js";
import { badRequest, getDb, jsonResponse, mapRepoError } from "../_shared.js";

const MAX_LIMIT = 200;

/**
 * GET /api/v1/deals/:id/history
 *
 * Cursor-paginated timeline for a single deal, ordered
 * `(created_at DESC, id DESC)`. Append-only — no PATCH or DELETE on this
 * surface. See ADR-022.
 *
 * Sub-resource read posture: no parent-deal active gate. History rows
 * outlive their deal (per ADR-022 §11), so requesting the timeline of a
 * soft-deleted deal returns its history rather than 404.
 */
export async function handleListDealHistoryByDeal(
  request: Request,
  env: PipelineEnv,
  _actor: Actor,
  dealId: string,
): Promise<Response> {
  const url = new URL(request.url);

  let limit: number | undefined;
  const limitRaw = url.searchParams.get("limit");
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return badRequest(
        "INVALID_INPUT",
        `limit must be an integer in [1, ${MAX_LIMIT}]`,
      );
    }
    limit = parsed;
  }

  const cursor = url.searchParams.get("cursor");

  try {
    const db = getDb(env);
    const result = await dealHistoryRepo.listByDeal(db, dealId, {
      limit,
      cursor,
    });
    return jsonResponse(200, {
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    return mapRepoError(err);
  }
}
