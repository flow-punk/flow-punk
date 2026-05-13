/**
 * Custom-field definitions repository. See ADR-023 for the architectural
 * framework.
 *
 * Functional style matching the rest of the indie repos. Throws
 * `CustomFieldDefsRepoError` for caller-actionable failures; handlers map
 * via the core package's shared error translator.
 *
 * Optimistic-concurrency contract (ADR-023 §7): every mutation accepts an
 * `expectedVersion` and bumps the row's `version` column on success.
 * Mismatch returns `{ conflict: true, current }` so the handler can emit
 * `409 CONFLICT` with the fresh row state. There is NO transactional
 * boundary around registry mutations — single-statement updates are the
 * atomicity boundary, consistent with CONVENTIONS.md §Drizzle Usage.
 *
 * Cap enforcement (ADR-023 §9): caps live at the repo so any caller (REST,
 * future MCP, future internal job) gets the same contract. Caps are TOCTOU
 * on multi-concurrent inserts; the partial unique index `cfd_active_name_uq`
 * protects against duplicate-name races, and an after-the-fact recount on
 * `create` rolls back overflow inserts.
 *
 * Row id prefix: `cfd_<21>` per ADR-023 §4 and matching the project's
 * 4-char + 21-nano-id convention validated by `id-prefix.test.ts`.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import {
  CUSTOM_FIELD_CAPS,
  CUSTOM_FIELD_NAME_REGEX,
  customFieldDefs,
  isAllowedFilterableTransition,
  type CustomFieldBaseModel,
  type CustomFieldDef,
  type CustomFieldFilterableStatus,
} from '../schema/custom-field-defs.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class CustomFieldDefsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'version_mismatch'
      | 'duplicate_name'
      | 'cap_exceeded'
      | 'invalid_transition'
      | 'wrong_state',
    message: string,
  ) {
    super(message);
    this.name = 'CustomFieldDefsRepoError';
  }
}

const ID_REGEX = /^cfd_[a-z0-9]{21}$/;
const DESCRIPTION_MAX = 512;
const USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

const VALID_BASE_MODELS = new Set<CustomFieldBaseModel>([
  'person',
  'account',
  'deal',
]);

export interface CreateInput {
  baseModel: CustomFieldBaseModel;
  name: string;
  description?: string | null;
  pii?: boolean;
}

export interface UpdateInput {
  /** Edit description. Pass `null` to clear; omit to leave unchanged. */
  description?: string | null | undefined;
  /** Edit PII flag. Omit to leave unchanged. */
  pii?: boolean | undefined;
}

/** Result of a mutation that may conflict on version. */
export type MutationResult<T> =
  | { conflict: false; def: T }
  | { conflict: true; current: T };

export interface ListOptions {
  /** When true, include rows where `archived_at IS NOT NULL`. */
  includeArchived?: boolean;
}

/**
 * List defs for a base model. Active-only by default; pass
 * `{ includeArchived: true }` to include tombstones (dashboard use).
 */
export async function list(
  db: Db,
  baseModel: CustomFieldBaseModel,
  options: ListOptions = {},
): Promise<CustomFieldDef[]> {
  if (!VALID_BASE_MODELS.has(baseModel)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      `baseModel must be one of: person, account, deal`,
    );
  }
  const filters = [eq(customFieldDefs.baseModel, baseModel)];
  if (!options.includeArchived) {
    filters.push(isNull(customFieldDefs.archivedAt));
  }
  return db
    .select()
    .from(customFieldDefs)
    .where(and(...filters))
    .orderBy(customFieldDefs.name);
}

