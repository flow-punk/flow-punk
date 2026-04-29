CREATE TABLE pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT pipelines_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT pipelines_is_default_check CHECK (is_default IN (0, 1))
);

CREATE INDEX idx_pipelines_status ON pipelines(status);
CREATE INDEX idx_pipelines_created_at ON pipelines(created_at, id);

-- At most one default pipeline among active rows.
CREATE UNIQUE INDEX idx_pipelines_default_unique
  ON pipelines(is_default)
  WHERE is_default = 1 AND status = 'active';
