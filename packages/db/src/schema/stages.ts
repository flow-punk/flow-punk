import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const STAGE_STATUSES = ['active', 'deleted'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

const TERMINAL_KINDS = ['won', 'lost'] as const;
export type StageTerminalKind = (typeof TERMINAL_KINDS)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Stages (steps within a pipeline).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy.
 *
 * `pipeline_id` is the parent FK; the SQLite FK is the floor. The repo
 * pre-checks `pipelines.status = 'active'` before insert. `pipeline_id`
 * is immutable on PATCH — to "move" a stage to another pipeline, create
 * a new stage and soft-delete the old.
 *
 * `position` orders active siblings within a pipeline; uniqueness among
 * active rows is enforced by `idx_stages_position_unique` (partial unique).
 * Soft-deleted rows do not occupy a position slot.
 *
 * `terminal_kind`: when set to 'won' or 'lost', a stage is a terminal
 * outcome. Deal "won/lost-ness" is derived from its current stage's
 * terminal_kind (no separate field on the deal).
 *
 * PII per ADR-007: `name` is process metadata, NOT marked `pii()`.
 */
export const stages = sqliteTable(
  'stages',
  {
    id: text('id').primaryKey(),
    pipelineId: text('pipeline_id').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    terminalKind: text('terminal_kind').$type<StageTerminalKind>(),
    probability: real('probability'),
    status: text('status').notNull().$type<StageStatus>(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    pipelineStatusPositionIdx: index('idx_stages_pipeline_status_position').on(
      t.pipelineId,
      t.status,
      t.position,
    ),
    pipelineTerminalIdx: index('idx_stages_pipeline_terminal').on(
      t.pipelineId,
      t.terminalKind,
    ),
    positionUnique: uniqueIndex('idx_stages_position_unique')
      .on(t.pipelineId, t.position)
      .where(sql`status = 'active'`),
    statusCheck: check(
      'stages_status_check',
      sql.raw(`status IN (${inList(STAGE_STATUSES)})`),
    ),
    terminalKindCheck: check(
      'stages_terminal_kind_check',
      sql.raw(
        `terminal_kind IS NULL OR terminal_kind IN (${inList(TERMINAL_KINDS)})`,
      ),
    ),
    positionCheck: check('stages_position_check', sql`position >= 0`),
    probabilityCheck: check(
      'stages_probability_check',
      sql`probability IS NULL OR (probability >= 0 AND probability <= 100)`,
    ),
  }),
);

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;

export const ALLOWED_PATCH_FIELDS = [
  'name',
  'position',
  'terminalKind',
  'probability',
] as const;
export type StagePatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is StagePatchableField {
  return ALLOWED_PATCH_FIELD_SET.has(name);
}

export const IMMUTABLE_PATCH_FIELDS = [
  'id',
  'pipelineId',
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

export const NULLABLE_PATCH_FIELDS = new Set<StagePatchableField>([
  'terminalKind',
  'probability',
]);

export const TERMINAL_KIND_VALUES: readonly StageTerminalKind[] = TERMINAL_KINDS;
