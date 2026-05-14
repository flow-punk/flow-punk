import {
  customFieldDefsRepo,
  type CustomFieldBaseModel,
  type UpdateCustomFieldDefInput,
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
  requireJsonBody,
  serializeDef,
} from "./_shared.js";

interface UpdateBody {
  description?: unknown;
  pii?: unknown;
  // Forward-compat: `filterable` would land here in PR-β. v1 rejects it.
  filterable?: unknown;
}

const ALLOWED_PATCH_FIELDS = new Set(["description", "pii"]);

/**
 * PATCH /custom-fields/defs/:id
 * Body: { description?, pii? }
 * Header: If-Match: <version>
 *
 * Optimistic concurrency: missing or malformed `If-Match` returns 428
 * PRECONDITION_REQUIRED. Version mismatch returns 409 VERSION_CONFLICT
 * with the current row in the response body so the client can re-render.
 *
 * v1 does NOT accept `filterable` changes through this endpoint — those
 * land via a dedicated transition endpoint in PR-β. Sending an unknown
 * field returns 400 to make the API contract loud.
 */
export async function handleUpdateCustomFieldDef(
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

  const body = await requireJsonBody<UpdateBody>(request);
  if (body.kind === "err") return body.response;

  // Reject unknown fields to keep the contract honest. `filterable` is
  // intentionally listed separately so the error message points at
  // PR-β rather than a generic "unknown".
  const keys = Object.keys(body.value);
  if (keys.includes("filterable")) {
    return badRequest(
      "UNSUPPORTED_FIELD",
      "filterable transitions are not yet supported",
    );
  }
  for (const k of keys) {
    if (!ALLOWED_PATCH_FIELDS.has(k)) {
      return badRequest("INVALID_INPUT", `unknown patch field: ${k}`);
    }
  }

  const { description, pii } = body.value;
  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    return badRequest("INVALID_INPUT", "description must be a string or null");
  }
  if (pii !== undefined && typeof pii !== "boolean") {
    return badRequest("INVALID_INPUT", "pii must be a boolean");
  }

  // Pre-flight: confirm the def exists AND belongs to a base model owned
  // by this service. Returning 404 here (vs 403) follows the "treat
  // unowned ids as not-found" rule from the GET handler.
  const db = getDb(env);
  const existing = await customFieldDefsRepo.findById(db, id);
  if (!existing) return notFound();
  if (!isBaseModelAllowed(existing.baseModel, allowedBaseModels))
    return notFound();

  const patch: UpdateCustomFieldDefInput = {};
  if (Object.prototype.hasOwnProperty.call(body.value, "description")) {
    patch.description = (description as string | null | undefined) ?? null;
  }
  if (pii !== undefined) patch.pii = pii as boolean;

  try {
    const now = new Date().toISOString();
    const result = await customFieldDefsRepo.update(
      db,
      id,
      patch,
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

    const fieldsChanged: ("description" | "pii")[] = [];
    if (Object.prototype.hasOwnProperty.call(patch, "description")) {
      fieldsChanged.push("description");
    }
    if (patch.pii !== undefined) fieldsChanged.push("pii");

    emitCustomFieldsAudit(actor, {
      action: "custom_fields.def.updated",
      resourceType: "custom_field_def",
      resourceId: result.def.id,
      detail: {
        baseModel: result.def.baseModel,
        fieldsChanged,
      },
    });

    return jsonResponse(200, { def: serializeDef(result.def) });
  } catch (err) {
    return mapRepoError(err);
  }
}
