/**
 * Accounts repository — indie base CRM entity.
 *
 * Functional style (matches indie/packages/db/src/repositories/users.ts).
 * Throws `AccountsRepoError` for caller-actionable failures; handlers map
 * via `mapRepoError` in the contacts service.
 *
 * Validation lives here, not in handlers, so any caller (REST handler,
 * future internal job, future MCP tool) gets the same input contract.
 *
 * `tenant_id` is intentionally absent (single-tenant indie per ADR-011);
 * isolation is the deploy itself.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  accounts,
  isAllowedPatchField,
  isImmutablePatchField,
  type Account,
  type AccountPatchableField,
  type NewAccount,
} from '../schema/accounts.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class AccountsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'AccountsRepoError';
  }
}

const COUNTRY_REGEX = /^[A-Z]{2}$/;
const PHONE_COUNTRY_CODE_REGEX = /^\+\d{1,3}$/;
const DOMAIN_REGEX =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 256;
const URL_MAX = 2048;
const POSTAL_CODE_MAX = 32;
const PHONE_NUMBER_MAX = 32;
const PHONE_EXT_MAX = 16;
const ADDRESS_MAX = 256;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CreateAccountInput {
  displayName: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone1CountryCode?: string | null;
  phone1Number?: string | null;
  phone1Ext?: string | null;
  phone2CountryCode?: string | null;
  phone2Number?: string | null;
  phone2Ext?: string | null;
  imageLogo?: string | null;
}

export type UpdateAccountPatch = Partial<{
  [K in AccountPatchableField]: Account[K] | null;
}>;

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
}

export interface ListResult {
  items: Account[];
  nextCursor: string | null;
}

export interface UpdateResult {
  account: Account;
  fieldsChanged: AccountPatchableField[];
}

export async function create(
  db: Db,
  input: CreateAccountInput,
  actorId: string,
  now: string,
): Promise<Account> {
  const normalized = validateCreate(input);

  const row: NewAccount = {
    id: generateId('acct'),
    displayName: normalized.displayName,
    domain: normalized.domain ?? null,
    website: normalized.website ?? null,
    industry: normalized.industry ?? null,
    streetLine1: normalized.streetLine1 ?? null,
    streetLine2: normalized.streetLine2 ?? null,
    city: normalized.city ?? null,
    region: normalized.region ?? null,
    postalCode: normalized.postalCode ?? null,
    country: normalized.country ?? null,
    latitude: normalized.latitude ?? null,
    longitude: normalized.longitude ?? null,
    phone1CountryCode: normalized.phone1CountryCode ?? null,
    phone1Number: normalized.phone1Number ?? null,
    phone1Ext: normalized.phone1Ext ?? null,
    phone2CountryCode: normalized.phone2CountryCode ?? null,
    phone2Number: normalized.phone2Number ?? null,
    phone2Ext: normalized.phone2Ext ?? null,
    imageLogo: normalized.imageLogo ?? null,
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  const inserted = await db.insert(accounts).values(row).returning();
  const account = inserted[0];
  if (!account) {
    throw new AccountsRepoError(
      'invariant_violation',
      'insert returned no row',
    );
  }
  return account;
}

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!options.includeDeleted && row.status !== 'active') return null;
  return row;
}

export async function list(db: Db, options: ListOptions = {}): Promise<ListResult> {
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters = [];
  if (!options.includeDeleted) filters.push(eq(accounts.status, 'active'));
  if (cursor) {
    filters.push(
      or(
        lt(accounts.createdAt, cursor.createdAt),
        and(
          eq(accounts.createdAt, cursor.createdAt),
          lt(accounts.id, cursor.id),
        ),
      )!,
    );
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const rows = await db
    .select()
    .from(accounts)
    .where(where as any)
    .orderBy(desc(accounts.createdAt), desc(accounts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor({
          createdAt: items[items.length - 1]!.createdAt,
          id: items[items.length - 1]!.id,
        })
      : null;

  return { items, nextCursor };
}

export async function update(
  db: Db,
  id: string,
  patch: UpdateAccountPatch,
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  // Reject any immutable field present in the patch up front.
  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new AccountsRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new AccountsRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  // Only the canonical patchable fields, in their canonical order, may
  // appear in the diff used by audit. Build the change set from
  // ALLOWED_PATCH_FIELDS — never from raw `patch` keys.
  const changes: Partial<Record<AccountPatchableField, unknown>> = {};
  const fieldsChanged: AccountPatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new AccountsRepoError(
          'invalid_input',
          `field "${field}" cannot be null`,
        );
      }
      changes[field] = null;
      fieldsChanged.push(field);
      continue;
    }
    if (value === undefined) continue;
    validateField(field, value);
    changes[field] = normalizeField(field, value);
    fieldsChanged.push(field);
  }

  if (fieldsChanged.length === 0) {
    const current = await findById(db, id);
    if (!current) {
      throw new AccountsRepoError('not_found', `account "${id}" not found`);
    }
    return { account: current, fieldsChanged: [] };
  }

  const updated = await db
    .update(accounts)
    .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
    .where(and(eq(accounts.id, id), eq(accounts.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    // Either the row does not exist, or it is soft-deleted.
    const existing = await db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    if (existing[0]) {
      throw new AccountsRepoError(
        'wrong_state',
        `account "${id}" is not active`,
      );
    }
    throw new AccountsRepoError('not_found', `account "${id}" not found`);
  }

  return { account: row, fieldsChanged };
}

export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<Account> {
  const updated = await db
    .update(accounts)
    .set({
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    })
    .where(and(eq(accounts.id, id), eq(accounts.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    if (existing[0]) {
      throw new AccountsRepoError(
        'wrong_state',
        `account "${id}" is already deleted`,
      );
    }
    throw new AccountsRepoError('not_found', `account "${id}" not found`);
  }
  return row;
}

// ---------- validation / normalization ----------

interface NormalizedCreate extends CreateAccountInput {
  displayName: string;
}

function validateCreate(input: CreateAccountInput): NormalizedCreate {
  if (typeof input.displayName !== 'string') {
    throw new AccountsRepoError(
      'invalid_input',
      'displayName is required and must be a string',
    );
  }
  const out: NormalizedCreate = {
    displayName: input.displayName.trim(),
  };
  validateDisplayName(out.displayName);

  const inputRecord = input as unknown as Record<string, unknown>;
  const outRecord = out as unknown as Record<string, unknown>;
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (field === 'displayName') continue;
    if (!(field in inputRecord)) continue;
    const value = inputRecord[field];
    if (value === undefined || value === null) {
      outRecord[field] = null;
      continue;
    }
    validateField(field, value);
    outRecord[field] = normalizeField(field, value);
  }
  return out;
}

function validateField(field: AccountPatchableField, value: unknown): void {
  switch (field) {
    case 'displayName':
      if (typeof value !== 'string') {
        throw new AccountsRepoError(
          'invalid_input',
          'displayName must be a string',
        );
      }
      validateDisplayName(value.trim());
      return;
    case 'domain':
      validateDomain(value);
      return;
    case 'website':
      validateUrl('website', value);
      return;
    case 'industry':
      validateString('industry', value, 1, 64);
      return;
    case 'streetLine1':
    case 'streetLine2':
    case 'city':
    case 'region':
      validateString(field, value, 1, ADDRESS_MAX);
      return;
    case 'postalCode':
      validateString(field, value, 1, POSTAL_CODE_MAX);
      return;
    case 'country':
      if (typeof value !== 'string' || !COUNTRY_REGEX.test(value)) {
        throw new AccountsRepoError(
          'invalid_input',
          'country must be ISO 3166-1 alpha-2 (e.g. "US")',
        );
      }
      return;
    case 'latitude':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
        throw new AccountsRepoError(
          'invalid_input',
          'latitude must be a number in [-90, 90]',
        );
      }
      return;
    case 'longitude':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
        throw new AccountsRepoError(
          'invalid_input',
          'longitude must be a number in [-180, 180]',
        );
      }
      return;
    case 'phone1CountryCode':
    case 'phone2CountryCode':
      if (typeof value !== 'string' || !PHONE_COUNTRY_CODE_REGEX.test(value)) {
        throw new AccountsRepoError(
          'invalid_input',
          `${field} must match "+NN" (1-3 digits)`,
        );
      }
      return;
    case 'phone1Number':
    case 'phone2Number':
      validateString(field, value, 1, PHONE_NUMBER_MAX);
      return;
    case 'phone1Ext':
    case 'phone2Ext':
      validateString(field, value, 1, PHONE_EXT_MAX);
      return;
    case 'imageLogo':
      validateUrl('imageLogo', value);
      return;
  }
}

function normalizeField(field: AccountPatchableField, value: unknown): unknown {
  if (field === 'displayName' && typeof value === 'string') return value.trim();
  if (field === 'domain' && typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'string') return value.trim();
  return value;
}

function validateDisplayName(value: string): void {
  if (value.length < DISPLAY_NAME_MIN || value.length > DISPLAY_NAME_MAX) {
    throw new AccountsRepoError(
      'invalid_input',
      `displayName must be ${DISPLAY_NAME_MIN}-${DISPLAY_NAME_MAX} characters`,
    );
  }
}

function validateString(
  field: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== 'string') {
    throw new AccountsRepoError('invalid_input', `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new AccountsRepoError(
      'invalid_input',
      `${field} must be ${min}-${max} characters`,
    );
  }
}

function validateUrl(field: string, value: unknown): void {
  if (typeof value !== 'string') {
    throw new AccountsRepoError('invalid_input', `${field} must be a string`);
  }
  if (value.length > URL_MAX) {
    throw new AccountsRepoError(
      'invalid_input',
      `${field} exceeds ${URL_MAX} characters`,
    );
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('non-http');
    }
  } catch {
    throw new AccountsRepoError('invalid_input', `${field} must be an http(s) URL`);
  }
}

function validateDomain(value: unknown): void {
  if (typeof value !== 'string') {
    throw new AccountsRepoError('invalid_input', 'domain must be a string');
  }
  const lower = value.trim().toLowerCase();
  if (!DOMAIN_REGEX.test(lower)) {
    throw new AccountsRepoError(
      'invalid_input',
      'domain must be a valid DNS-shaped hostname',
    );
  }
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new AccountsRepoError(
      'invalid_input',
      'limit must be a positive integer',
    );
  }
  return Math.min(raw, MAX_LIMIT);
}

// ---------- cursor ----------

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify({ createdAt: payload.createdAt, id: payload.id });
  return base64UrlEncode(json);
}

export function decodeCursor(raw: string): CursorPayload {
  let json: string;
  try {
    json = base64UrlDecode(raw);
  } catch {
    throw new AccountsRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AccountsRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new AccountsRepoError('invalid_input', 'malformed cursor');
  }
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (
    keys.length !== 2 ||
    !keys.includes('createdAt') ||
    !keys.includes('id') ||
    typeof obj.createdAt !== 'string' ||
    typeof obj.id !== 'string'
  ) {
    throw new AccountsRepoError('invalid_input', 'malformed cursor');
  }
  return { createdAt: obj.createdAt, id: obj.id };
}

function base64UrlEncode(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  let bin = '';
  for (const byte of utf8) bin += String.fromCharCode(byte);
  const b64 = typeof btoa === 'function' ? btoa(bin) : nodeBtoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (input.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(padded) : nodeAtob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function nodeBtoa(s: string): string {
  // Workers and modern Node both expose `btoa`; this branch exists only as a
  // belt-and-braces fallback for unit tests under older Node.
  return Buffer.from(s, 'binary').toString('base64');
}

function nodeAtob(s: string): string {
  return Buffer.from(s, 'base64').toString('binary');
}
