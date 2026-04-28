CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  industry TEXT,
  street_line_1 TEXT,
  street_line_2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  latitude REAL,
  longitude REAL,
  phone1_country_code TEXT,
  phone1_number TEXT,
  phone1_ext TEXT,
  phone2_country_code TEXT,
  phone2_number TEXT,
  phone2_ext TEXT,
  image_logo TEXT,
  status TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT accounts_status_check CHECK (status IN ('active', 'deleted'))
);

CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_domain ON accounts(domain);
CREATE INDEX idx_accounts_created_at ON accounts(created_at, id);
