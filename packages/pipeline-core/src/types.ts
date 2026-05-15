import type { IdentityHeaderValues } from '@flowpunk/gateway/auth';
import type { IdempotencyKvNamespace } from '@flowpunk/service-utils';

export interface PipelineEnv {
  DB: D1Database;
  IDEMPOTENCY_KV: KVNamespace & IdempotencyKvNamespace;
  /**
   * Optional unhashed prefix prepended to idempotency cache keys
   * (e.g. `"pipeline:"`). Indie sets this in `wrangler.toml [vars]` so
   * the three indie services can share one consolidated `IDEMPOTENCY_KV`
   * namespace and still be listable per-service. Managed leaves it
   * unset → keys stay byte-identical.
   */
  IDEMPOTENCY_KEY_PREFIX?: string;
}

/**
 * Per-edition options resolved at wrapper boundary, threaded into the
 * core via `route()`'s 4th argument. Matches the
 * `enforceSingleOwner` / `maxActiveKeys` precedent from users-core /
 * auth-core (ADR-011 §201, ADR-022 §14).
 *
 * `recordHistory` — when true (indie default), every successful deal
 * mutation co-emits a `deal_history` row via `db.batch()`. Managed sets
 * it to `false` for v1 because the dispatch wire contract does not
 * support `D1Database.batch()` (ADR-001 / ADR-022 §14). The repo skips
 * the batch entirely in that mode — no `db.batch([...])` call is made.
 */
export interface PipelineCoreOptions {
  recordHistory: boolean;
}

export const DEFAULT_PIPELINE_CORE_OPTIONS: PipelineCoreOptions = {
  recordHistory: true,
};

/**
 * Resolved actor for a request that has cleared the gateway's auth
 * middleware. Identity headers are stamped by the gateway and trusted
 * here — the gateway is the only ingress for service-binding traffic.
 *
 * Like contacts (and unlike admin-only services), pipeline accepts any of
 * `apikey | oauth | session` — gateway-side scope enforcement is
 * sufficient.
 */
export interface Actor {
  userId: string;
  tenantId: string;
  scope: string;
  credentialType: IdentityHeaderValues['credentialType'];
  credentialId?: string;
  clientId?: string;
}
