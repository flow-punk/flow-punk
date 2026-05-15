import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';

/**
 * deal_history — append-only per-tenant timeline of deal mutations (ADR-022).
 *
 * One row per successful API mutation against a deal. The repo co-emits a
 * history row inside the same `db.batch()` as the mutation, using an
 * `INSERT ... SELECT ... WHERE EXISTS (<post-state witness>)` whose
 * predicate mirrors the mutation's predicate. If the mutation no-ops the
 * history insert no-ops too (predicate matches zero source rows) — no
 * orphan history rows.
 *
 * `kind` is six values: `created | updated | stage_moved | soft_deleted |
 * contact_added | contact_removed`. v1 emits the first four; `contact_*` are
 * reserved in the enum and CHECK constraint so the schema is forward-stable
 * when `deal_contacts` ships (see pipeline.md §"Endpoints — deal history").
 *
 * `changes` is a JSON-stringified payload whose shape depends on `kind`
 * (see ADR-022 §4). The column is `pii()`-marked so the structured logger
 * redactor treats the blob as sensitive — but only if no code path parses
 * `changes` and logs the parsed object. The redaction-coverage test asserts
 * coverage; see `serializeChanges` for the single point at which payloads
 * are produced.
 *
 * `actorId` / `credentialType` follow the canonical `audit-events`
 * vocabulary (`indie/packages/service-utils/src/audit.ts`); credential types
 * stay in sync with that union. Indie's `_system` writes land as
 * `actor_id='_system'`, `credential_type='system'`.
 *
 * No SQLite FK on `dealId` per ADR-022 §11 — history must survive a
 * hypothetical future hard-delete of the deal row. Application-level guards
 * keep referential integrity.
 *
 * Single composite index `(deal_id, created_at, id)` covers the only two
 * stated access patterns: list by deal (cursor `(created_at DESC, id DESC)`
 * tie-break) and single-row read by PK.
 */

const DEAL_HISTORY_KINDS = [
  'created',
  'updated',
  'stage_moved',
  'soft_deleted',
  'contact_added',
  'contact_removed',
] as const;
export type DealHistoryKind = (typeof DEAL_HISTORY_KINDS)[number];

const DEAL_HISTORY_CREDENTIAL_TYPES = [
  'apikey',
  'oauth',
  'session',
  'system',
] as const;
export type DealHistoryCredentialType =
  (typeof DEAL_HISTORY_CREDENTIAL_TYPES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

export const dealHistory = sqliteTable(
  'deal_history',
  {
    id: text('id').primaryKey(),
    dealId: text('deal_id').notNull(),
    kind: text('kind').notNull().$type<DealHistoryKind>(),
    changes: pii(text('changes')),
    actorId: text('actor_id').notNull(),
    credentialType: text('credential_type')
      .notNull()
      .$type<DealHistoryCredentialType>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    dealIdCreatedIdx: index('idx_deal_history_deal_id_created_id').on(
      t.dealId,
      t.createdAt,
      t.id,
    ),
    kindCheck: check(
      'deal_history_kind_check',
      sql.raw(`kind IN (${inList(DEAL_HISTORY_KINDS)})`),
    ),
    credentialTypeCheck: check(
      'deal_history_credential_type_check',
      sql.raw(
        `credential_type IN (${inList(DEAL_HISTORY_CREDENTIAL_TYPES)})`,
      ),
    ),
  }),
);

export type DealHistoryRow = typeof dealHistory.$inferSelect;
export type NewDealHistoryRow = typeof dealHistory.$inferInsert;

/**
 * Single `{field, from, to}` entry inside a `created` / `updated` /
 * `stage_moved.changes` payload. Field names are the API/Drizzle camelCase
 * names from `deals.ts` (e.g. `'amount'`, `'primaryPersonId'`).
 */
export interface DealHistoryChangeEntry {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Stable field order used when serializing the `created` history payload.
 * Pin-ordered so JSON output is deterministic and tests can assert exact
 * byte-shape. Mirrors the schema column order in `deals.ts` for fields that
 * a freshly-created deal may carry; system-managed columns
 * (`status`, `deletedAt`, `deletedBy`, `createdAt`, `createdBy`,
 * `updatedAt`, `updatedBy`) are NOT history payload — they're row metadata.
 */
export const DEAL_HISTORY_CREATED_FIELD_ORDER = [
  'name',
  'pipelineId',
  'stageId',
  'stageEnteredAt',
  'accountId',
  'primaryPersonId',
  'amount',
  'currency',
  'expectedCloseDate',
  'probability',
  'ownerUserId',
  'lostReason',
] as const;
export type DealHistoryCreatedField =
  (typeof DEAL_HISTORY_CREATED_FIELD_ORDER)[number];
