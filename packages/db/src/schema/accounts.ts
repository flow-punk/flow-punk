import { sql } from 'drizzle-orm';
import { check, index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { pii } from '../utils/pii.js';

const ACCOUNT_STATUSES = ['active', 'deleted'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Accounts (companies/orgs).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy: there is
 * no `tenant_id` column. Tenant identity propagates via gateway-stamped
 * `X-Tenant-Id` for audit/log context only.
 *
 * Soft-delete via `status` + `deleted_at`/`deleted_by`, mirroring tenants
 * (`managed/packages/db/src/schema/tenants.ts`). Active rows have
 * `status = 'active'`; soft-deleted rows have `status = 'deleted'` and the
 * deletion audit columns populated.
 *
 * PII per ADR-007: `display_name`, `domain`, `website`, address fields,
 * lat/long, phone fields, and `image_logo` are marked via `pii()`. Industry
 * and country (ISO 3166-1 alpha-2) are not PII.
 */
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    displayName: pii(text('display_name').notNull()),
    domain: pii(text('domain')),
    website: pii(text('website')),
    industry: text('industry'),
    streetLine1: pii(text('street_line_1')),
    streetLine2: pii(text('street_line_2')),
    city: pii(text('city')),
    region: pii(text('region')),
    postalCode: pii(text('postal_code')),
    country: text('country'),
    latitude: pii(real('latitude')),
    longitude: pii(real('longitude')),
    phone1CountryCode: pii(text('phone1_country_code')),
    phone1Number: pii(text('phone1_number')),
    phone1Ext: pii(text('phone1_ext')),
    phone2CountryCode: pii(text('phone2_country_code')),
    phone2Number: pii(text('phone2_number')),
    phone2Ext: pii(text('phone2_ext')),
    imageLogo: pii(text('image_logo')),
    status: text('status').notNull().$type<AccountStatus>(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    statusIdx: index('idx_accounts_status').on(t.status),
    domainIdx: index('idx_accounts_domain').on(t.domain),
    createdAtIdx: index('idx_accounts_created_at').on(t.createdAt, t.id),
    statusCheck: check(
      'accounts_status_check',
      sql.raw(`status IN (${inList(ACCOUNT_STATUSES)})`),
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

/**
 * Whitelist of column names patchable via PATCH /api/v1/accounts/:id.
 * Audit `accounts.updated.detail.fieldsChanged` is built by intersecting
 * this set with actually-updated columns — never derived from raw request
 * body keys (defensive: future-added custom keys would otherwise leak into
 * audit logs).
 */
export const ALLOWED_PATCH_FIELDS = [
  'displayName',
  'domain',
  'website',
  'industry',
  'streetLine1',
  'streetLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'phone1CountryCode',
  'phone1Number',
  'phone1Ext',
  'phone2CountryCode',
  'phone2Number',
  'phone2Ext',
  'imageLogo',
] as const;
export type AccountPatchableField = (typeof ALLOWED_PATCH_FIELDS)[number];

const ALLOWED_PATCH_FIELD_SET = new Set<string>(ALLOWED_PATCH_FIELDS);
export function isAllowedPatchField(name: string): name is AccountPatchableField {
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

/** Fields that may be cleared via explicit `null` in PATCH (nullable columns). */
export const NULLABLE_PATCH_FIELDS = new Set<AccountPatchableField>([
  'domain',
  'website',
  'industry',
  'streetLine1',
  'streetLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'phone1CountryCode',
  'phone1Number',
  'phone1Ext',
  'phone2CountryCode',
  'phone2Number',
  'phone2Ext',
  'imageLogo',
]);
