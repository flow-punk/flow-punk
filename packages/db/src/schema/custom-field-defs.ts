import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const BASE_MODELS = ["person", "account", "deal"] as const;
export type CustomFieldBaseModel = (typeof BASE_MODELS)[number];

const FILTERABLE_STATUSES = [
  "disabled",
  "pending",
  "ready",
  "failed",
  "dropping",
] as const;
export type CustomFieldFilterableStatus = (typeof FILTERABLE_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(", ");

/**
 * Tenant-defined custom fields on built-in entities (persons / accounts /
 * deals). See ADR-023 for the architectural framework.
 *
 * Values are NOT stored here — they live inline on the entity row in the
 * `custom_data` JSON column. This table is the metadata catalog: what
 * fields exist, what their lifecycle state is, who they belong to.
 *
 * Key invariants:
 * - `base_model` discriminates the owning entity table. v1 is enum-bound.
 * - `name` is a slug used verbatim as both a JSON path (`$.<name>`) and a
 *   SQLite index name (`idx_<table>_cf_<name>`). The slug regex
 *   `^[a-z][a-z0-9_]{0,30}$` is enforced at the repo layer, not the
 *   schema layer.
 * - `filterable_status` drives the async DDL workflow (PR-β). v1 of this
 *   schema persists the column but the DDL transition is stubbed —
 *   handlers expose `disabled` only.
 * - `version` is bumped on every UPDATE in the repo. PATCH requests pass
 *   the expected version via `If-Match: <version>` and get `409 CONFLICT`
 *   on mismatch (optimistic LWW; ADR-023 §7).
 * - Archive is a tombstone (`archived_at` set) — rows are NOT
 *   hard-deleted. Active uniqueness on `(base_model, name)` is enforced
 *   by the partial unique index `cfd_active_name_uq` (archived names are
 *   reusable).
 *
 * PII per ADR-007: no column on this table carries PII. `name` and
 * `description` are operator-authored metadata; tenant data (the values)
 * lives on the entity rows under `custom_data` which IS marked `pii()`.
 */
export const customFieldDefs = sqliteTable(
  "custom_field_defs",
  {
    id: text("id").primaryKey(),
    baseModel: text("base_model").notNull().$type<CustomFieldBaseModel>(),
    name: text("name").notNull(),
    description: text("description"),
    pii: integer("pii").notNull().default(1),
    filterableStatus: text("filterable_status")
      .notNull()
      .default("disabled")
      .$type<CustomFieldFilterableStatus>(),
    filterableError: text("filterable_error"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    archivedAt: text("archived_at"),
  },
  (t) => ({
    activeNameUq: uniqueIndex("cfd_active_name_uq")
      .on(t.baseModel, t.name)
      .where(sql`archived_at IS NULL`),
    byModelIdx: index("idx_cfd_by_model")
      .on(t.baseModel)
      .where(sql`archived_at IS NULL`),
    baseModelCheck: check(
      "custom_field_defs_base_model_check",
      sql.raw(`base_model IN (${inList(BASE_MODELS)})`),
    ),
    filterableStatusCheck: check(
      "custom_field_defs_filterable_status_check",
      sql.raw(`filterable_status IN (${inList(FILTERABLE_STATUSES)})`),
    ),
    piiCheck: check("custom_field_defs_pii_check", sql.raw(`pii IN (0, 1)`)),
  }),
);

export type CustomFieldDef = typeof customFieldDefs.$inferSelect;
export type NewCustomFieldDef = typeof customFieldDefs.$inferInsert;

export const CUSTOM_FIELD_BASE_MODELS: readonly CustomFieldBaseModel[] =
  BASE_MODELS;
export const CUSTOM_FIELD_FILTERABLE_STATUSES: readonly CustomFieldFilterableStatus[] =
  FILTERABLE_STATUSES;

/**
 * Slug regex for `custom_field_defs.name`. The slug is used unquoted as a
 * JSON path component (`$.<name>`) and as part of a SQLite index name
 * (`idx_<table>_cf_<name>`), so it must be conservative.
 */
export const CUSTOM_FIELD_NAME_REGEX = /^[a-z][a-z0-9_]{0,30}$/;

/** Per ADR-023 §9 caps. */
export const CUSTOM_FIELD_CAPS = {
  maxDefsPerBaseModel: 50,
  maxFilterablePerBaseModel: 10,
  maxValueChars: 1024,
} as const;

/** Permitted lifecycle transitions for `filterable_status`. */
export const FILTERABLE_TRANSITIONS: Readonly<
  Record<CustomFieldFilterableStatus, readonly CustomFieldFilterableStatus[]>
> = {
  disabled: ["pending"],
  pending: ["ready", "failed"],
  ready: ["dropping"],
  failed: ["disabled", "pending"],
  dropping: ["disabled"],
};

export function isAllowedFilterableTransition(
  from: CustomFieldFilterableStatus,
  to: CustomFieldFilterableStatus,
): boolean {
  return FILTERABLE_TRANSITIONS[from].includes(to);
}
