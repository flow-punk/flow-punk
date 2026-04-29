/**
 * Deals repository — indie base CRM entity.
 *
 * Functional style (matches indie/packages/db/src/repositories/persons.ts).
 * Throws `DealsRepoError` for caller-actionable failures; handlers map via
 * `mapRepoError` in the pipeline service.
 *
 * Key invariants:
 * - `pipeline_id` is immutable on PATCH. Patching it is rejected as
 *   `invalid_input` (the IMMUTABLE_PATCH_FIELDS guard catches it before
 *   the write).
 * - `stage_id` is patchable. The transition is performed by a single
 *   conditional UPDATE that asserts the target stage is active AND in
 *   the deal's current pipeline. Zero affected rows + the deal exists
 *   = `invalid_input` ("stage not active or in different pipeline").
 *   This is the atomicity Codex flagged: pre-check + write would race
 *   against a concurrent stage soft-delete.
 * - `stage_entered_at` is server-managed: set on create, and reset on
 *   any stage_id change. PATCH bodies cannot supply it (immutable).
 * - `account_id` and `primary_person_id` carry the same TOCTOU window
 *   documented in `repositories/persons.ts:374-388`. The pre-check is
 *   defense in depth; the SQLite FK is the floor.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import { accounts } from '../schema/accounts.js';
import {
  ALLOWED_PATCH_FIELDS,
  NULLABLE_PATCH_FIELDS,
  deals,
  isAllowedPatchField,
  isImmutablePatchField,
  type Deal,
  type DealPatchableField,
  type NewDeal,
} from '../schema/deals.js';
import { persons } from '../schema/persons.js';
import { pipelines } from '../schema/pipelines.js';
import { stages } from '../schema/stages.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class DealsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'DealsRepoError';
  }
}

const DEAL_ID_REGEX = /^del_[a-z0-9]{21}$/;
const PIPELINE_ID_REGEX = /^pl_[a-z0-9]{21}$/;
const STAGE_ID_REGEX = /^stg_[a-z0-9]{21}$/;
const ACCOUNT_ID_REGEX = /^acct_[a-z0-9]{21}$/;
const PERSON_ID_REGEX = /^per_[a-z0-9]{21}$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

const NAME_MIN = 1;
const NAME_MAX = 256;
const LOST_REASON_MAX = 512;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CreateDealInput {
  name: string;
  pipelineId: string;
  stageId: string;
  accountId?: string | null;
  primaryPersonId?: string | null;
  amount?: number | null;
  currency?: string | null;
  expectedCloseDate?: string | null;
  probability?: number | null;
  ownerUserId?: string | null;
  lostReason?: string | null;
}

export type UpdateDealPatch = Partial<{
  [K in DealPatchableField]: Deal[K] | null;
}>;

export interface ListOptions {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
  pipelineId?: string;
  stageId?: string;
  accountId?: string;
  primaryPersonId?: string;
  ownerUserId?: string;
}

export interface ListResult {
  items: Deal[];
  nextCursor: string | null;
}

export interface UpdateResult {
  deal: Deal;
  fieldsChanged: DealPatchableField[];
}

export async function create(
  db: Db,
  input: CreateDealInput,
  actorId: string,
  now: string,
): Promise<Deal> {
  const normalized = validateCreate(input);

  // Pipeline + stage compatibility: one read covers both.
  await assertStageInActivePipeline(
    db,
    normalized.stageId,
    normalized.pipelineId,
  );

  if (normalized.accountId) {
    await assertAccountActive(db, normalized.accountId);
  }
  if (normalized.primaryPersonId) {
    await assertPersonActive(db, normalized.primaryPersonId);
  }

  const row: NewDeal = {
    id: generateId('del'),
    name: normalized.name,
    pipelineId: normalized.pipelineId,
    stageId: normalized.stageId,
    stageEnteredAt: now,
    accountId: normalized.accountId ?? null,
    primaryPersonId: normalized.primaryPersonId ?? null,
    amount: normalized.amount ?? null,
    currency: normalized.currency ?? null,
    expectedCloseDate: normalized.expectedCloseDate ?? null,
    probability: normalized.probability ?? null,
    ownerUserId: normalized.ownerUserId ?? null,
    lostReason: normalized.lostReason ?? null,
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  const inserted = await db.insert(deals).values(row).returning();
  const deal = inserted[0];
  if (!deal) {
    throw new DealsRepoError('invariant_violation', 'insert returned no row');
  }
  return deal;
}

export async function findById(
  db: Db,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Deal | null> {
  const rows = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!options.includeDeleted && row.status !== 'active') return null;
  return row;
}

export async function list(db: Db, options: ListOptions = {}): Promise<ListResult> {
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters = [];
  if (!options.includeDeleted) filters.push(eq(deals.status, 'active'));

  if (options.pipelineId !== undefined) {
    if (!PIPELINE_ID_REGEX.test(options.pipelineId)) {
      throw new DealsRepoError(
        'invalid_input',
        'pipelineId must match "pl_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(deals.pipelineId, options.pipelineId));
  }
  if (options.stageId !== undefined) {
    if (!STAGE_ID_REGEX.test(options.stageId)) {
      throw new DealsRepoError(
        'invalid_input',
        'stageId must match "stg_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(deals.stageId, options.stageId));
  }
  if (options.accountId !== undefined) {
    if (!ACCOUNT_ID_REGEX.test(options.accountId)) {
      throw new DealsRepoError(
        'invalid_input',
        'accountId must match "acct_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(deals.accountId, options.accountId));
  }
  if (options.primaryPersonId !== undefined) {
    if (!PERSON_ID_REGEX.test(options.primaryPersonId)) {
      throw new DealsRepoError(
        'invalid_input',
        'primaryPersonId must match "per_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(deals.primaryPersonId, options.primaryPersonId));
  }
  if (options.ownerUserId !== undefined) {
    filters.push(eq(deals.ownerUserId, options.ownerUserId));
  }

  if (cursor) {
    filters.push(
      or(
        lt(deals.createdAt, cursor.createdAt),
        and(eq(deals.createdAt, cursor.createdAt), lt(deals.id, cursor.id)),
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
    .from(deals)
    .where(where as any)
    .orderBy(desc(deals.createdAt), desc(deals.id))
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

/**
 * Update a deal. Stage transitions are atomic: when the patch contains
 * `stageId` and it differs from the current stage, a single conditional
 * UPDATE asserts the target stage is active AND in the deal's current
 * pipeline; `stage_entered_at` is reset to `now` in the same statement.
 *
 * Other fields use the standard partial update; `pipelineId` is rejected
 * as immutable, `stageEnteredAt` cannot be patched directly.
 */
