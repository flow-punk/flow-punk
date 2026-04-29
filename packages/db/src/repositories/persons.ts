/**
 * Persons repository — indie base CRM entity.
 *
 * Functional style (matches indie/packages/db/src/repositories/accounts.ts).
 * Throws `PersonsRepoError` for caller-actionable failures; handlers map
 * via `mapRepoError` in the contacts service.
 *
 * Validation lives here, not in handlers, so any caller (REST handler,
 * future internal job, future MCP tool) gets the same input contract.
 *
 * `tenant_id` is intentionally absent (single-tenant indie per ADR-011);
 * isolation is the deploy itself.
 *
 * Account-link discipline: when `accountId` is provided on create or in
 * an update patch, the repo runs an existence-and-active-status check
 * (`accounts.status = 'active'`) before the write. The SQLite FK is the
 * second line of defense; the pre-check exists because (a) accounts use
 * soft-delete, so a deleted account still satisfies the FK and would
 * otherwise produce dangling links visible to clients; (b) the managed
 * tenant-router currently surfaces FK violations as opaque 500s, so we
 * cannot rely on constraint failures to map cleanly to 400 INVALID_INPUT.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import { accounts } from '../schema/accounts.js';
import {
  ALLOWED_PATCH_FIELDS,
  EMAIL_CONSENT_VALUES,
  NULLABLE_PATCH_FIELDS,
  PHONE1_TYPE_VALUES,
  isAllowedPatchField,
  isImmutablePatchField,
  persons,
  type EmailConsent,
  type NewPerson,
  type Person,
  type PersonPatchableField,
  type Phone1Type,
} from '../schema/persons.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class PersonsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'PersonsRepoError';
  }
}

const COUNTRY_REGEX = /^[A-Z]{2}$/;
const PHONE_COUNTRY_CODE_REGEX = /^\+\d{1,3}$/;
const ACCOUNT_ID_REGEX = /^acct_[a-z0-9]{21}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 256;
const NAME_MIN = 1;
const NAME_MAX = 128;
const TITLE_MIN = 1;
const TITLE_MAX = 256;
const EMAIL_MAX = 320;
const URL_MAX = 2048;
const POSTAL_CODE_MAX = 32;
const PHONE_NUMBER_MAX = 32;
const PHONE_EXT_MAX = 16;
const ADDRESS_MAX = 256;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const PHONE1_TYPE_SET = new Set<string>(PHONE1_TYPE_VALUES);
const EMAIL_CONSENT_SET = new Set<string>(EMAIL_CONSENT_VALUES);

export interface CreatePersonInput {
  displayName: string;
  accountId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailPrimary?: string | null;
  phone1CountryCode?: string | null;
  phone1Number?: string | null;
  phone1Ext?: string | null;
  phone1Type?: Phone1Type | null;
  title?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageAvatar?: string | null;
  consentEmail?: EmailConsent;
}

export type UpdatePersonPatch = Partial<{
  [K in PersonPatchableField]: Person[K] | null;
}>;

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
  accountId?: string;
}

export interface ListResult {
  items: Person[];
  nextCursor: string | null;
}

export interface UpdateResult {
  person: Person;
  fieldsChanged: PersonPatchableField[];
}

export async function create(
  db: Db,
  input: CreatePersonInput,
  actorId: string,
  now: string,
): Promise<Person> {
  const normalized = validateCreate(input);

  if (normalized.accountId) {
    await assertAccountActive(db, normalized.accountId);
  }

  const row: NewPerson = {
    id: generateId('per'),
    accountId: normalized.accountId ?? null,
    displayName: normalized.displayName,
    firstName: normalized.firstName ?? null,
    lastName: normalized.lastName ?? null,
    emailPrimary: normalized.emailPrimary ?? null,
    phone1CountryCode: normalized.phone1CountryCode ?? null,
    phone1Number: normalized.phone1Number ?? null,
    phone1Ext: normalized.phone1Ext ?? null,
    phone1Type: normalized.phone1Type ?? null,
    title: normalized.title ?? null,
    streetLine1: normalized.streetLine1 ?? null,
    streetLine2: normalized.streetLine2 ?? null,
    city: normalized.city ?? null,
    region: normalized.region ?? null,
    postalCode: normalized.postalCode ?? null,
    country: normalized.country ?? null,
    latitude: normalized.latitude ?? null,
    longitude: normalized.longitude ?? null,
    imageAvatar: normalized.imageAvatar ?? null,
    consentEmail: normalized.consentEmail ?? 'no_consent',
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  const inserted = await db.insert(persons).values(row).returning();
  const person = inserted[0];
  if (!person) {
    throw new PersonsRepoError(
      'invariant_violation',
      'insert returned no row',
    );
  }
  return person;
}

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Person | null> {
  const rows = await db
    .select()
    .from(persons)
    .where(eq(persons.id, id))
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
  if (!options.includeDeleted) filters.push(eq(persons.status, 'active'));
  if (options.accountId !== undefined) {
    if (!ACCOUNT_ID_REGEX.test(options.accountId)) {
      throw new PersonsRepoError(
        'invalid_input',
        'accountId must match "acct_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(persons.accountId, options.accountId));
  }
  if (cursor) {
    filters.push(
      or(
        lt(persons.createdAt, cursor.createdAt),
        and(
          eq(persons.createdAt, cursor.createdAt),
          lt(persons.id, cursor.id),
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
    .from(persons)
    .where(where as any)
    .orderBy(desc(persons.createdAt), desc(persons.id))
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
  patch: UpdatePersonPatch,
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new PersonsRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new PersonsRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  const changes: Partial<Record<PersonPatchableField, unknown>> = {};
  const fieldsChanged: PersonPatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new PersonsRepoError(
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
      throw new PersonsRepoError('not_found', `person "${id}" not found`);
    }
    return { person: current, fieldsChanged: [] };
  }

  // Active-account pre-check fires only when the patch sets `accountId` to
  // a non-null value. Clearing the link (`accountId: null`) does not need
  // the check; relinking to a soft-deleted account does.
  if ('accountId' in changes && typeof changes.accountId === 'string') {
    await assertAccountActive(db, changes.accountId);
  }

  const updated = await db
    .update(persons)
    .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
    .where(and(eq(persons.id, id), eq(persons.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select({ status: persons.status })
      .from(persons)
      .where(eq(persons.id, id))
      .limit(1);
    if (existing[0]) {
      throw new PersonsRepoError(
        'wrong_state',
        `person "${id}" is not active`,
      );
    }
    throw new PersonsRepoError('not_found', `person "${id}" not found`);
  }

  return { person: row, fieldsChanged };
}

export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<Person> {
  const updated = await db
    .update(persons)
    .set({
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    })
    .where(and(eq(persons.id, id), eq(persons.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select({ status: persons.status })
      .from(persons)
      .where(eq(persons.id, id))
      .limit(1);
    if (existing[0]) {
      throw new PersonsRepoError(
        'wrong_state',
        `person "${id}" is already deleted`,
      );
    }
    throw new PersonsRepoError('not_found', `person "${id}" not found`);
  }
  return row;
}

// ---------- account-link pre-check ----------

/**
 * NOTE: TOCTOU window — known limitation.
 *
 * This pre-check and the subsequent INSERT/UPDATE are two separate D1
 * statements; an account soft-deleted between them produces a person
 * linked to an inactive account. Window is bounded by the gap between
 * statements (single-digit ms in practice), and account soft-delete is
 * an explicit operator action, not high-frequency traffic — so the race
 * is unlikely but real.
 *
 * Structural fixes (atomic conditional INSERT, soft-delete cascade
 * policy on accounts) are deferred. Until then: any auditing or
 * reporting that joins persons → accounts must tolerate `account_id`
 * pointing at a `status='deleted'` row.
 */
