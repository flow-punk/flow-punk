-- Better-auth tables (ADR-021 §3) for the tenant D1.
--
-- These four tables match the shape better-auth's drizzle-adapter expects
-- exactly. The bidirectional FK to the domain `users` table is split
-- across two columns:
--   - `auth_user.domain_user_id` → references `users.id`
--   - `users.auth_user_id`       → references `auth_user.id` (added below)
-- Both columns are nullable for first-time backfill + the brief window
-- inside the sign-up transaction. The unique index on each side prevents
-- duplicate links.

CREATE TABLE auth_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  domain_user_id TEXT
);

CREATE UNIQUE INDEX idx_auth_user_email_unique ON auth_user(email);
CREATE UNIQUE INDEX idx_auth_user_domain_user_id_unique
  ON auth_user(domain_user_id)
  WHERE domain_user_id IS NOT NULL;

CREATE TABLE auth_session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_auth_session_token_unique ON auth_session(token);
CREATE INDEX idx_auth_session_user_id ON auth_session(user_id);

CREATE TABLE auth_account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_auth_account_user_id ON auth_account(user_id);
CREATE INDEX idx_auth_account_provider ON auth_account(provider_id, account_id);

CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_auth_verification_identifier ON auth_verification(identifier);

-- Reverse half of the bidirectional FK from the domain users table.
ALTER TABLE users ADD COLUMN auth_user_id TEXT;
CREATE UNIQUE INDEX idx_users_auth_user_id_unique
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
