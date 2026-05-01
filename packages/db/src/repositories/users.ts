/**
 * Users repository — tenant users (per-tenant D1 on managed; single bound
 * D1 on indie). Per SYSTEM.md §"Domain Model" + ADR-001:19, this table is
 * tenant-scoped without a `tenant_id` column.
 *
 * Functional style matching `accounts.ts` / `persons.ts`. Throws
 * `UsersRepoError` for caller-actionable failures; handlers map via
 * `mapRepoError`.
 *
 * Validation lives here, not in handlers, so any caller (REST handler,
 * future internal job, future MCP tool) gets the same input contract.
 *
 * Email uniqueness is enforced by the partial unique index
 * `idx_users_email_active_unique`. The DB constraint is authoritative;
 * `findByEmail` is a UX-only pre-check for clean error messages.
 *
 * Roles (`owner` | `admin` | `member` | `readonly`) gate all admin-tier
 * operations. Indie's "exactly one active owner" invariant is enforced
 * via single conditional `INSERT … WHERE NOT EXISTS` / `UPDATE … WHERE
 * EXISTS` statements so the read-then-write race window does not exist.
 *
 * Per ADR-011, indie wrappers pass `enforceSingleOwner: true`; managed
 * wrappers pass `false`. The repo itself is edition-agnostic.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, ne, or, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import { mcpSessions } from '../schema/mcp-sessions.js';
import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  isAllowedPatchField,
  isImmutablePatchField,
  users,
  type NewUser,
  type User,
  type UserPatchableField,
} from '../schema/users.js';
import { ROLE_VALUES, isRole, type Role } from '../utils/roles.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class UsersRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
    public readonly detailCode?: string,
  ) {
    super(message);
    this.name = 'UsersRepoError';
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 320;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 256;
const NAME_MIN = 1;
const NAME_MAX = 128;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CreateUserInput {
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: Role;
}

export interface CreateUserOptions {
  /**
   * When true, reject `role: 'owner'` if any other active owner already
   * exists. Set by indie wrappers (one-active-owner invariant per
   * ADR-011); managed wrappers leave this false.
   */
  enforceSingleOwner?: boolean;
}

export type UpdateUserPatch = Partial<{
  [K in UserPatchableField]: User[K] | null;
}>;

export interface UpdateUserOptions {
  enforceSingleOwner?: boolean;
}

export interface UpdateResult {
  user: User;
  fieldsChanged: UserPatchableField[];
}

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
  role?: Role;
}

export interface ListResult {
  items: User[];
  nextCursor: string | null;
}

// ---------- create ----------

export async function create(
  db: Db,
  input: CreateUserInput,
  actorId: string,
  now: string,
  options: CreateUserOptions = {},
): Promise<User> {
  const normalized = validateCreate(input);

  // UX-only pre-check for email; the partial unique index is authoritative
  // (enforced via the unique-violation catch below).
  const existing = await findByEmail(db, normalized.email);
  if (existing) {
    throw new UsersRepoError(
      'wrong_state',
      `email "${normalized.email}" is already in use`,
      'EMAIL_TAKEN',
    );
  }

  const id = generateId('usr');
  const role: Role = normalized.role ?? 'member';
  const firstName = normalized.firstName ?? null;
  const lastName = normalized.lastName ?? null;
  const enforceSingleOwnerCreate =
    options.enforceSingleOwner === true && role === 'owner';

  if (enforceSingleOwnerCreate) {
    // Race-safe single-owner enforcement (indie one-active-owner per
    // ADR-011). Single-statement conditional INSERT — the WHERE NOT
    // EXISTS clause closes the read-then-write window that a separate
    // pre-check would leave open.
    try {
      const result = await db.run(sql`
        INSERT INTO users (
          id, email, display_name, first_name, last_name,
          role, status, last_login_at,
          deleted_at, deleted_by,
          created_at, created_by, updated_at, updated_by
        )
        SELECT
          ${id}, ${normalized.email}, ${normalized.displayName},
          ${firstName}, ${lastName},
          ${role}, 'active', NULL,
          NULL, NULL,
          ${now}, ${actorId}, ${now}, ${actorId}
        WHERE NOT EXISTS (
          SELECT 1 FROM users u
          WHERE u.role = 'owner' AND u.status = 'active'
        )
      `);
      if (getChanges(result) === 0) {
        throw new UsersRepoError(
          'invariant_violation',
          `another active owner already exists`,
          'OWNER_EXISTS',
        );
      }
    } catch (err) {
      if (err instanceof UsersRepoError) throw err;
      if (isUniqueViolation(err)) {
        throw new UsersRepoError(
          'wrong_state',
          `email "${normalized.email}" is already in use`,
          'EMAIL_TAKEN',
        );
      }
      throw err;
    }
    const inserted = await findById(db, id);
    if (!inserted) {
      throw new UsersRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return inserted;
  }

  // Default path. Plain INSERT with unique-violation catch for email collisions.
  const row: NewUser = {
    id,
    email: normalized.email,
    displayName: normalized.displayName,
    firstName,
    lastName,
    role,
    status: 'active',
    lastLoginAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  try {
    const inserted = await db.insert(users).values(row).returning();
    const user = inserted[0];
    if (!user) {
      throw new UsersRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UsersRepoError(
        'wrong_state',
        `email "${normalized.email}" is already in use`,
        'EMAIL_TAKEN',
      );
    }
    throw err;
  }
}

// ---------- read ----------

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!options.includeDeleted && row.status !== 'active') return null;
  return row;
}

