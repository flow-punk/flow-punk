-- Indie OAuth pending authorize requests (cookie-bound between
-- /oauth/authorize and /oauth/approve). cookie_binding_hash and csrf_nonce_hash
-- both ship from day one (defense-in-depth pair) — no follow-up ALTER required.
CREATE TABLE mcp_oauth_authorize_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  state TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  cookie_binding_hash TEXT NOT NULL,
  csrf_nonce_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX idx_mcp_oauth_authorize_requests_client_id
  ON mcp_oauth_authorize_requests (client_id);
