import { sql } from 'drizzle-orm';
import {
  check,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';
import { ROLE_VALUES, type Role } from '../utils/roles.js';

const USER_STATUSES = ['active', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Tenant users (per-tenant D1 on managed; the single bound D1 on indie).
 *
 * Per SYSTEM.md §"Domain Model" (`User: member of a tenant with a role`)
 * and ADR-001:19 (tenant-scoped tables drop `tenant_id` — isolation is
 * physical), this table carries no `tenant_id` column. The tenant is the
 * D1 the row lives in.
 *
 * Roles (`owner` | `admin` | `member` | `readonly`) replace the legacy
 * `is_admin` boolean. See `utils/roles.ts` for `ROLE_PRIVILEGES`. Indie
 * enforces `enforceSingleOwner: true` per ADR-011 §"Indie multi-user
 * foundation" — exactly one active `owner` per indie deploy. Managed
 * tenants permit multiple owners.
 *
 * The first row per tenant is bootstrapped by the provisioner (managed)
 * or by `wrangler d1 execute` (indie). `createdBy` / `updatedBy` are
 * nullable so the first-row insert (which has no actor to attribute) can
 * succeed; every subsequent row must carry an attributed actor.
 *
 * Soft-delete via `status` + `deletedAt` / `deletedBy`. Authorization
 * predicates require `status = 'active'` AND a sufficient role — a
 * deleted owner does not authorize anything.
 *
 * Email uniqueness is enforced by a partial unique index scoped to
 * `status = 'active'`: a deleted user's email can be re-onboarded. The DB
 * constraint is authoritative; repos pre-check via `findByEmail` only for
 * a clean error message and rely on the unique-violation catch as the
 * race-safe path.
 *
 * PII per ADR-007: `email`, `displayName`, `firstName`, `lastName` are
 * marked via `pii()`. `lastLoginAt` is a timestamp (non-PII), `role` /
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
    role: text('role').notNull().$type<Role>().default('member'),
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
    roleIdx: index('idx_users_role').on(t.role),
    createdAtIdx: index('idx_users_created_at').on(t.createdAt, t.id),
    statusCheck: check(
      'users_status_check',
      sql.raw(`status IN (${inList(USER_STATUSES)})`),
    ),
    roleCheck: check(
      'users_role_check',
      sql.raw(`role IN (${inList(ROLE_VALUES)})`),
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
  'role',
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
 * `displayName` are NOT NULL in the schema; `role` is non-null with a
 * default. Only the optional name fields are nullable.
 */
export const NULLABLE_PATCH_FIELDS = new Set<UserPatchableField>([
  'firstName',
  'lastName',
]);

export const USER_STATUS_VALUES: readonly UserStatus[] = USER_STATUSES;

// Re-export role helpers so callers `import { Role, ROLE_VALUES, ... }`
// from the schema module without reaching into utils.
export {
  ROLE_VALUES,
  type Role,
  type RolePrivileges,
  ROLE_PRIVILEGES,
  isRole,
  hasAdminRights,
  canManageUsers,
  canMintApiKeys,
  canManageTenantSettings,
  canRead,
  canWrite,
} from '../utils/roles.js';
