export * from './users.js';
export * from './mcp-sessions.js';

// Per-table modules each export their own `ALLOWED_PATCH_FIELDS`,
// `IMMUTABLE_PATCH_FIELDS`, `NULLABLE_PATCH_FIELDS`, etc. — names collide
// across tables. Re-export only the table object and its row/status types
// at the package root; consumers that need patch-field metadata import
// from the matching schema file (which is what the matching repo file
// already does).
export {
  accounts,
  type Account,
  type AccountStatus,
  type AccountPatchableField,
  type NewAccount,
} from './accounts.js';
export {
  persons,
  type Person,
  type PersonStatus,
  type PersonPatchableField,
  type Phone1Type,
  type EmailConsent,
  type NewPerson,
} from './persons.js';