export async function update(
  db: Db,
  id: string,
  patch: UpdateDealPatch,
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  if (!DEAL_ID_REGEX.test(id)) {
    throw new DealsRepoError(
      'invalid_input',
      'deal id must match "del_<21 lowercase alphanumeric>"',
    );
  }

  for (const key of Object.keys(patch)) {
    if (isImmutablePatchField(key)) {
      throw new DealsRepoError(
        'invalid_input',
        `field "${key}" is immutable`,
      );
    }
    if (!isAllowedPatchField(key)) {
      throw new DealsRepoError(
        'invalid_input',
        `field "${key}" is not patchable`,
      );
    }
  }

  const changes: Partial<Record<DealPatchableField, unknown>> = {};
  const fieldsChanged: DealPatchableField[] = [];

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) {
      if (!NULLABLE_PATCH_FIELDS.has(field)) {
        throw new DealsRepoError(
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
      throw new DealsRepoError('not_found', `deal "${id}" not found`);
    }
    return { deal: current, fieldsChanged: [] };
  }

  // Optional-parent active pre-checks (TOCTOU acknowledged — see file header).
  if ('accountId' in changes && typeof changes.accountId === 'string') {
    await assertAccountActive(db, changes.accountId);
  }
  if (
    'primaryPersonId' in changes &&
    typeof changes.primaryPersonId === 'string'
  ) {
    await assertPersonActive(db, changes.primaryPersonId);
  }

  // Stage transition path: handled atomically by a conditional UPDATE.
  if ('stageId' in changes && typeof changes.stageId === 'string') {
    return await applyStageTransition(
      db,
      id,
      changes,
      fieldsChanged,
      actorId,
      now,
    );
  }

  // Non-transition path: standard active-row UPDATE.
  const updated = await db
    .update(deals)
    .set({ ...changes, updatedAt: now, updatedBy: actorId } as any)
    .where(and(eq(deals.id, id), eq(deals.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select({ status: deals.status })
      .from(deals)
      .where(eq(deals.id, id))
      .limit(1);
    if (existing[0]) {
      throw new DealsRepoError('wrong_state', `deal "${id}" is not active`);
    }
    throw new DealsRepoError('not_found', `deal "${id}" not found`);
  }

  return { deal: row, fieldsChanged };
}

export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
): Promise<Deal> {
  const updated = await db
    .update(deals)
    .set({
      status: 'deleted',
      deletedAt: now,
      deletedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    })
    .where(and(eq(deals.id, id), eq(deals.status, 'active')))
    .returning();

  const row = updated[0];
  if (!row) {
    const existing = await db
      .select({ status: deals.status })
      .from(deals)
      .where(eq(deals.id, id))
      .limit(1);
    if (existing[0]) {
      throw new DealsRepoError(
        'wrong_state',
        `deal "${id}" is already deleted`,
      );
    }
    throw new DealsRepoError('not_found', `deal "${id}" not found`);
  }
  return row;
}

// ---------- stage transition ----------

/**
 * Apply a deal update that includes a stage transition. The conditional
 * UPDATE asserts the target stage is active AND belongs to the deal's
 * current pipeline (matched via the deal's own `pipeline_id` column).
 * `stage_entered_at` is reset to `now` only when `stage_id` actually
 * differs from the current value (guarded by `stage_id != ?` in the
 * WHERE clause; if the patch sets the same stage, the UPDATE still runs
 * to apply other patch fields but `stage_entered_at` is preserved).
 *
 * Two passes: first try the "stage actually changes" path with the
 * transition guard + new stage_entered_at; if zero affected and the deal
 * exists active, the transition guard failed (target stage not in same
 * pipeline / not active). If the deal exists but the target equals the
 * current, fall through to the no-op path which keeps stage_entered_at.
 */
async function applyStageTransition(
  db: Db,
  id: string,
  changes: Partial<Record<DealPatchableField, unknown>>,
  fieldsChanged: DealPatchableField[],
  actorId: string,
  now: string,
): Promise<UpdateResult> {
  const targetStageId = changes.stageId as string;

  // Atomic transition: requires deal active, target stage active and in
  // deal's pipeline, AND target differs from current. Includes all other
  // patch fields in the same SET to keep the update single-statement.
  const otherChanges = { ...changes };
  delete otherChanges.stageId;

  const transitioned = await db
    .update(deals)
    .set({
      ...otherChanges,
      stageId: targetStageId,
      stageEnteredAt: now,
      updatedAt: now,
      updatedBy: actorId,
    } as any)
    .where(
      and(
        eq(deals.id, id),
        eq(deals.status, 'active'),
        sql`${deals.stageId} != ${targetStageId}`,
        sql`EXISTS (SELECT 1 FROM stages WHERE id = ${targetStageId} AND status = 'active' AND pipeline_id = ${deals.pipelineId})`,
      ),
    )
    .returning();

  if (transitioned[0]) {
    return { deal: transitioned[0], fieldsChanged };
  }

  // The transition UPDATE matched zero rows. Disambiguate.
  const current = await db
    .select({ status: deals.status, stageId: deals.stageId })
    .from(deals)
    .where(eq(deals.id, id))
    .limit(1);

  const currentRow = current[0];
  if (!currentRow) {
    throw new DealsRepoError('not_found', `deal "${id}" not found`);
  }
  if (currentRow.status !== 'active') {
    throw new DealsRepoError('wrong_state', `deal "${id}" is not active`);
  }

  if (currentRow.stageId === targetStageId) {
    // Same-stage update — preserve stage_entered_at, apply remaining patch.
    // Guard `stage_id = targetStageId` so a concurrent transition between
    // the disambiguation read and this write cannot land otherChanges on a
    // moved deal while we report `fieldsChanged: []` for stageId.
    const updated = await db
      .update(deals)
      .set({
        ...otherChanges,
        updatedAt: now,
        updatedBy: actorId,
      } as any)
      .where(
        and(
          eq(deals.id, id),
          eq(deals.status, 'active'),
          eq(deals.stageId, targetStageId),
        ),
      )
      .returning();
    const row = updated[0];
    if (!row) {
      // The deal's stage changed between our read and write (or it was
      // soft-deleted). Surface as wrong_state so the caller retries — a
      // retry runs the transition guard cleanly.
      throw new DealsRepoError(
        'wrong_state',
        `deal "${id}" stage changed concurrently — retry`,
      );
    }
    // Drop stageId from fieldsChanged since it didn't actually change.
    const filtered = fieldsChanged.filter((f) => f !== 'stageId');
    return { deal: row, fieldsChanged: filtered };
  }

  // Different stage but the EXISTS guard failed: stage missing/deleted/
  // wrong pipeline. Surface as invalid_input.
  throw new DealsRepoError(
    'invalid_input',
    `stage "${targetStageId}" is not active or does not belong to deal's pipeline`,
  );
}

// ---------- pre-checks ----------

/**
 * Verify the (stageId, pipelineId) pair refers to an active stage in the
 * specified active pipeline. Used on create. TOCTOU window vs. concurrent
 * stage soft-delete acknowledged — same posture as
 * `repositories/persons.ts:374-388`. Stage-level cascade-block guards the
 * other direction (soft-deleting a stage with active deals is rejected
 * atomically).
 */
async function assertStageInActivePipeline(
  db: Db,
  stageId: string,
  pipelineId: string,
): Promise<void> {
  const rows = await db
    .select({
      stageStatus: stages.status,
      stagePipelineId: stages.pipelineId,
      pipelineStatus: pipelines.status,
    })
    .from(stages)
    .leftJoin(pipelines, eq(pipelines.id, stages.pipelineId))
    .where(eq(stages.id, stageId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new DealsRepoError(
      'invalid_input',
      `stage "${stageId}" not found (stage_not_found)`,
    );
  }
  if (row.stageStatus !== 'active') {
    throw new DealsRepoError(
      'invalid_input',
      `stage "${stageId}" is not active (stage_not_active)`,
    );
  }
  if (row.stagePipelineId !== pipelineId) {
    throw new DealsRepoError(
      'invalid_input',
      `stage "${stageId}" does not belong to pipeline "${pipelineId}" (stage_pipeline_mismatch)`,
    );
  }
  if (row.pipelineStatus !== 'active') {
    throw new DealsRepoError(
      'invalid_input',
      `pipeline "${pipelineId}" is not active (pipeline_not_active)`,
    );
  }
}

async function assertAccountActive(db: Db, accountId: string): Promise<void> {
  const rows = await db
    .select({ status: accounts.status })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new DealsRepoError(
      'invalid_input',
      `account "${accountId}" not found (account_not_found)`,
    );
  }
  if (row.status !== 'active') {
    throw new DealsRepoError(
      'invalid_input',
      `account "${accountId}" is not active (account_not_active)`,
    );
  }
}

async function assertPersonActive(db: Db, personId: string): Promise<void> {
  const rows = await db
    .select({ status: persons.status })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new DealsRepoError(
      'invalid_input',
      `person "${personId}" not found (person_not_found)`,
    );
  }
  if (row.status !== 'active') {
    throw new DealsRepoError(
      'invalid_input',
      `person "${personId}" is not active (person_not_active)`,
    );
  }
}

