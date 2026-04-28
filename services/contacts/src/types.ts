import type { IdentityHeaderValues } from '@flowpunk/gateway/auth';
import type { IdempotencyKvNamespace } from '@flowpunk/service-utils';

export interface ContactsEnv {
  DB: D1Database;
  IDEMPOTENCY_KV: KVNamespace & IdempotencyKvNamespace;
}

/**
 * Resolved actor for a request that has cleared the gateway's auth
 * middleware. Identity headers are stamped by the gateway and trusted
 * here — the gateway is the only ingress for service-binding traffic.
 *
 * Unlike the tenants service (admin-only), contacts accepts any of
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
