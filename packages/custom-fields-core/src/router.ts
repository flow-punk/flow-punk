import type { CustomFieldBaseModel } from "@flowpunk-indie/db";

import { handleArchiveCustomFieldDef } from "./handlers/archive.js";
import { handleCreateCustomFieldDef } from "./handlers/create.js";
import { handleGetCustomFieldDef } from "./handlers/get.js";
import { handleListCustomFieldDefs } from "./handlers/list.js";
import { handleUpdateCustomFieldDef } from "./handlers/update.js";
import type { Actor, CustomFieldsEnv } from "./types.js";

const COLLECTION_PATH = "/api/v1/custom-fields/defs";
const ITEM_PREFIX = "/api/v1/custom-fields/defs/";

export interface RouteOptions {
  /**
   * Base models this service is responsible for. Contacts mounts
   * `['person', 'account']`; pipeline mounts `['deal']`. The router
   * uses this allowlist to 400 cross-service requests and to 404
   * cross-service lookups by id.
   */
  allowedBaseModels: readonly CustomFieldBaseModel[];
}

/**
 * Route a `/api/v1/custom-fields/*` request. Returns `null` when the
 * request is for a path this router does not own — the caller falls
 * through to its own routing.
 *
 * The wrapper service is responsible for authenticating the actor
 * before delegating; identity is propagated via the standard gateway
 * identity headers.
 */
export async function routeCustomFields(
  request: Request,
  env: CustomFieldsEnv,
  actor: Actor,
  options: RouteOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();
  const { allowedBaseModels } = options;

  if (pathname === COLLECTION_PATH) {
    if (method === "GET" || method === "HEAD") {
      return handleListCustomFieldDefs(request, env, actor, allowedBaseModels);
    }
    if (method === "POST") {
      return handleCreateCustomFieldDef(request, env, actor, allowedBaseModels);
    }
    return methodNotAllowed(["GET", "HEAD", "POST"]);
  }
  if (pathname.startsWith(ITEM_PREFIX)) {
    const id = pathname.slice(ITEM_PREFIX.length);
    if (method === "GET" || method === "HEAD") {
      return handleGetCustomFieldDef(
        request,
        env,
        actor,
        id,
        allowedBaseModels,
      );
    }
    if (method === "PATCH") {
      return handleUpdateCustomFieldDef(
        request,
        env,
        actor,
        id,
        allowedBaseModels,
      );
    }
    if (method === "DELETE") {
      return handleArchiveCustomFieldDef(
        request,
        env,
        actor,
        id,
        allowedBaseModels,
      );
    }
    return methodNotAllowed(["GET", "HEAD", "PATCH", "DELETE"]);
  }
  return null;
}

function methodNotAllowed(allow: string[]): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "METHOD_NOT_ALLOWED" },
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: allow.join(", "),
      },
    },
  );
}

/**
 * Path constants exported for the wrapping services so they can decide
 * whether to delegate before parsing further.
 */
export const CUSTOM_FIELDS_PATHS = {
  COLLECTION: COLLECTION_PATH,
  ITEM_PREFIX,
} as const;