/**
 * Case-insensitive email lookup, scoped to active users by default.
 * The partial unique index guarantees at most one match.
 */
export async function findByEmail(
  db: Db,
  email: string,
  options: { includeDeleted?: boolean } = {},
): Promise<User | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(2);
  if (rows.length === 0) return null;
  if (options.includeDeleted) {
    return rows.find((r) => r.status === 'active') ?? rows[0]!;
  }
  return rows.find((r) => r.status === 'active') ?? null;
}

export async function list(
  db: Db,
  options: ListOptions = {},
): Promise<ListResult> {
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters = [];
  if (!options.includeDeleted) filters.push(eq(users.status, 'active'));
  if (options.role !== undefined) filters.push(eq(users.role, options.role));
  if (cursor) {
    filters.push(
      or(
        lt(users.createdAt, cursor.createdAt),
        and(eq(users.createdAt, cursor.createdAt), lt(users.id, cursor.id)),
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
    .from(users)
    .where(where as any)
    .orderBy(desc(users.createdAt), desc(users.id))
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

// ---------- update ----------

export async function update(
  db: Db,
  id: string,
  patch: UpdateUserPatch,
  actorId: string,
  now: string,
  options: UpdateUserOptions = {},
): Promise<UpdateResult> {
  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new UsersRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new UsersRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  const changes: Partial<Record<UserPatchableField, unknown>> = {};
  const fieldsChanged: UserPatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new UsersRepoError(
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
      throw new UsersRepoError('not_found', `user "${id}" not found`);
    }
    return { user: current, fieldsChanged: [] };
  }

  // Role transitions go through `setRole` so the last-owner and
  // single-owner invariants are race-safe. Other field changes go through
  // the standard UPDATE below.
  if ('role' in changes) {
    const target = changes.role as Role;
    await setRole(db, id, target, actorId, now, {
      enforceSingleOwner: options.enforceSingleOwner === true,
    });
    delete changes.role;
  }

  // Email uniqueness pre-check (UX); unique-violation is authoritative.
  if (typeof changes.email === 'string') {
    const collision = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, changes.email as string),
          eq(users.status, 'active'),
          ne(users.id, id),
        ),
      )
      .limit(1);
    if (collision[0]) {
      throw new UsersRepoError(
        'wrong_state',
        `email "${changes.email}" is already in use`,
        'EMAIL_TAKEN',
      );
    }
  }

  if (Object.keys(changes).length > 0) {
    try {
      const updated = await db
        .update(users)
        .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
        .where(and(eq(users.id, id), eq(users.status, 'active')))
        .returning();

      const row = updated[0];
      if (!row) {
        const existing = await db
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        if (existing[0]) {
          throw new UsersRepoError(
            'wrong_state',
            `user "${id}" is not active`,
          );
        }
        throw new UsersRepoError('not_found', `user "${id}" not found`);
      }
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new UsersRepoError(
          'wrong_state',
          `email "${changes.email}" is already in use`,
          'EMAIL_TAKEN',
        );
      }
      throw err;
    }
  }

  // Reload the row so the returned snapshot reflects both the role
  // transition and the field updates.
  const after = await findById(db, id, { includeDeleted: true });
  if (!after) {
    throw new UsersRepoError('not_found', `user "${id}" not found`);
  }
  return { user: after, fieldsChanged };
}

/**
 * Atomic role transition. Single-statement conditional UPDATE preserves
 * the last-owner / single-owner invariants without a read-then-write
 * race window. Demoting the last active owner throws `LAST_OWNER`; in
 * single-owner mode, promoting to `owner` while another active owner
 * exists throws `OWNER_EXISTS`.
 */
