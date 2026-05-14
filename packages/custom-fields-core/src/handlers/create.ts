import {
  customFieldDefsRepo,
  type CreateCustomFieldDefInput,
  type CustomFieldBaseModel,
} from "@flowpunk-indie/db";

import { invalidateCache } from "../cache.js";
import type { Actor, CustomFieldsEnv } from "../types.js";
import {
  badRequest,
  emitCustomFieldsAudit,
  getDb,
  isBaseModelAllowed,
  jsonResponse,
  mapRepoError,
  requireJsonBody,
  serializeDef,
} from "./_shared.js";

interface CreateBody {
  baseModel?: unknown;
  name?: unknown;
  description?: unknown;
  pii?: unknown;
}

const ALLOWED_CREATE_FIELDS = new Set([
  "baseModel",
  "name",
  "description",
  "pii",
]);

/**
 * POST /custom-fields/defs
 * Body: { baseModel, name, description?, pii? }
 *
 * Creates an active, `filterable_status: 'disabled'` def at `version: 1`.
 * Filterable transitions land in PR-β.
 */
export async function handleCreateCustomFieldDef(
  request: Request,
  env: CustomFieldsEnv,
  actor: Actor,
  allowedBaseModels: readonly CustomFieldBaseModel[],
): Promise<Response> {
  const body = await requireJsonBody<CreateBody>(request);
  if (body.kind === "err") return body.response;

  // Mirror the PATCH posture: reject unknown fields so the OpenAPI
  // `additionalProperties: false` contract matches server behavior.
  for (const k of Object.keys(body.value)) {
    if (!ALLOWED_CREATE_FIELDS.has(k)) {
      return badRequest("INVALID_INPUT", `unknown create field: ${k}`);
    }
  }

  const { baseModel, name, description, pii } = body.value;

  if (typeof baseModel !== "string") {
    return badRequest("INVALID_INPUT", "baseModel is required");
  }
  if (
    !isBaseModelAllowed(baseModel as CustomFieldBaseModel, allowedBaseModels)
  ) {
    return badRequest(
      "BASE_MODEL_NOT_OWNED",
      `this service does not own baseModel "${baseModel}"`,
    );
  }
  if (typeof name !== "string") {
    return badRequest("INVALID_INPUT", "name is required");
  }
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

  const input: CreateCustomFieldDefInput = {
    baseModel: baseModel as CustomFieldBaseModel,
    name,
    description: (description as string | null | undefined) ?? null,
    pii: pii as boolean | undefined,
  };

  try {
    const db = getDb(env);
    const now = new Date().toISOString();
    const def = await customFieldDefsRepo.create(db, input, now, actor.userId);

    if (env.CUSTOM_FIELDS_KV) {
      try {
        await invalidateCache(
          env.CUSTOM_FIELDS_KV,
          actor.tenantId,
          def.baseModel,
        );
      } catch {
        // swallow — invalidate is best-effort
      }
    }

    emitCustomFieldsAudit(actor, {
      action: "custom_fields.def.created",
      resourceType: "custom_field_def",
      resourceId: def.id,
      detail: {
        baseModel: def.baseModel,
        pii: def.pii === 1,
      },
    });

    return jsonResponse(201, { def: serializeDef(def) });
  } catch (err) {
    return mapRepoError(err);
  }
}