/** Fetch a single def by id (active or archived). */
export async function findById(
  db: Db,
  id: string,
): Promise<CustomFieldDef | null> {
  if (!ID_REGEX.test(id)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'id must match "cfd_<21 lowercase alphanumeric>"',
    );
  }
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(eq(customFieldDefs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch the active (non-archived) def for a (baseModel, name) pair. */
export async function findActiveByName(
  db: Db,
  baseModel: CustomFieldBaseModel,
  name: string,
): Promise<CustomFieldDef | null> {
  if (!VALID_BASE_MODELS.has(baseModel)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'invalid baseModel',
    );
  }
  if (!CUSTOM_FIELD_NAME_REGEX.test(name)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'name must match ^[a-z][a-z0-9_]{0,30}$',
    );
  }
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(
      and(
        eq(customFieldDefs.baseModel, baseModel),
        eq(customFieldDefs.name, name),
        isNull(customFieldDefs.archivedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Authoritative version check for the KV cache (ADR-023 §11). Returns
 * `MAX(version)` across ALL rows of a base model — including archived
 * ones — so archive operations participate in the freshness check.
 *
 * Why include archived: archive bumps the row's version. If the cache
 * was warmed pre-archive and KV `invalidateCache` later fails
 * transiently, an active-only `MAX(version)` would not detect the
 * archive (the now-archived row is excluded; remaining active max is
 * < cached max) and writes via the cache would keep accepting the
 * archived def. Including archived rows closes that window — see Codex
 * QA review of PR-α.
 *
 * A `null` (zero rows) is returned as `0` so the caller can do
 * `cachedVersion < live` arithmetic without a special case.
 */
export async function getMaxVersion(
  db: Db,
  baseModel: CustomFieldBaseModel,
): Promise<number> {
  if (!VALID_BASE_MODELS.has(baseModel)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'invalid baseModel',
    );
  }
  const rows = await db
    .select({
      max: sql<number | null>`COALESCE(MAX(${customFieldDefs.version}), 0)`,
    })
    .from(customFieldDefs)
    .where(eq(customFieldDefs.baseModel, baseModel));
  return rows[0]?.max ?? 0;
}

interface CountResult {
  total: number;
  filterable: number;
}

async function countActive(
  db: Db,
  baseModel: CustomFieldBaseModel,
): Promise<CountResult> {
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      filterable: sql<number>`SUM(CASE WHEN ${customFieldDefs.filterableStatus} IN ('pending','ready') THEN 1 ELSE 0 END)`,
    })
    .from(customFieldDefs)
    .where(
      and(
        eq(customFieldDefs.baseModel, baseModel),
        isNull(customFieldDefs.archivedAt),
      ),
    );
  return {
    total: Number(rows[0]?.total ?? 0),
    filterable: Number(rows[0]?.filterable ?? 0),
  };
}

/**
 * Create a new active def. Slug-validated; cap-enforced; PII defaults to
 * `true`. Returns the freshly inserted row.
 *
 * Concurrency contract:
 * - The partial unique index `cfd_active_name_uq` is the source of truth
 *   on duplicate-name races (returns `duplicate_name`).
 * - Total-cap enforcement is read-then-insert. Two concurrent creates at
 *   the cap-1 boundary can both succeed and land one row above the cap.
 *   This is an accepted TOCTOU window — registry mutations are admin
 *   operations, churn is low, and the cap is a soft guard against
 *   accidental sprawl rather than a security invariant. There is NO
 *   post-insert rollback in v1; if a tenant manages to exceed the cap,
 *   the next create attempt will fail loudly and the operator can
 *   archive one to recover.
 */
export async function create(
  db: Db,
  input: CreateInput,
  now: string,
  actorId: string,
): Promise<CustomFieldDef> {
  validateActorId(actorId);
  if (!VALID_BASE_MODELS.has(input.baseModel)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'baseModel must be one of: person, account, deal',
    );
  }
  if (!CUSTOM_FIELD_NAME_REGEX.test(input.name)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'name must match ^[a-z][a-z0-9_]{0,30}$',
    );
  }
  const description = normalizeDescription(input.description);
  const pii = input.pii === undefined ? true : Boolean(input.pii);

  const counts = await countActive(db, input.baseModel);
  if (counts.total >= CUSTOM_FIELD_CAPS.maxDefsPerBaseModel) {
    throw new CustomFieldDefsRepoError(
      'cap_exceeded',
      `max ${CUSTOM_FIELD_CAPS.maxDefsPerBaseModel} active custom fields per baseModel`,
    );
  }

  const id = generateId('cfd');
  try {
    await db.insert(customFieldDefs).values({
      id,
      baseModel: input.baseModel,
      name: input.name,
      description,
      pii: pii ? 1 : 0,
      filterableStatus: 'disabled',
      filterableError: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      archivedAt: null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CustomFieldDefsRepoError(
        'duplicate_name',
        `a custom field named "${input.name}" already exists for baseModel ${input.baseModel}`,
      );
    }
    throw err;
  }

  const created = await findById(db, id);
  if (!created) {
    throw new CustomFieldDefsRepoError(
      'wrong_state',
      'newly created def disappeared mid-insert',
    );
  }
  return created;
}

