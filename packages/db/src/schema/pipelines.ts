import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const PIPELINE_STATUSES = ['active', 'deleted'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Pipelines (sales process containers; hold ordered stages).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy: no
 * `tenant_id` column.
 *
 * Soft-delete via `status` + `deleted_at`/`deleted_by`, mirroring accounts
 * and persons. Cascade: a pipeline cannot be soft-deleted while it has any
 * active stages or active deals; the repo enforces this with a single
 * conditional UPDATE (`NOT EXISTS (... active children ...)`).
 *
 * `is_default`: at most one active pipeline may have `is_default = 1`. Enforced
 * by the `idx_pipelines_default_unique` partial unique index.
 *
 * PII per ADR-007: `name` and `description` are organisational/process
 * metadata (same posture as `accounts.industry`) — NOT marked `pii()`. If a
 * tenant chooses to put personal data in a pipeline name, that's a misuse;
 * the schema does not assume it.
 */
export const pipelines = sqliteTable(
  'pipelines',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: integer('is_default').notNull().default(0),
    status: text('status').notNull().$type<PipelineStatus>(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    statusIdx: index('idx_pipelines_status').on(t.status),
    createdAtIdx: index('idx_pipelines_created_at').on(t.createdAt, t.id),
    defaultUnique: uniqueIndex('idx_pipelines_default_unique')
      .on(t.isDefault)
      .where(sql`is_default = 1 AND status = 'active'`),
    statusCheck: check(
      'pipelines_status_check',
      sql.raw(`status IN (${inList(PIPELINE_STATUSES)})`),
    ),
    isDefaultCheck: check(
      'pipelines_is_default_check',
      sql`is_default IN (0, 1)`,
    ),
  }),
);

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;

export const ALLOWED_PATCH_FIELDS = [
  'name',
  'description',
  'isDefault',
] as const;
export type PipelinePatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is PipelinePatchableField {
  return ALLOWED_PATCH_FIELD_SET.has(name);
}

export const IMMUTABLE_PATCH_FIELDS = [
  'id',
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
 * NULL; `isDefault` defaults to 0 — to clear the default flag, send `0`,
 * not `null`.
 */
export const NULLABLE_PATCH_FIELDS = new Set<PipelinePatchableField>([
  'description',
]);
