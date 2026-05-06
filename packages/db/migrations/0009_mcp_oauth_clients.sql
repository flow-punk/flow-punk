-- Indie OAuth client registry. Single tenant — no tenant prefix on client_id.
-- created_by / updated_by are NULLABLE because RFC 7591 dynamic client
-- registration is unauthenticated (per ADR-019); register writes NULL.
-- last_used_at supports stale-client GC (90-day cutoff) per ADR-019 §12.
CREATE TABLE mcp_oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  grant_types TEXT NOT NULL,
  response_types TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
