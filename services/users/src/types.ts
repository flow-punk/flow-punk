import type { IdentityHeaderValues } from '@flowpunk/gateway/auth';
import type { IdempotencyKvNamespace } from '@flowpunk/service-utils';

export interface UsersEnv {
  DB: D1Database;
  IDEMPOTENCY_KV: KVNamespace & IdempotencyKvNamespace;
  /**
   * Edition flag. Indie passes `"indie"` and the create/promote paths
   * enforce the one-active-admin invariant per ADR-011. Managed passes
   * `"managed"` (multiple platform admins permitted).
   */
  EDITION: 'indie' | 'managed';
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
