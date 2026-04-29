import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';

const USER_STATUSES = ['active', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Indie platform users (single bound D1).
 *
 * Indie is multi-user (multiple humans share one deployment) but
 * single-tenant per ADR-011 §Tenancy. Indie additionally enforces
 * **exactly one active admin** per deploy (handler-layer invariant in
 * `indie/services/users/`): per ADR-012's admin-auth posture, only the
 * admin user can mint API keys, and indie's "1 key per user" cap means
 * "1 key per indie deploy."
 *
 * The first admin row is bootstrapped via `wrangler d1 execute` —
 * operator-local, no HTTP path. `createdBy` / `updatedBy` are nullable so
 * the bootstrap row (which has no actor to attribute) can be inserted.
 * Every subsequent row must carry an attributed actor.
 *
 * Soft-delete via `status` + `deletedAt` / `deletedBy`, mirroring persons
 * and accounts. Authorization predicates (`requireAdmin` in users +
 * tenants services, session/OAuth validation) require both `isAdmin = true`
 * AND `status = 'active'` — a deleted admin must not authorize anything.
 *
 * Email uniqueness is enforced by a partial unique index scoped to
 * `status = 'active'`: a deleted user's email can be re-onboarded. The DB
 * constraint is authoritative; repos pre-check via `findByEmail` only for
 * a clean error message and rely on the unique-violation catch as the
 * race-safe path.
 *
 * PII per ADR-007: `email`, `displayName`, `firstName`, `lastName` are
 * marked via `pii()`. `lastLoginAt` is a timestamp (non-PII), `isAdmin` /
 * `status` / audit columns are non-PII.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: pii(text('email').notNull()),
    displayName: pii(text('display_name').notNull()),
    firstName: pii(text('first_name')),
    lastName: pii(text('last_name')),
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().$type<UserStatus>(),
    lastLoginAt: text('last_login_at'),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by'),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by'),
  },
  (t) => ({
    emailActiveUnique: uniqueIndex('idx_users_email_active_unique')
      .on(t.email)
      .where(sql`status = 'active'`),
    statusIdx: index('idx_users_status').on(t.status),
    isAdminIdx: index('idx_users_is_admin').on(t.isAdmin),
    createdAtIdx: index('idx_users_created_at').on(t.createdAt, t.id),
    statusCheck: check(
      'users_status_check',
      sql.raw(`status IN (${inList(USER_STATUSES)})`),
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Whitelist of column names patchable via PATCH /api/v1/users/:id.
 *
 * Audit `users.updated.detail.fieldsChanged` is built by intersecting
 * this set with actually-updated columns — never derived from raw request
 * body keys.
 */
export const ALLOWED_PATCH_FIELDS = [
  'email',
  'displayName',
  'firstName',
  'lastName',
  'isAdmin',
] as const;
export type UserPatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is UserPatchableField {
  return ALLOWED_PATCH_FIELD_SET.has(name);
}

/**
 * Fields a non-admin actor (self-PATCH) is allowed to change. Email is
 * an identifier and is admin-only — self email change requires a
 * verification flow, which is out of scope for this iteration.
 */
export const SELF_ALLOWED_PATCH_FIELDS = new Set<UserPatchableField>([
  'displayName',
  'firstName',
  'lastName',
]);
export function isSelfPatchField(name: string): name is UserPatchableField {
  return (
    isAllowedPatchField(name) &&
    SELF_ALLOWED_PATCH_FIELDS.has(name as UserPatchableField)
  );
}

/** Fields that PATCH must reject if present in the body (immutable). */
export const IMMUTABLE_PATCH_FIELDS = [
  'id',
  'createdAt',
  'createdBy',
  'status',
  'deletedAt',
  'deletedBy',
  'lastLoginAt',
] as const;

const IMMUTABLE_PATCH_FIELD_SET = new Set<string>(IMMUTABLE_PATCH_FIELDS);
export function isImmutablePatchField(name: string): boolean {
  return IMMUTABLE_PATCH_FIELD_SET.has(name);
}

/**
 * Fields that may be cleared via explicit `null` in PATCH. `email` and
 * `displayName` are NOT NULL in the schema; `isAdmin` is a non-null
 * boolean. Only the optional name fields are nullable.
 */
export const NULLABLE_PATCH_FIELDS = new Set<UserPatchableField>([
  'firstName',
  'lastName',
]);

export const USER_STATUS_VALUES: readonly UserStatus[] = USER_STATUSES;
