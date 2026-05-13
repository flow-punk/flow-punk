-- Custom-field registry and per-entity JSON storage. See ADR-023.
--
-- Registry: tenant-defined fields on built-in entities (persons / accounts /
-- deals). Values are stored inline on the entity row in the `custom_data`
-- column added below. Filterability is an indexed lookup via
-- `json_extract(custom_data, '$.<name>')`; the matching `CREATE INDEX`
-- statements are NOT in this migration — they're issued dynamically by the
-- async DDL workflow when a tenant operator marks a def `filterable: true`
-- (PR-β). v1 is text-only; the registry has no `type` column.

CREATE TABLE custom_field_defs (
  id                TEXT    PRIMARY KEY,            -- cfd_<21>
  base_model        TEXT    NOT NULL,               -- 'person' | 'account' | 'deal'
  name              TEXT    NOT NULL,               -- slug; ^[a-z][a-z0-9_]{0,30}$
  description       TEXT,
  pii               INTEGER NOT NULL DEFAULT 1,     -- default-PII per ADR-001:188
  filterable_status TEXT    NOT NULL DEFAULT 'disabled',
                                                    -- 'disabled' | 'pending' | 'ready' | 'failed' | 'dropping'
  filterable_error  TEXT,                           -- populated on 'failed'
  version           INTEGER NOT NULL DEFAULT 1,     -- bumped on every UPDATE; gates If-Match
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  created_by        TEXT    NOT NULL,
  updated_by        TEXT    NOT NULL,
  archived_at       TEXT,                           -- soft archive (tombstone)
  CONSTRAINT custom_field_defs_base_model_check
    CHECK (base_model IN ('person', 'account', 'deal')),
  CONSTRAINT custom_field_defs_filterable_status_check
    CHECK (filterable_status IN ('disabled', 'pending', 'ready', 'failed', 'dropping')),
  CONSTRAINT custom_field_defs_pii_check
    CHECK (pii IN (0, 1))
);

-- Active-only name uniqueness: archived names are reusable. See ADR-023 §4.
CREATE UNIQUE INDEX cfd_active_name_uq
  ON custom_field_defs(base_model, name)
  WHERE archived_at IS NULL;

CREATE INDEX idx_cfd_by_model
  ON custom_field_defs(base_model)
  WHERE archived_at IS NULL;

-- Per-entity JSON storage. `NULL` is semantically equivalent to `{}`; the
-- CHECK ensures any non-NULL value is well-formed JSON so a single bad row
-- cannot poison subsequent filter queries. See ADR-023 §2.
ALTER TABLE persons  ADD COLUMN custom_data TEXT
  CHECK (custom_data IS NULL OR json_valid(custom_data));
ALTER TABLE accounts ADD COLUMN custom_data TEXT
  CHECK (custom_data IS NULL OR json_valid(custom_data));
ALTER TABLE deals    ADD COLUMN custom_data TEXT
  CHECK (custom_data IS NULL OR json_valid(custom_data));
