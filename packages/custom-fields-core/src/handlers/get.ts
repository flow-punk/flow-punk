import {
  customFieldDefsRepo,
  type CustomFieldBaseModel,
} from "@flowpunk-indie/db";

import type { Actor, CustomFieldsEnv } from "../types.js";
import {
  badRequest,
  getDb,
  jsonResponse,
  mapRepoError,
  notFound,
  isBaseModelAllowed,
  serializeDef,
} from "./_shared.js";

/**
 * GET /custom-fields/defs/:id
 *
 * Returns a single def. Archived defs are returned (the dashboard shows
 * archived entries when restoring). The wrapper service constrains which
 * base models it owns; a def for an unowned base model 404s.
 */
export async function handleGetCustomFieldDef(
  _request: Request,
  env: CustomFieldsEnv,
  _actor: Actor,
  id: string,
  allowedBaseModels: readonly CustomFieldBaseModel[],
): Promise<Response> {
  if (id.length === 0 || id.includes("/")) {
    return badRequest("INVALID_INPUT", "id is required");
  }
  try {
    const db = getDb(env);
    const def = await customFieldDefsRepo.findById(db, id);
    if (!def) return notFound();
    if (!isBaseModelAllowed(def.baseModel, allowedBaseModels)) {
      // Treat as not-found rather than leaking that the id exists but is
      // owned by another service.
      return notFound();
    }
    return jsonResponse(200, { def: serializeDef(def) });
  } catch (err) {
    return mapRepoError(err);
  }
}
