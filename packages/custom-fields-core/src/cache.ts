/**
 * KV-backed registry cache. See ADR-023 §11.
 *
 * Key shape: `cf:{tenantId}:{baseModel}` → JSON `{ version: number, defs: CustomFieldDef[] }`.
 *
 * Read path uses the cached `defs` directly when `version` is current.
 * Write path (validation of `custom_data` mutations on entity rows in
 * PR-β) issues `customFieldDefsRepo.getMaxVersion(...)` to check
 * freshness, invalidates and re-reads on mismatch.
 *
 * The KV namespace is optional in v1 — when absent, handlers fall back
 * to direct D1 reads. This keeps local-dev runnable without a KV binding.
 */
import type { CustomFieldBaseModel, CustomFieldDef } from "@flowpunk-indie/db";

const TTL_SECONDS = 300; // 5 min

interface CachePayload {
  version: number;
  defs: CustomFieldDef[];
}

export function cacheKey(
  tenantId: string,
  baseModel: CustomFieldBaseModel,
): string {
  return `cf:${tenantId}:${baseModel}`;
}

export async function getCache(
  kv: KVNamespace,
  tenantId: string,
  baseModel: CustomFieldBaseModel,
): Promise<CachePayload | null> {
  const raw = await kv.get(cacheKey(tenantId, baseModel));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload;
    if (typeof parsed.version !== "number" || !Array.isArray(parsed.defs)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setCache(
  kv: KVNamespace,
  tenantId: string,
  baseModel: CustomFieldBaseModel,
  payload: CachePayload,
): Promise<void> {
  await kv.put(cacheKey(tenantId, baseModel), JSON.stringify(payload), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function invalidateCache(
  kv: KVNamespace,
  tenantId: string,
  baseModel: CustomFieldBaseModel,
): Promise<void> {
  await kv.delete(cacheKey(tenantId, baseModel));
}

export type { CachePayload };