async function assertAccountActive(db: Db, accountId: string): Promise<void> {
  const rows = await db
    .select({ status: accounts.status })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new PersonsRepoError(
      'invalid_input',
      `account "${accountId}" not found (account_not_found)`,
    );
  }
  if (row.status !== 'active') {
    throw new PersonsRepoError(
      'invalid_input',
      `account "${accountId}" is not active (account_not_active)`,
    );
  }
}

// ---------- validation / normalization ----------

interface NormalizedCreate extends CreatePersonInput {
  displayName: string;
}

function validateCreate(input: CreatePersonInput): NormalizedCreate {
  if (typeof input.displayName !== 'string') {
    throw new PersonsRepoError(
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
  // consentEmail special-case: defaults to 'no_consent' on create-omit.
  if (outRecord.consentEmail === undefined || outRecord.consentEmail === null) {
    outRecord.consentEmail = 'no_consent';
  }
  return out;
}

function validateField(field: PersonPatchableField, value: unknown): void {
  switch (field) {
    case 'accountId':
      if (typeof value !== 'string' || !ACCOUNT_ID_REGEX.test(value)) {
        throw new PersonsRepoError(
          'invalid_input',
          'accountId must match "acct_<21 lowercase alphanumeric>"',
        );
      }
      return;
    case 'displayName':
      if (typeof value !== 'string') {
        throw new PersonsRepoError(
          'invalid_input',
          'displayName must be a string',
        );
      }
      validateDisplayName(value.trim());
      return;
    case 'firstName':
    case 'lastName':
      validateString(field, value, NAME_MIN, NAME_MAX);
      return;
    case 'emailPrimary':
      validateEmail(value);
      return;
    case 'phone1CountryCode':
      if (typeof value !== 'string' || !PHONE_COUNTRY_CODE_REGEX.test(value)) {
        throw new PersonsRepoError(
          'invalid_input',
          `${field} must match "+NN" (1-3 digits)`,
        );
      }
      return;
    case 'phone1Number':
      validateString(field, value, 1, PHONE_NUMBER_MAX);
      return;
    case 'phone1Ext':
      validateString(field, value, 1, PHONE_EXT_MAX);
      return;
    case 'phone1Type':
      if (typeof value !== 'string' || !PHONE1_TYPE_SET.has(value)) {
        throw new PersonsRepoError(
          'invalid_input',
          `phone1Type must be one of ${[...PHONE1_TYPE_VALUES].join(' | ')}`,
        );
      }
      return;
    case 'title':
      validateString(field, value, TITLE_MIN, TITLE_MAX);
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
        throw new PersonsRepoError(
          'invalid_input',
          'country must be ISO 3166-1 alpha-2 (e.g. "US")',
        );
      }
      return;
    case 'latitude':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < -90 ||
        value > 90
      ) {
        throw new PersonsRepoError(
          'invalid_input',
          'latitude must be a number in [-90, 90]',
        );
      }
      return;
    case 'longitude':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < -180 ||
        value > 180
      ) {
        throw new PersonsRepoError(
          'invalid_input',
          'longitude must be a number in [-180, 180]',
        );
      }
      return;
    case 'imageAvatar':
      validateUrl('imageAvatar', value);
      return;
    case 'consentEmail':
      if (typeof value !== 'string' || !EMAIL_CONSENT_SET.has(value)) {
        throw new PersonsRepoError(
          'invalid_input',
          `consentEmail must be one of ${[...EMAIL_CONSENT_VALUES].join(' | ')}`,
        );
      }
      return;
  }
}