// ---------- validation / normalization ----------

interface NormalizedCreate extends CreateDealInput {
  name: string;
  pipelineId: string;
  stageId: string;
}

function validateCreate(input: CreateDealInput): NormalizedCreate {
  if (typeof input.name !== 'string') {
    throw new DealsRepoError('invalid_input', 'name must be a string');
  }
  const name = input.name.trim();
  validateName(name);

  if (typeof input.pipelineId !== 'string' || !PIPELINE_ID_REGEX.test(input.pipelineId)) {
    throw new DealsRepoError(
      'invalid_input',
      'pipelineId must match "pl_<21 lowercase alphanumeric>"',
    );
  }
  if (typeof input.stageId !== 'string' || !STAGE_ID_REGEX.test(input.stageId)) {
    throw new DealsRepoError(
      'invalid_input',
      'stageId must match "stg_<21 lowercase alphanumeric>"',
    );
  }

  const out: NormalizedCreate = {
    name,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
  };

  for (const field of ALLOWED_PATCH_FIELDS) {
    if (field === 'name' || field === 'stageId') continue;
    const inputRecord = input as unknown as Record<string, unknown>;
    if (!(field in inputRecord)) continue;
    const value = inputRecord[field];
    if (value === undefined || value === null) {
      (out as unknown as Record<string, unknown>)[field] = null;
      continue;
    }
    validateField(field, value);
    (out as unknown as Record<string, unknown>)[field] = normalizeField(
      field,
      value,
    );
  }
  return out;
}

