CREATE TABLE mcp_sessions (
  id TEXT PRIMARY KEY,
  cookie_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX idx_mcp_sessions_user_id ON mcp_sessions(user_id);
