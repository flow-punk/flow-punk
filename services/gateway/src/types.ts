export interface Env {
  // Service bindings
  CONTACTS_SERVICE: Fetcher;
  PIPELINE_SERVICE: Fetcher;
  AUTOMATIONS_SERVICE: Fetcher;
  AUTH_SERVICE: Fetcher;
  FORMINPUTS_SERVICE: Fetcher;
  CMS_SERVICE: Fetcher;

  // KV namespaces
  MCP_TOOLS_KV: KVNamespace;
  MCP_SESSIONS_KV: KVNamespace;
  MCP_SESSION_DO: DurableObjectNamespace;

  // D1 — indie platform DB (users, mcp_sessions)
  DB: D1Database;

  // Configuration
  MAX_REQUEST_BODY_BYTES: string;
  SERVICE_TIMEOUT_MS: string;
  ALLOWED_ORIGINS: string;
}

import type { CredentialType } from './auth/identity-headers.js';

export interface AppContext {
  request: Request;
  env: Env;
  requestId: string;
  tenantId?: string;
  userId?: string;
  credentialId?: string;
  credentialType?: CredentialType;
  keyLabel?: string | null;
  scope?: string;
}

export type Middleware = (
  ctx: AppContext,
  next: () => Promise<Response>,
) => Promise<Response>;
