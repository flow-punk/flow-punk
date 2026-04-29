import { sql } from 'drizzle-orm';
import { check, index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';

const DEAL_STATUSES = ['active', 'deleted'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Deals (opportunities flowing through a pipeline).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy.
 *
 * Relationships:
 * - `pipeline_id` is immutable on PATCH (a deal cannot move between pipelines;
 *   close it and create a new one in the destination).
 * - `stage_id` is patchable and must reference a stage in the same pipeline,
 *   with `status = 'active'`. Repo enforces this with a single conditional
 *   UPDATE that includes `EXISTS (... stage active and same pipeline ...)`.
 *   When `stage_id` actually changes, `stage_entered_at` is reset server-side
 *   to "now".
 * - `account_id` and `primary_person_id` reference soft-deletable parents;
 *   the SQLite FKs are the floor, the repo additionally pre-checks active
 *   status before insert/update. This carries the same TOCTOU window
 *   documented in `repositories/persons.ts` (account-link discipline).
 *
 * Won/Lost is derived from `stages.terminal_kind` of the deal's current
 * stage — there is no deal-level won/lost flag.
 *
 * `owner_user_id` is intentionally not a SQLite FK (matches the existing
 * `accounts → persons.account_id` posture: cross-table FKs are reserved
 * for entities the repo can pre-check uniformly; users live in a
 * different concern).
 *
 * PII per ADR-007:
 * - `name` is `pii()`: deal names frequently include person/customer names
 *   (e.g. "Acme — John Smith renewal").
 * - `lost_reason` is `pii()`: free-form text may include customer context.
 * - `pipeline_id`, `stage_id`, `amount`, `currency`, `expected_close_date`,
 *   `probability`, `owner_user_id`, `account_id`, `primary_person_id` are
 *   not personal data themselves (they reference entities or hold business
 *   metadata); not marked.
 */
export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    name: pii(text('name').notNull()),
    pipelineId: text('pipeline_id').notNull(),
    stageId: text('stage_id').notNull(),
    stageEnteredAt: text('stage_entered_at').notNull(),
    accountId: text('account_id'),
    primaryPersonId: text('primary_person_id'),
    amount: real('amount'),
    currency: text('currency'),
    expectedCloseDate: text('expected_close_date'),
    probability: real('probability'),
    ownerUserId: text('owner_user_id'),
    lostReason: pii(text('lost_reason')),
    status: text('status').notNull().$type<DealStatus>(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    statusCreatedIdx: index('idx_deals_status_created').on(
      t.status,
      t.createdAt,
      t.id,
    ),
    pipelineStageStatusIdx: index('idx_deals_pipeline_stage_status').on(
      t.pipelineId,
      t.stageId,
      t.status,
    ),
    accountIdIdx: index('idx_deals_account_id').on(t.accountId),
    primaryPersonIdIdx: index('idx_deals_primary_person_id').on(
      t.primaryPersonId,
    ),
    ownerUserIdIdx: index('idx_deals_owner_user_id').on(t.ownerUserId),
    statusCheck: check(
      'deals_status_check',
      sql.raw(`status IN (${inList(DEAL_STATUSES)})`),
    ),
    amountCheck: check(
      'deals_amount_check',
      sql`amount IS NULL OR amount >= 0`,
    ),
    currencyCheck: check(
      'deals_currency_check',
      sql`currency IS NULL OR LENGTH(currency) = 3`,
    ),
    probabilityCheck: check(
      'deals_probability_check',
      sql`probability IS NULL OR (probability >= 0 AND probability <= 100)`,
    ),
    expectedCloseDateCheck: check(
      'deals_expected_close_date_check',
      sql`expected_close_date IS NULL OR expected_close_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  }),
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;

/**
 * Whitelist of column names patchable via PATCH /api/v1/deals/:id.
 *
 * `stageId` is patchable: this is how a deal advances through the pipeline.
 * The repo handles the atomic transition (target-stage validation +
 * `stage_entered_at` reset).
 *
 * `pipelineId` is intentionally NOT patchable — see IMMUTABLE_PATCH_FIELDS.
 */
export const ALLOWED_PATCH_FIELDS = [
  'name',
  'stageId',
  'accountId',
  'primaryPersonId',
  'amount',
  'currency',
  'expectedCloseDate',
  'probability',
  'ownerUserId',
  'lostReason',
] as const;
export type DealPatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is DealPatchableField {
  return ALLOWED_PATCH_FIELD_SET.has(name);
}

export const IMMUTABLE_PATCH_FIELDS = [
  'id',
  'pipelineId',
  'stageEnteredAt',
  'createdAt',
  'createdBy',
  'status',
  'deletedAt',
  'deletedBy',
] as const;

const IMMUTABLE_PATCH_FIELD_SET = new Set<string>(IMMUTABLE_PATCH_FIELDS);
export function isImmutablePatchField(name: string): boolean {
  return IMMUTABLE_PATCH_FIELD_SET.has(name);
}

/**
 * Fields that may be cleared via explicit `null` in PATCH. `name` is NOT
 * NULL; `stageId` is NOT NULL (clearing it would orphan the deal — close
 * it via DELETE instead).
 */
export const NULLABLE_PATCH_FIELDS = new Set<DealPatchableField>([
  'accountId',
  'primaryPersonId',
  'amount',
  'currency',
  'expectedCloseDate',
  'probability',
  'ownerUserId',
  'lostReason',
]);
