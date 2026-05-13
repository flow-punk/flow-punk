import type { IdentityHeaderValues } from '@flowpunk/gateway/auth';
import type { CustomFieldBaseModel } from '@flowpunk-indie/db';

/**
 * Edition-agnostic options handed in by the wrapper. PR-α has no
 * options needing divergence between indie and managed — kept here for
 * forward compatibility with PR-β's async DDL driver, which will be the
 * first real options surface.
 */
export interface CustomFieldsCoreOptions {
  /** Placeholder; no PR-α-visible knob. */
  _reserved?: never;
}

export interface CustomFieldsEnv {
  DB: D1Database;
  /**
   * Registry KV cache. Keyed `cf:{tenantId}:{baseModel}` per ADR-023 §11.
   * Optional in v1 — handlers fall back to direct D1 reads when absent,
   * which is the path indie's dev mode takes when no KV is bound.
   */
  CUSTOM_FIELDS_KV?: KVNamespace;
  CUSTOM_FIELDS_OPTIONS?: CustomFieldsCoreOptions;
}

/**
 * Resolved actor for a request that has cleared the gateway's auth
 * middleware. Identity headers are stamped by the gateway and trusted
 * here. Matches the shape used by `@flowpunk-indie/contacts-core` and
 * `@flowpunk-indie/pipeline-core`.
 */
export interface Actor {
  userId: string;
  tenantId: string;
  scope: string;
  credentialType: IdentityHeaderValues['credentialType'];
  credentialId?: string;
  clientId?: string;
}

export type { CustomFieldBaseModel };
