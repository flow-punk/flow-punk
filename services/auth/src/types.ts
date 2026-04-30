export interface AuthEnv {
  DB: D1Database;
  LAST_USED_KV: KVNamespace;
}

export interface Actor {
  userId: string;
  tenantId: string;
  scope: string;
  credentialType: 'apikey' | 'oauth' | 'session';
  credentialId?: string;
}
