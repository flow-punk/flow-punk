import type { IdentityHeaderValues } from "@flowpunk/gateway/auth";
import type { IdempotencyKvNamespace } from "@flowpunk/service-utils";

/**
 * Edition-agnostic options handed in by the wrapper (per ADR-022 §14).
 * Indie + managed both default to `recordHistory: true`; an edition can
 * opt out by setting `PIPELINE_OPTIONS: { recordHistory: false }` on the
 * env handed to `route()` — no code fork.
 */
export interface PipelineCoreOptions {
  /**
   * When `false`, deal + deal-contact mutations skip the `deal_history`
   * write but otherwise behave identically. Default `true` if
   * `PIPELINE_OPTIONS` is absent (preserves wrapper-less consumers).
   */
  recordHistory: boolean;
}

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
  /**
   * Wrapper-supplied options. Optional for backward compatibility — when
   * absent, defaults apply (see `PipelineCoreOptions`).
   */
  PIPELINE_OPTIONS?: PipelineCoreOptions;
  /**
   * Custom-fields registry KV cache (ADR-023 §11). Optional in v1 — when
   * unbound, the registry CRUD path falls back to direct D1 reads.
   * Bound in PR-β when the dashboard hot-path needs the cache.
   */
  CUSTOM_FIELDS_KV?: KVNamespace;
}

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
  credentialType: IdentityHeaderValues["credentialType"];
  credentialId?: string;
  clientId?: string;
}
