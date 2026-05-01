CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL,
  last_login_at TEXT,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  CONSTRAINT users_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'member', 'readonly'))
);

CREATE UNIQUE INDEX idx_users_email_active_unique ON users(email) WHERE status = 'active';
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at, id);
