/**
 * Handler for `GET /api/v1/deals/:id/history` — cursor-paginated read of a
 * single deal's append-only timeline (ADR-022 §15).
 *
 * History rows survive soft-delete of the parent deal: this handler does
 * NOT pre-check that the deal exists or is active. An empty list is a
 * valid response (deal had no mutations recorded, e.g., managed tenant
 * with `recordHistory: false`).
 *
 * PII: `changes` is `pii()`-marked at the schema layer; this handler
 * returns the row as-is in the HTTP body. The dashboard consumer is
 * PII-aware. Never log the row — `mapRepoError` does not emit `changes`.
 */
import { dealHistoryRepo } from '@flowpunk-indie/db';

import type { Actor, PipelineEnv } from '../../types.js';
import { badRequest, getDb, jsonResponse, mapRepoError } from '../_shared.js';

export async function handleListDealHistory(
  request: Request,
  env: PipelineEnv,
  _actor: Actor,
  dealId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor');

  // Match the deals/contacts list contract: reject over-limit values
  // outright rather than silently clamping. The OpenAPI spec advertises
  // maximum=200, so callers should hear about violations.
  const MAX_LIMIT = 200;
  let limit: number | undefined;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return badRequest(
        'INVALID_INPUT',
        `limit must be an integer in [1, ${MAX_LIMIT}]`,
      );
    }
    limit = parsed;
  }

  try {
    const db = getDb(env);
    const result = await dealHistoryRepo.listByDealId(db, dealId, {
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
