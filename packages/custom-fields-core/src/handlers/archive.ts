import {
  customFieldDefsRepo,
  type CustomFieldBaseModel,
} from "@flowpunk-indie/db";

import { invalidateCache } from "../cache.js";
import type { Actor, CustomFieldsEnv } from "../types.js";
import {
  badRequest,
  conflict,
  emitCustomFieldsAudit,
  errorResponse,
  getDb,
  isBaseModelAllowed,
  jsonResponse,
  mapRepoError,
  notFound,
  parseIfMatchVersion,
  serializeDef,
} from "./_shared.js";

/**
 * DELETE /custom-fields/defs/:id
 * Header: If-Match: <version>
 *
 * Archive (tombstone) a def. The row is not hard-deleted — its slug
 * becomes available for reuse via the partial unique index, but the
 * row itself remains for audit/discovery (`includeArchived=1`).
 *
 * Existing `custom_data` values on entity rows are NOT touched and
 * become inert. The dropping of any matching expression index lands in
 * PR-β alongside the filterable workflow.
 */
export async function handleArchiveCustomFieldDef(
  request: Request,
  env: CustomFieldsEnv,
  actor: Actor,
  id: string,
  allowedBaseModels: readonly CustomFieldBaseModel[],
): Promise<Response> {
  if (id.length === 0 || id.includes("/")) {
    return badRequest("INVALID_INPUT", "id is required");
  }

  const expectedVersion = parseIfMatchVersion(request);
  if (expectedVersion === null) {
    return errorResponse(
      428,
      "PRECONDITION_REQUIRED",
      "If-Match: <version> header is required",
    );
  }

  const db = getDb(env);
  const existing = await customFieldDefsRepo.findById(db, id);
  if (!existing) return notFound();
  if (!isBaseModelAllowed(existing.baseModel, allowedBaseModels))
    return notFound();

  try {
    const now = new Date().toISOString();
    const result = await customFieldDefsRepo.archive(
      db,
      id,
      expectedVersion,
      now,
      actor.userId,
    );

    if (result.conflict) {
      return conflict(
        "VERSION_CONFLICT",
        "expected If-Match version does not match current row",
        { current: serializeDef(result.current) },
      );
    }

    if (env.CUSTOM_FIELDS_KV) {
      try {
        await invalidateCache(
          env.CUSTOM_FIELDS_KV,
          actor.tenantId,
          result.def.baseModel,
        );
      } catch {
        // swallow — invalidate is best-effort
      }
    }

    emitCustomFieldsAudit(actor, {
      action: "custom_fields.def.archived",
      resourceType: "custom_field_def",
      resourceId: result.def.id,
      detail: { baseModel: result.def.baseModel },
    });

    return jsonResponse(200, { def: serializeDef(result.def) });
  } catch (err) {
    return mapRepoError(err);
  }
}
