import {
  customFieldDefsRepo,
  type CustomFieldBaseModel,
} from "@flowpunk-indie/db";

import { getCache, invalidateCache, setCache } from "../cache.js";
import type { Actor, CustomFieldsEnv } from "../types.js";
import {
  badRequest,
  getDb,
  jsonResponse,
  mapRepoError,
  parseBaseModelParam,
  isBaseModelAllowed,
  serializeDef,
} from "./_shared.js";

/**
 * GET /custom-fields/defs?baseModel=person|account|deal&includeArchived=1
 *
 * Returns all defs for the given base model. The dashboard uses this to
 * render the lifecycle (pending/ready/failed) — MCP descriptor hydration
 * uses a different path that filters to `ready` only (PR-β).
 *
 * `allowedBaseModels` is wrapper-supplied: contacts mounts `[person, account]`,
 * pipeline mounts `[deal]`. A request asking for a base model not owned
 * by the calling service returns 400.
 */
export async function handleListCustomFieldDefs(
  request: Request,
  env: CustomFieldsEnv,
  _actor: Actor,
  allowedBaseModels: readonly CustomFieldBaseModel[],
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseBaseModelParam(url);
  if (parsed.kind === "err") return parsed.response;
  if (!isBaseModelAllowed(parsed.baseModel, allowedBaseModels)) {
    return badRequest(
      "BASE_MODEL_NOT_OWNED",
      `this service does not own baseModel "${parsed.baseModel}"`,
    );
  }
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  // Cache hit path: when KV is bound AND the caller is not requesting
  // archived rows (the cache stores active-only data per §11), try the
  // cache first and verify freshness against MAX(version).
  const db = getDb(env);
  if (env.CUSTOM_FIELDS_KV && !includeArchived) {
    try {
      const liveVersion = await customFieldDefsRepo.getMaxVersion(
        db,
        parsed.baseModel,
      );
      const cached = await getCache(
        env.CUSTOM_FIELDS_KV,
        _actor.tenantId,
        parsed.baseModel,
      );
      if (cached && cached.version === liveVersion) {
        return jsonResponse(200, { defs: cached.defs.map(serializeDef) });
      }
      const defs = await customFieldDefsRepo.list(db, parsed.baseModel);
      await setCache(env.CUSTOM_FIELDS_KV, _actor.tenantId, parsed.baseModel, {
        version: liveVersion,
        defs,
      });
      return jsonResponse(200, { defs: defs.map(serializeDef) });
    } catch (err) {
      // Best-effort cache; on any KV failure fall through to direct read.
      if (env.CUSTOM_FIELDS_KV) {
        try {
          await invalidateCache(
            env.CUSTOM_FIELDS_KV,
            _actor.tenantId,
            parsed.baseModel,
          );
        } catch {
          // swallow — invalidate is best-effort
        }
      }
      return mapRepoError(err);
    }
  }

  try {
    const defs = await customFieldDefsRepo.list(db, parsed.baseModel, {
      includeArchived,
    });
    return jsonResponse(200, { defs: defs.map(serializeDef) });
  } catch (err) {
    return mapRepoError(err);
  }
}