export async function setRole(
  db: Db,
  id: string,
  target: Role,
  actorId: string,
  now: string,
  options: { enforceSingleOwner?: boolean } = {},
): Promise<void> {
  const before = await findById(db, id, { includeDeleted: true });
  if (!before) {
    throw new UsersRepoError('not_found', `user "${id}" not found`);
  }
  if (before.status !== 'active') {
    throw new UsersRepoError('wrong_state', `user "${id}" is not active`);
  }
  if (before.role === target) {
    return; // no-op
  }

  // Promotion to owner.
  if (target === 'owner') {
    if (options.enforceSingleOwner) {
      const result = await db.run(sql`
        UPDATE users
        SET role = 'owner', updated_at = ${now}, updated_by = ${actorId}
        WHERE id = ${id}
          AND status = 'active'
          AND role != 'owner'
          AND NOT EXISTS (
            SELECT 1 FROM users u2
            WHERE u2.id != ${id}
              AND u2.role = 'owner'
              AND u2.status = 'active'
          )
      `);
      if (getChanges(result) > 0) return;
      throw new UsersRepoError(
        'invariant_violation',
        `another active owner already exists`,
        'OWNER_EXISTS',
      );
    }
    // Multi-owner allowed (managed): plain promotion.
    await db
      .update(users)
      .set({ role: 'owner', updatedAt: now, updatedBy: actorId })
      .where(and(eq(users.id, id), eq(users.status, 'active')));
    return;
  }

  // Demotion away from owner: must keep at least one active owner.
  if (before.role === 'owner') {
    const result = await db.run(sql`
      UPDATE users
      SET role = ${target}, updated_at = ${now}, updated_by = ${actorId}
      WHERE id = ${id}
        AND status = 'active'
        AND role = 'owner'
        AND EXISTS (
          SELECT 1 FROM users u2
          WHERE u2.id != ${id}
            AND u2.role = 'owner'
            AND u2.status = 'active'
        )
    `);
    if (getChanges(result) > 0) return;
    throw new UsersRepoError(
      'invariant_violation',
      `cannot demote the last active owner`,
      'LAST_OWNER',
    );
  }

  // Non-owner role transition (e.g. admin → member): plain update.
  await db
    .update(users)
    .set({ role: target, updatedAt: now, updatedBy: actorId })
    .where(and(eq(users.id, id), eq(users.status, 'active')));
}

// ---------- soft delete ----------

export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<User> {
  // Last-owner guard baked into the WHERE clause: allowed if the target
  // is non-owner, or if the target is owner AND (another owner exists OR
  // this is the last active user — decommission case).
  const result = await db.run(sql`
    UPDATE users
    SET status = 'deleted',
        deleted_at = ${now},
        deleted_by = ${actorId},
        updated_at = ${now},
        updated_by = ${actorId}
    WHERE id = ${id}
      AND status = 'active'
      AND (
        role != 'owner'
        OR EXISTS (
          SELECT 1 FROM users u2
          WHERE u2.id != ${id}
            AND u2.role = 'owner'
            AND u2.status = 'active'
        )
        OR (
          SELECT COUNT(*) FROM users u3
          WHERE u3.id != ${id} AND u3.status = 'active'
        ) = 0
      )
  `);

  if (getChanges(result) > 0) {
    const after = await findById(db, id, { includeDeleted: true });
    if (!after) {
      throw new UsersRepoError(
        'invariant_violation',
        `user "${id}" missing after soft-delete`,
      );
    }
    return after;
  }

  // 0 rows: figure out why.
  const current = await findById(db, id, { includeDeleted: true });
  if (!current) {
    throw new UsersRepoError('not_found', `user "${id}" not found`);
  }
  if (current.status !== 'active') {
    throw new UsersRepoError(
      'wrong_state',
      `user "${id}" is already deleted`,
    );
  }
  // Active owner, blocked by invariant: at least one other active user
  // exists but no other owner.
  throw new UsersRepoError(
    'invariant_violation',
    `cannot soft-delete the last active owner while other active users exist`,
    'LAST_OWNER_BLOCKS_DELETE',
  );
}

// ---------- last-login ----------

/**
 * Updates `lastLoginAt` only. Bypasses the standard `updatedAt`/`updatedBy`
 * audit trail because login timestamping is a separate signal not driven
 * by an actor patch.
 */
export async function touchLastLogin(
  db: Db,
  id: string,
  now: string,
): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: now })
    .where(and(eq(users.id, id), eq(users.status, 'active')));
}

// ---------- cascade helpers (auth state revocation) ----------

/**
 * Revoke all active mcp_sessions for a user. Called by the soft-delete
 * handler so a deleted user's cookie immediately stops authenticating.
 *
 * Indie has no `mcp_oauth_tokens` (managed-only). Managed services that
 * import this repo via the proxy revoke OAuth tokens at the wrapper
 * layer (`@flowpunk-managed/tenant-db`'s oauthTokensRepo.revokeForUser)
 * after this call returns.
 */
