-- Indie OAuth access + refresh tokens. Plain `mcp_<random>` (no tenant prefix).
-- Token plaintext is never stored — only the SHA-256 hex hash.
CREATE TABLE mcp_oauth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL DEFAULT 'access',
  family_id TEXT NOT NULL DEFAULT '',
  family_created_at TEXT NOT NULL DEFAULT '',
  parent_token_id TEXT,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX idx_mcp_oauth_tokens_user_id ON mcp_oauth_tokens (user_id);
CREATE INDEX idx_mcp_oauth_tokens_family_id ON mcp_oauth_tokens (family_id);
