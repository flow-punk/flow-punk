import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { pii } from "../utils/pii.js";

const DEAL_HISTORY_KINDS = [
  "created",
  "updated",
  "stage_moved",
  "soft_deleted",
  "contact_added",
  "contact_removed",
] as const;
export type DealHistoryKind = (typeof DEAL_HISTORY_KINDS)[number];

const CREDENTIAL_TYPES = ["apikey", "oauth", "session", "system"] as const;
export type DealHistoryCredentialType = (typeof CREDENTIAL_TYPES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(", ");

/**
 * Append-only per-tenant timeline of deal + deal_contact mutations.
 *
 * Architecture: see ADR-022. Key invariants:
 * - One row per successful API mutation (not per field). PATCH that changes
 *   N fields writes ONE row with an N-entry `changes` payload.
 * - Stage transitions emit `kind = 'stage_moved'` with typed payload
 *   `{from_stage_id, to_stage_id, changes: [...]}` carrying any non-stage
 *   diffs from the same PATCH.
 * - Writes are emitted from the deals/deal-contacts repos inside the same
 *   `db.batch()` as the mutation, with a predicate-mirrored
 *   `INSERT ... SELECT ... WHERE EXISTS (...)` so a 0-affected mutation
 *   does NOT land an orphaned history row.
 * - No SQLite FK to `deals.id` — history must survive soft-delete (and any
 *   future hard-delete) of its deal.
 *
 * PII per ADR-007:
 * - `changes` is `pii()`: payloads may contain `name` and `lost_reason`
 *   values from the deals row. Logger redaction treats the whole column
 *   as opaque; no code path may parse `changes` and log the parsed object.
 * - `actor_id`, `credential_type` are non-PII.
 *
 * Retention: forever in v1. Per-row redaction surface is intentionally not
 * shipped; per-tenant data deletion (drop the tenant D1) is the existing
 * erasure path. See ADR-022 §10.
 */
export const dealHistory = sqliteTable(
  "deal_history",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id").notNull(),
    kind: text("kind").notNull().$type<DealHistoryKind>(),
    changes: pii(text("changes")),
    actorId: text("actor_id").notNull(),
    credentialType: text("credential_type")
      .notNull()
      .$type<DealHistoryCredentialType>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    dealIdCreatedIdx: index("idx_deal_history_deal_id_created_id").on(
      t.dealId,
      t.createdAt,
      t.id,
    ),
    kindCheck: check(
      "deal_history_kind_check",
      sql.raw(`kind IN (${inList(DEAL_HISTORY_KINDS)})`),
    ),
    credentialTypeCheck: check(
      "deal_history_credential_type_check",
      sql.raw(`credential_type IN (${inList(CREDENTIAL_TYPES)})`),
    ),
  }),
);

export type DealHistoryRow = typeof dealHistory.$inferSelect;
export type NewDealHistoryRow = typeof dealHistory.$inferInsert;

export {
  DEAL_HISTORY_KINDS,
  CREDENTIAL_TYPES as DEAL_HISTORY_CREDENTIAL_TYPES,
};
