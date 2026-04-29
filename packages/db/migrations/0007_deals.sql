CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
  stage_id TEXT NOT NULL REFERENCES stages(id),
  stage_entered_at TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id),
  primary_person_id TEXT REFERENCES persons(id),
  amount REAL,
  currency TEXT,
  expected_close_date TEXT,
  probability REAL,
  owner_user_id TEXT,
  lost_reason TEXT,
  status TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT deals_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT deals_amount_check CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT deals_currency_check CHECK (currency IS NULL OR LENGTH(currency) = 3),
  CONSTRAINT deals_probability_check CHECK (
    probability IS NULL OR (probability >= 0 AND probability <= 100)
  ),
  CONSTRAINT deals_expected_close_date_check CHECK (
    expected_close_date IS NULL
    OR expected_close_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  )
);

CREATE INDEX idx_deals_status_created ON deals(status, created_at, id);
CREATE INDEX idx_deals_pipeline_stage_status ON deals(pipeline_id, stage_id, status);
CREATE INDEX idx_deals_account_id ON deals(account_id);
CREATE INDEX idx_deals_primary_person_id ON deals(primary_person_id);
CREATE INDEX idx_deals_owner_user_id ON deals(owner_user_id);
