CREATE TABLE deal_contacts (
  deal_id TEXT NOT NULL REFERENCES deals(id),
  person_id TEXT NOT NULL REFERENCES persons(id),
  role TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (deal_id, person_id),
  CONSTRAINT deal_contacts_role_check CHECK (
    role IS NULL
    OR role IN ('decision_maker', 'champion', 'billing', 'technical', 'other')
  )
);

CREATE INDEX idx_deal_contacts_deal_id ON deal_contacts(deal_id);
CREATE INDEX idx_deal_contacts_person_id ON deal_contacts(person_id);
