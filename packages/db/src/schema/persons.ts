import { sql } from 'drizzle-orm';
import { check, index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';

const PERSON_STATUSES = ['active', 'deleted'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

const PHONE1_TYPES = ['mobile', 'landline', 'voip', 'fax', 'other'] as const;
export type Phone1Type = (typeof PHONE1_TYPES)[number];

const EMAIL_CONSENTS = ['subscribed', 'unsubscribed', 'no_consent'] as const;
export type EmailConsent = (typeof EMAIL_CONSENTS)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Persons (humans, optionally linked to an account).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy: there is
 * no `tenant_id` column. Tenant identity propagates via gateway-stamped
 * `X-Tenant-Id` for audit/log context only.
 *
 * Soft-delete via `status` + `deleted_at`/`deleted_by`, mirroring accounts
 * and tenants. Active rows have `status = 'active'`; soft-deleted rows have
 * `status = 'deleted'` and the deletion audit columns populated.
 *
 * `accountId` is a nullable FK to `accounts.id`. Accounts use soft-delete,
 * so the FK never trips on delete; the repo enforces an active-status
 * pre-check on create/update to prevent dangling links to soft-deleted
 * accounts.
 *
 * PII per ADR-007: identity (`display_name`, `first_name`, `last_name`),
 * contact (`email_primary`, all phone fields), address fields, lat/long,
 * `image_avatar`, AND `consent_email` are marked via `pii()`. Consent
 * records are personal data per GDPR Art. 7. Non-PII: `country` (ISO
 * alpha-2), `title` (job title — same posture as `accounts.industry`),
 * `phone1_type` (category, not value), `status`, audit columns.
 */
export const persons = sqliteTable(
  'persons',
  {
    id: text('id').primaryKey(),
    // FK to accounts.id is declared at the SQL layer (see
    // 0004_persons.sql) — Drizzle's `references()` would create a circular
    // module init between persons.ts and accounts.ts. The constraint is
    // enforced by SQLite (`PRAGMA foreign_keys = ON`, ADR-001:233); the
    // repo additionally pre-checks active status before insert/update.
    accountId: text('account_id'),
    displayName: pii(text('display_name').notNull()),
    firstName: pii(text('first_name')),
    lastName: pii(text('last_name')),
    emailPrimary: pii(text('email_primary')),
    phone1CountryCode: pii(text('phone1_country_code')),
    phone1Number: pii(text('phone1_number')),
    phone1Ext: pii(text('phone1_ext')),
    phone1Type: text('phone1_type').$type<Phone1Type>(),
    title: text('title'),
    streetLine1: pii(text('street_line_1')),
    streetLine2: pii(text('street_line_2')),
    city: pii(text('city')),
    region: pii(text('region')),
    postalCode: pii(text('postal_code')),
    country: text('country'),
    latitude: pii(real('latitude')),
    longitude: pii(real('longitude')),
    imageAvatar: pii(text('image_avatar')),
    consentEmail: pii(
      text('consent_email').notNull().default('no_consent').$type<EmailConsent>(),
    ),
    status: text('status').notNull().$type<PersonStatus>(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    statusIdx: index('idx_persons_status').on(t.status),
    accountIdIdx: index('idx_persons_account_id').on(t.accountId),
    emailPrimaryIdx: index('idx_persons_email_primary').on(t.emailPrimary),
    consentEmailIdx: index('idx_persons_consent_email').on(t.consentEmail),
    createdAtIdx: index('idx_persons_created_at').on(t.createdAt, t.id),
    statusCheck: check(
      'persons_status_check',
      sql.raw(`status IN (${inList(PERSON_STATUSES)})`),
    ),
    phone1TypeCheck: check(
      'persons_phone1_type_check',
      sql.raw(
        `phone1_type IS NULL OR phone1_type IN (${inList(PHONE1_TYPES)})`,
      ),
    ),
    consentEmailCheck: check(
      'persons_consent_email_check',
      sql.raw(`consent_email IN (${inList(EMAIL_CONSENTS)})`),
    ),
  }),
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

/**
 * Whitelist of column names patchable via PATCH /api/v1/persons/:id.
 * Audit `persons.updated.detail.fieldsChanged` is built by intersecting
 * this set with actually-updated columns — never derived from raw request
 * body keys (defensive: future-added custom keys would otherwise leak into
 * audit logs).
 *
 * `accountId` is patchable: it is how a person moves between organisations.
 * The repo pre-checks that the target account exists and is active.
 */
export const ALLOWED_PATCH_FIELDS = [
  'accountId',
  'displayName',
  'firstName',
  'lastName',
  'emailPrimary',
  'phone1CountryCode',
  'phone1Number',
  'phone1Ext',
  'phone1Type',
  'title',
  'streetLine1',
  'streetLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'imageAvatar',
  'consentEmail',
] as const;
export type PersonPatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is PersonPatchableField {
  return ALLOWED_PATCH_FIELD_SET.has(name);
}

/** Fields that PATCH must reject if present in the body (immutable). */
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
 * Fields that may be cleared via explicit `null` in PATCH. `displayName`
 * is NOT NULL in the schema. `consentEmail` has a meaningful default
 * (`'no_consent'`) — to clear consent, the caller sends the literal
 * `"no_consent"`, not `null`.
 */
export const NULLABLE_PATCH_FIELDS = new Set<PersonPatchableField>([
  'accountId',
  'firstName',
  'lastName',
  'emailPrimary',
  'phone1CountryCode',
  'phone1Number',
  'phone1Ext',
  'phone1Type',
  'title',
  'streetLine1',
  'streetLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'imageAvatar',
]);

export const PHONE1_TYPE_VALUES: readonly Phone1Type[] = PHONE1_TYPES;
export const EMAIL_CONSENT_VALUES: readonly EmailConsent[] = EMAIL_CONSENTS;