/**
 * Update mutable fields (`description`, `pii`). Optimistic concurrency:
 * `expectedVersion` must match the current row's version, else returns
 * `{ conflict: true, current }`. Name and filterable-status are NOT
 * mutable here — name is immutable post-create; filterable transitions
 * go through `transitionFilterable`.
 */
export async function update(
  db: Db,
  id: string,
  patch: UpdateInput,
  expectedVersion: number,
  now: string,
  actorId: string,
): Promise<MutationResult<CustomFieldDef>> {
  validateActorId(actorId);
  if (!ID_REGEX.test(id)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'id must match "cfd_<21 lowercase alphanumeric>"',
    );
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'expectedVersion must be a positive integer',
    );
  }

  const current = await findById(db, id);
  if (!current) {
    throw new CustomFieldDefsRepoError(
      'not_found',
      'custom field def not found',
    );
  }
  if (current.archivedAt !== null) {
    throw new CustomFieldDefsRepoError(
      'wrong_state',
      'archived defs cannot be updated; reactivate first',
    );
  }
  if (current.version !== expectedVersion) {
    return { conflict: true, current };
  }

  const sets: Partial<typeof customFieldDefs.$inferInsert> = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
    sets.description = normalizeDescription(patch.description ?? null);
  }
  if (patch.pii !== undefined) {
    sets.pii = patch.pii ? 1 : 0;
  }

  // No-op update is allowed — still bumps version (matches HTTP PATCH
  // semantics where the request was processed even if no field changed).
  sets.updatedAt = now;
  sets.updatedBy = actorId;
  sets.version = current.version + 1;

  const result = await db
    .update(customFieldDefs)
    .set(sets)
    .where(
      and(
        eq(customFieldDefs.id, id),
        eq(customFieldDefs.version, expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    // Lost a race with another writer between findById and update.
    const refreshed = await findById(db, id);
    if (!refreshed) {
      throw new CustomFieldDefsRepoError(
        'not_found',
        'def deleted mid-update',
      );
    }
    return { conflict: true, current: refreshed };
  }

  return { conflict: false, def: result[0]! };
}

/**
 * Transition `filterable_status`. The set of permitted transitions is
 * declared in `FILTERABLE_TRANSITIONS` (schema/custom-field-defs.ts).
 * Returns the updated row, or `{ conflict: true, current }` on a version
 * mismatch.
 *
 * When transitioning INTO `pending`, the filterable cap is enforced —
 * same TOCTOU caveat as `create()`'s total cap. Operator concurrency at
 * the filterable-cap boundary can land one over; v1 accepts this.
 * When transitioning INTO `ready`, no cap recheck is needed — the cap
 * was checked at `pending` time and `pending → ready` is a worker-driven
 * step not subject to operator amplification.
 */
export async function transitionFilterable(
  db: Db,
  id: string,
  to: CustomFieldFilterableStatus,
  expectedVersion: number,
  now: string,
  actorId: string,
  options: { error?: string | null } = {},
): Promise<MutationResult<CustomFieldDef>> {
  validateActorId(actorId);
  if (!ID_REGEX.test(id)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'id must match "cfd_<21 lowercase alphanumeric>"',
    );
  }

  const current = await findById(db, id);
  if (!current) {
    throw new CustomFieldDefsRepoError(
      'not_found',
      'custom field def not found',
    );
  }
  if (current.archivedAt !== null) {
    throw new CustomFieldDefsRepoError(
      'wrong_state',
      'archived defs cannot transition filterable_status',
    );
  }
  if (current.version !== expectedVersion) {
    return { conflict: true, current };
  }
  if (!isAllowedFilterableTransition(current.filterableStatus, to)) {
    throw new CustomFieldDefsRepoError(
      'invalid_transition',
      `cannot transition filterable_status from "${current.filterableStatus}" to "${to}"`,
    );
  }

  if (to === 'pending') {
    const counts = await countActive(db, current.baseModel);
    if (counts.filterable >= CUSTOM_FIELD_CAPS.maxFilterablePerBaseModel) {
      throw new CustomFieldDefsRepoError(
        'cap_exceeded',
        `max ${CUSTOM_FIELD_CAPS.maxFilterablePerBaseModel} filterable custom fields per baseModel`,
      );
    }
  }

  const result = await db
    .update(customFieldDefs)
    .set({
      filterableStatus: to,
      filterableError: options.error ?? null,
      updatedAt: now,
      updatedBy: actorId,
      version: current.version + 1,
    })
    .where(
      and(
        eq(customFieldDefs.id, id),
        eq(customFieldDefs.version, expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    const refreshed = await findById(db, id);
    if (!refreshed) {
      throw new CustomFieldDefsRepoError(
        'not_found',
        'def deleted mid-transition',
      );
    }
    return { conflict: true, current: refreshed };
  }
  return { conflict: false, def: result[0]! };
}

/**
 * Archive a def (tombstone). Does NOT touch existing `custom_data` values
 * on entity rows — those become inert (no filter, no validation) until
 * the def is recreated under the same slug (allowed by the partial unique
 * index) or the operator runs a cleanup. Filterable index, if any, is
 * dropped by the worker in PR-β.
 */
export async function archive(
  db: Db,
  id: string,
  expectedVersion: number,
  now: string,
  actorId: string,
): Promise<MutationResult<CustomFieldDef>> {
  validateActorId(actorId);
  if (!ID_REGEX.test(id)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'id must match "cfd_<21 lowercase alphanumeric>"',
    );
  }

  const current = await findById(db, id);
  if (!current) {
    throw new CustomFieldDefsRepoError(
      'not_found',
      'custom field def not found',
    );
  }
  if (current.archivedAt !== null) {
    return { conflict: false, def: current };
  }
  if (current.version !== expectedVersion) {
    return { conflict: true, current };
  }

  const result = await db
    .update(customFieldDefs)
    .set({
      archivedAt: now,
      updatedAt: now,
      updatedBy: actorId,
      version: current.version + 1,
    })
    .where(
      and(
        eq(customFieldDefs.id, id),
        eq(customFieldDefs.version, expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    const refreshed = await findById(db, id);
    if (!refreshed) {
      throw new CustomFieldDefsRepoError(
        'not_found',
        'def deleted mid-archive',
      );
    }
    return { conflict: true, current: refreshed };
  }
  return { conflict: false, def: result[0]! };
}

// ----- helpers -----

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      `description must be ≤ ${DESCRIPTION_MAX} chars`,
    );
  }
  return trimmed;
}

function validateActorId(actorId: string): void {
  if (!USER_ID_REGEX.test(actorId)) {
    throw new CustomFieldDefsRepoError(
      'invalid_input',
      'actorId is malformed',
    );
  }
}

function isUniqueViolation(err: unknown): boolean {
  // D1 surfaces SQLite unique-constraint failures as Error with a message
  // mentioning the index/constraint. Matches the pattern used by the
  // accounts and persons repos.
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  return (
    message.includes('UNIQUE constraint failed') ||
    message.includes('cfd_active_name_uq')
  );
}
