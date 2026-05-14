import { dealContactsRepo, type DealContactRole } from "@flowpunk-indie/db";

import type { Actor, PipelineEnv } from "../../types.js";
import {
  buildMutationCtx,
  getDb,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
} from "../_shared.js";

interface AddDealContactBody {
  personId: string;
  role?: DealContactRole | null;
}

/**
 * POST /api/v1/deals/:id/contacts
 *
 * Body: `{ personId, role? }`. Adds a person to a deal's contacts. Pre-checks
 * that the parent deal is active (404 if missing, 409 if soft-deleted) and
 * the person is active (400 if not). PK collision on (dealId, personId)
 * surfaces as 409 CONFLICT.
 */
export async function handleAddDealContact(
  request: Request,
  env: PipelineEnv,
  actor: Actor,
  dealId: string,
): Promise<Response> {
  const body = await requireJsonBody<AddDealContactBody>(request);
  if (body.kind === "err") return body.response;

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const ctx = buildMutationCtx(actor, env, now);
    const contact = await dealContactsRepo.add(
      db,
      {
        dealId,
        personId: body.value.personId,
        role: body.value.role ?? null,
      },
      ctx,
    );
    return jsonResponse(201, { dealContact: contact });
  } catch (err) {
    return mapRepoError(err);
  }
}
