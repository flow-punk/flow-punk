CREATE TABLE persons (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email_primary TEXT,
  phone1_country_code TEXT,
  phone1_number TEXT,
  phone1_ext TEXT,
  phone1_type TEXT,
  title TEXT,
  street_line_1 TEXT,
  street_line_2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  latitude REAL,
  longitude REAL,
  image_avatar TEXT,
  consent_email TEXT NOT NULL DEFAULT 'no_consent',
  status TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT persons_status_check CHECK (status IN ('active', 'deleted')),
  CONSTRAINT persons_phone1_type_check CHECK (
    phone1_type IS NULL
    OR phone1_type IN ('mobile', 'landline', 'voip', 'fax', 'other')
  ),
  CONSTRAINT persons_consent_email_check CHECK (
    consent_email IN ('subscribed', 'unsubscribed', 'no_consent')
  )
);

CREATE INDEX idx_persons_status ON persons(status);
CREATE INDEX idx_persons_account_id ON persons(account_id);
CREATE INDEX idx_persons_email_primary ON persons(email_primary);
CREATE INDEX idx_persons_consent_email ON persons(consent_email);
CREATE INDEX idx_persons_created_at ON persons(created_at, id);
