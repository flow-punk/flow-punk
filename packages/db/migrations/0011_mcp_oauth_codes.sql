-- Indie OAuth authorization codes (PKCE). Single-use, atomic consumption via
-- `UPDATE … SET used_at = … WHERE used_at IS NULL` so a replay race cannot
-- mint two token pairs from one code.
CREATE TABLE mcp_oauth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX idx_mcp_oauth_codes_client_id ON mcp_oauth_codes (client_id);
