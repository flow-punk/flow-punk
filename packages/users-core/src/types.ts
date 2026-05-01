import type { IdentityHeaderValues } from '@flowpunk/gateway/auth';
import type { IdempotencyKvNamespace } from '@flowpunk/service-utils';

/**
 * Edition-agnostic options handed in by the wrapper. Indie wrappers pass
 * `enforceSingleOwner: true` (per ADR-011 §"Indie multi-user foundation");
 * managed wrappers pass `false`.
 *
 * Per ADR-011:201 there is no `EDITION` env-var runtime branch; behavior
 * is selected at the wrapper boundary by passing different option
 * constants.
 */
export interface UsersCoreOptions {
  enforceSingleOwner: boolean;
}

export interface UsersEnv {
  DB: D1Database;
  IDEMPOTENCY_KV: KVNamespace & IdempotencyKvNamespace;
  /**
   * Wrapper-supplied options. Each edition's worker `index.ts` constructs
   * this object before forwarding to `route()`. See ADR-011:201 + ADR-013.
   */
  USERS_OPTIONS: UsersCoreOptions;
}

/**
 * Resolved actor for a request that has cleared the gateway's auth
 * middleware. Identity headers are stamped by the gateway and trusted
 * here — the gateway is the only ingress for service-binding traffic.
 *
 * Users CRUD differentiates self vs admin per-handler. The router
 * pre-checks admin for LIST/CREATE/DELETE; GET and PATCH parse identity
 * and let the handler decide based on whether `actor.userId === :id`.
 */
export interface Actor {
  userId: string;
  tenantId: string;
  scope: string;
  credentialType: IdentityHeaderValues['credentialType'];
  credentialId?: string;
  clientId?: string;
}