function validateField(field: DealPatchableField, value: unknown): void {
  switch (field) {
    case 'name':
      if (typeof value !== 'string') {
        throw new DealsRepoError('invalid_input', 'name must be a string');
      }
      validateName(value.trim());
      return;
    case 'stageId':
      if (typeof value !== 'string' || !STAGE_ID_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'stageId must match "stg_<21 lowercase alphanumeric>"',
        );
      }
      return;
    case 'accountId':
      if (typeof value !== 'string' || !ACCOUNT_ID_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'accountId must match "acct_<21 lowercase alphanumeric>"',
        );
      }
      return;
    case 'primaryPersonId':
      if (typeof value !== 'string' || !PERSON_ID_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'primaryPersonId must match "per_<21 lowercase alphanumeric>"',
        );
      }
      return;
    case 'amount':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new DealsRepoError(
          'invalid_input',
          'amount must be a non-negative number',
        );
      }
      return;
    case 'currency':
      if (typeof value !== 'string' || !CURRENCY_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'currency must be ISO 4217 alpha-3 (e.g. "USD")',
        );
      }
      return;
    case 'expectedCloseDate':
      if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'expectedCloseDate must be ISO date "YYYY-MM-DD"',
        );
      }
      return;
    case 'probability':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      ) {
        throw new DealsRepoError(
          'invalid_input',
          'probability must be a number in [0, 100]',
        );
      }
      return;
    case 'ownerUserId':
      if (typeof value !== 'string' || !USER_ID_REGEX.test(value)) {
        throw new DealsRepoError(
          'invalid_input',
          'ownerUserId must be 1-64 chars [A-Za-z0-9_-]',
        );
      }
      return;
    case 'lostReason':
      if (typeof value !== 'string') {
        throw new DealsRepoError(
          'invalid_input',
          'lostReason must be a string',
        );
      }
      if (value.length > LOST_REASON_MAX) {
        throw new DealsRepoError(
          'invalid_input',
          `lostReason must be ≤ ${LOST_REASON_MAX} characters`,
        );
      }
      return;
  }
}

function normalizeField(field: DealPatchableField, value: unknown): unknown {
  if (field === 'name' && typeof value === 'string') return value.trim();
  if (field === 'currency' && typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  if (field === 'lostReason' && typeof value === 'string') return value.trim();
  return value;
}

function validateName(value: string): void {
  if (value.length < NAME_MIN || value.length > NAME_MAX) {
    throw new DealsRepoError(
      'invalid_input',
      `name must be ${NAME_MIN}-${NAME_MAX} characters`,
    );
  }
}

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new DealsRepoError(
      'invalid_input',
      'limit must be a positive integer',
    );
  }
  return Math.min(raw, MAX_LIMIT);
}

// ---------- cursor (createdAt, id) ----------

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
    throw new DealsRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DealsRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new DealsRepoError('invalid_input', 'malformed cursor');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.createdAt !== 'string' || typeof obj.id !== 'string') {
    throw new DealsRepoError('invalid_input', 'malformed cursor');
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
