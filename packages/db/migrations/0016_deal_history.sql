CREATE TABLE deal_history (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  changes TEXT,
  actor_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT deal_history_kind_check CHECK (
    kind IN (
      'created',
      'updated',
      'stage_moved',
      'soft_deleted',
      'contact_added',
      'contact_removed'
    )
  ),
  CONSTRAINT deal_history_credential_type_check CHECK (
    credential_type IN ('apikey', 'oauth', 'session', 'system')
  )
);

CREATE INDEX idx_deal_history_deal_id_created_id
  ON deal_history(deal_id, created_at, id);