export async function revokeMcpSessionsForUser(
  db: Db,
  userId: string,
  now: string,
): Promise<void> {
  await db
    .update(mcpSessions)
    .set({ revokedAt: now })
    .where(and(eq(mcpSessions.userId, userId), sql`revoked_at IS NULL`));
}

/**
 * Edition-agnostic auth-state revocation called from the soft-delete
 * handler. Indie revokes only mcp_sessions; managed wrappers chain the
 * OAuth-token revocation in the wrapper after this returns.
 */
export async function revokeAuthStateForUser(
  db: Db,
  userId: string,
  now: string,
): Promise<void> {
  await revokeMcpSessionsForUser(db, userId, now);
}

// ---------- internals ----------

interface NormalizedCreate {
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: Role;
}

function validateCreate(input: CreateUserInput): NormalizedCreate {
  if (typeof input.email !== 'string') {
    throw new UsersRepoError('invalid_input', 'email is required');
  }
  if (typeof input.displayName !== 'string') {
    throw new UsersRepoError('invalid_input', 'displayName is required');
  }
  const email = normalizeEmail(input.email);
  validateEmail(email);

  const displayName = input.displayName.trim();
  validateDisplayName(displayName);

  const out: NormalizedCreate = { email, displayName };

  if (input.role !== undefined) {
    if (!isRole(input.role)) {
      throw new UsersRepoError(
        'invalid_input',
        `role must be one of ${ROLE_VALUES.join(', ')}`,
      );
    }
    out.role = input.role;
  }

  if (input.firstName !== undefined) {
    if (input.firstName === null) {
      out.firstName = null;
    } else {
      validateString('firstName', input.firstName, NAME_MIN, NAME_MAX);
      out.firstName = (input.firstName as string).trim();
    }
  }
  if (input.lastName !== undefined) {
    if (input.lastName === null) {
      out.lastName = null;
    } else {
      validateString('lastName', input.lastName, NAME_MIN, NAME_MAX);
      out.lastName = (input.lastName as string).trim();
    }
  }
  return out;
}

function validateField(field: UserPatchableField, value: unknown): void {
  switch (field) {
    case 'email':
      if (typeof value !== 'string') {
        throw new UsersRepoError('invalid_input', 'email must be a string');
      }
      validateEmail(normalizeEmail(value));
      return;
    case 'displayName':
      if (typeof value !== 'string') {
        throw new UsersRepoError(
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
    case 'role':
      if (!isRole(value)) {
        throw new UsersRepoError(
          'invalid_input',
          `role must be one of ${ROLE_VALUES.join(', ')}`,
        );
      }
      return;
    default: {
      const exhaustive: never = field;
      throw new UsersRepoError(
        'invalid_input',
        `unknown field "${exhaustive as string}"`,
      );
    }
  }
}

function normalizeField(field: UserPatchableField, value: unknown): unknown {
  switch (field) {
    case 'email':
      return normalizeEmail(value as string);
    case 'displayName':
    case 'firstName':
    case 'lastName':
      return (value as string).trim();
    case 'role':
      return value as Role;
  }
}

function validateString(
  field: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== 'string') {
    throw new UsersRepoError('invalid_input', `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new UsersRepoError(
      'invalid_input',
      `${field} must be ${min}-${max} characters`,
    );
  }
}

function validateDisplayName(value: string): void {
  if (value.length < DISPLAY_NAME_MIN || value.length > DISPLAY_NAME_MAX) {
    throw new UsersRepoError(
      'invalid_input',
      `displayName must be ${DISPLAY_NAME_MIN}-${DISPLAY_NAME_MAX} characters`,
    );
  }
}

function validateEmail(email: string): void {
  if (email.length === 0 || email.length > EMAIL_MAX) {
    throw new UsersRepoError(
      'invalid_input',
      `email must be 1-${EMAIL_MAX} characters`,
    );
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new UsersRepoError(
      'invalid_input',
      'email must look like "name@host.tld"',
    );
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const message =
    'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? ((err as { message: string }).message)
      : '';
  return /UNIQUE constraint failed/i.test(message);
}

interface RunResult {
  meta?: { changes?: number; rows_written?: number };
  changes?: number;
}

function getChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as RunResult;
  if (typeof r.changes === 'number') return r.changes;
  if (r.meta && typeof r.meta.changes === 'number') return r.meta.changes;
  if (r.meta && typeof r.meta.rows_written === 'number') return r.meta.rows_written;
  return 0;
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new UsersRepoError(
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
    throw new UsersRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new UsersRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new UsersRepoError('invalid_input', 'malformed cursor');
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
    throw new UsersRepoError('invalid_input', 'malformed cursor');
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
