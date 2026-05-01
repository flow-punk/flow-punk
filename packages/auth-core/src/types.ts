/**
 * Wrapper-supplied options. Indie wrappers pass `maxActiveKeys: 1`
 * (per ADR-012 §"Per-edition caps"); managed wrappers pass `5`. Per
 * ADR-011:201 there is no `EDITION` env-var runtime branch.
 */
export interface AuthCoreOptions {
  maxActiveKeys: number;
}

export interface AuthEnv {
  DB: D1Database;
  LAST_USED_KV: KVNamespace;
  /**
   * Wrapper-supplied options. Each edition's worker `index.ts` constructs
   * this object before forwarding to `route()`.
   */
  AUTH_OPTIONS: AuthCoreOptions;
}

export interface Actor {
  userId: string;
  tenantId: string;
  scope: string;
  credentialType: 'apikey' | 'oauth' | 'session';
  credentialId?: string;
}