function normalizeField(field: PersonPatchableField, value: unknown): unknown {
  if (field === 'displayName' && typeof value === 'string') return value.trim();
  if (field === 'emailPrimary' && typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function validateDisplayName(value: string): void {
  if (value.length < DISPLAY_NAME_MIN || value.length > DISPLAY_NAME_MAX) {
    throw new PersonsRepoError(
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
    throw new PersonsRepoError('invalid_input', `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new PersonsRepoError(
      'invalid_input',
      `${field} must be ${min}-${max} characters`,
    );
  }
}

function validateEmail(value: unknown): void {
  if (typeof value !== 'string') {
    throw new PersonsRepoError(
      'invalid_input',
      'emailPrimary must be a string',
    );
  }
  const lower = value.trim().toLowerCase();
  if (lower.length === 0 || lower.length > EMAIL_MAX) {
    throw new PersonsRepoError(
      'invalid_input',
      `emailPrimary must be 1-${EMAIL_MAX} characters`,
    );
  }
  if (!EMAIL_REGEX.test(lower)) {
    throw new PersonsRepoError(
      'invalid_input',
      'emailPrimary must look like "name@host.tld"',
    );
  }
}

function validateUrl(field: string, value: unknown): void {
  if (typeof value !== 'string') {
    throw new PersonsRepoError('invalid_input', `${field} must be a string`);
  }
  if (value.length > URL_MAX) {
    throw new PersonsRepoError(
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
    throw new PersonsRepoError('invalid_input', `${field} must be an http(s) URL`);
  }
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new PersonsRepoError(
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
    throw new PersonsRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PersonsRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new PersonsRepoError('invalid_input', 'malformed cursor');
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
    throw new PersonsRepoError('invalid_input', 'malformed cursor');
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
  return Buffer.from(s, 'binary').toString('base64');
}

function nodeAtob(s: string): string {
  return Buffer.from(s, 'base64').toString('binary');
}
