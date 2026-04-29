CREATE TABLE stages (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  terminal_kind TEXT,
  probability REAL,
  status TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT stages_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT stages_terminal_kind_check CHECK (
    terminal_kind IS NULL OR terminal_kind IN ('won', 'lost')
  ),
  CONSTRAINT stages_position_check CHECK (position >= 0),
  CONSTRAINT stages_probability_check CHECK (
    probability IS NULL OR (probability >= 0 AND probability <= 100)
  )
);

CREATE INDEX idx_stages_pipeline_status_position ON stages(pipeline_id, status, position);
CREATE INDEX idx_stages_pipeline_terminal ON stages(pipeline_id, terminal_kind);

-- Position is unique among active siblings within a pipeline.
CREATE UNIQUE INDEX idx_stages_position_unique
  ON stages(pipeline_id, position)
  WHERE status = 'active';
