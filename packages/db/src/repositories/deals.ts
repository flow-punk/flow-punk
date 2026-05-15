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
import { dealHistory } from '../schema/deal-history.js';
import type {
  DealHistoryChangeEntry,
  DealHistoryCredentialType,
} from '../schema/deal-history.js';
import { persons } from '../schema/persons.js';
import { pipelines } from '../schema/pipelines.js';
import { stages } from '../schema/stages.js';
import {
  serializeCreated,
  serializeStageMoved,
  serializeUpdated,
} from './deal-history-serialize.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class DealsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'conflict'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'DealsRepoError';
  }
}

/**
 * Per-call configuration for history co-emission (ADR-022).
 *
 * When `recordHistory` is `true`, every successful mutation co-writes a
 * `deal_history` row in the same `db.batch()` as the underlying deal write,
 * using a predicate-mirrored `INSERT INTO ... SELECT ... WHERE EXISTS (...)`
 * so failed mutations do not leak orphan history rows (ADR-022 §7).
 *
 * Managed sets `recordHistory: false` for v1 because
 * `TenantRouterD1Proxy.batch()` throws (ADR-001 §"managed batch
 * unsupported" / ADR-022 §14). In that mode the repo issues single-
 * statement INSERT/UPDATE and skips history entirely — managed deal
 * mutations behave exactly as they did before this ADR.
 *
 * `credentialType` is the actor's canonical `audit-events` credential type
 * (`apikey | oauth | session | system`). Pipeline-core wraps the actor's
 * `IdentityHeaderValues['credentialType']` directly into this field.
 */
export interface HistoryEmitOptions {
  recordHistory: boolean;
  credentialType: DealHistoryCredentialType;
}

const DEAL_ID_REGEX = /^deal_[a-z0-9]{21}$/;
const PIPELINE_ID_REGEX = /^pipe_[a-z0-9]{21}$/;
const STAGE_ID_REGEX = /^stag_[a-z0-9]{21}$/;
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
  historyOpts: HistoryEmitOptions,
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
    id: generateId('deal'),
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

  // Reify the inserted Deal locally — we trust the inserted values rather
  // than round-tripping a SELECT RETURNING, so the `create` path remains a
  // single batched write on indie and a single INSERT on managed.
  const deal: Deal = {
    id: row.id!,
    name: row.name,
    pipelineId: row.pipelineId,
    stageId: row.stageId,
    stageEnteredAt: row.stageEnteredAt!,
    accountId: row.accountId ?? null,
    primaryPersonId: row.primaryPersonId ?? null,
    amount: row.amount ?? null,
    currency: row.currency ?? null,
    expectedCloseDate: row.expectedCloseDate ?? null,
    probability: row.probability ?? null,
    ownerUserId: row.ownerUserId ?? null,
    lostReason: row.lostReason ?? null,
    status: 'active',
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };

  if (!historyOpts.recordHistory) {
    // Managed path: no batch() call (TenantRouterD1Proxy.batch() throws).
    await db.insert(deals).values(row);
    return deal;
  }

  // Indie path: batch the deal INSERT with a predicate-mirrored history
  // INSERT. The history INSERT uses `INSERT ... SELECT FROM deals WHERE
  // <witness>` — semantically equivalent to `INSERT ... SELECT :literals
  // WHERE EXISTS (SELECT 1 FROM deals WHERE <witness>)`: if the witness
  // matches one row in `deals`, SELECT yields one row of literals and
  // INSERT lands; if it matches zero rows, INSERT no-ops. The witness
  // (`created_at = :now AND created_by = :actorId`) only holds after the
  // first statement commits the deal row — so on any rollback (FK
  // violation, etc.) the history INSERT no-ops automatically.
  //
  // Note: Drizzle's `db.batch()` is invoked with query builder objects
  // (`db.insert(...).values(...)` and `db.insert(...).select(qb => ...)`).
  // Raw `db.run(sql\`...\`)` is NOT a valid BatchItem in drizzle 0.36 —
  // it returns an eager Promise rather than a deferred prepared
  // statement, and the D1 driver errors with "Cannot read properties of
  // undefined (reading 'bind')" when iterating the batch.
  const historyId = generateId('dhx');
  const changesJson = serializeCreated(deal);
  await db.batch([
    db.insert(deals).values(row),
    db.insert(dealHistory).select((qb) =>
      qb
        .select({
          id: sql<string>`${historyId}`.as('id'),
          dealId: sql<string>`${deal.id}`.as('deal_id'),
          kind: sql<string>`'created'`.as('kind'),
          changes: sql<string>`${changesJson}`.as('changes'),
          actorId: sql<string>`${actorId}`.as('actor_id'),
          credentialType: sql<string>`${historyOpts.credentialType}`.as(
            'credential_type',
          ),
          createdAt: sql<string>`${now}`.as('created_at'),
        })
        .from(deals)
        .where(
          and(
            eq(deals.id, deal.id),
            eq(deals.createdAt, now),
            eq(deals.createdBy, actorId),
          ),
        ),
    ),
  ]);
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
        'pipelineId must match "pipe_<21 lowercase alphanumeric>"',
      );
    }
    filters.push(eq(deals.pipelineId, options.pipelineId));
  }
  if (options.stageId !== undefined) {
    if (!STAGE_ID_REGEX.test(options.stageId)) {
      throw new DealsRepoError(
        'invalid_input',
        'stageId must match "stag_<21 lowercase alphanumeric>"',
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
 *
 * Optimistic concurrency (ADR-022 §8): the UPDATE adds
 * `AND updated_at = :seenUpdatedAt` where `seenUpdatedAt` is captured by
 * an active-row pre-read. Concurrent writers can only produce ONE
 * winner; the loser surfaces as `DealsRepoError('conflict', ...)` which
 * handlers map to `409 CONFLICT`. The pre-read also classifies
 * `not_found` / `wrong_state` before the write so the post-write 0-rows
 * outcome is unambiguously a conflict — no post-batch re-read needed.
 *
 * History co-emission (ADR-022 §7): when `historyOpts.recordHistory` is
 * true, the UPDATE is batched with a predicate-mirrored
 * `INSERT INTO deal_history ... SELECT ... WHERE EXISTS (post-state witness)`.
 * Both statements commit together; both no-op together. `kind` is
 * `'stage_moved'` if the patch successfully changes `stage_id`, otherwise
 * `'updated'`.
 */
export async function update(
  db: Db,
  id: string,
  patch: UpdateDealPatch,
  actorId: string,
  now: string,
  historyOpts: HistoryEmitOptions,
): Promise<UpdateResult> {
  if (!DEAL_ID_REGEX.test(id)) {
    throw new DealsRepoError(
      'invalid_input',
      'deal id must match "deal_<21 lowercase alphanumeric>"',
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
  const submittedFields: DealPatchableField[] = [];

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
      submittedFields.push(field);
      continue;
    }
    if (value === undefined) continue;
    validateField(field, value);
    changes[field] = normalizeField(field, value);
    submittedFields.push(field);
  }

  if (submittedFields.length === 0) {
    const current = await findById(db, id);
    if (!current) {
      throw new DealsRepoError('not_found', `deal "${id}" not found`);
    }
    return { deal: current, fieldsChanged: [] };
  }

  // Pre-read with `includeDeleted: true` so we can distinguish:
  //   - row missing → 404 `not_found`
  //   - row soft-deleted → 409 `wrong_state` (matches pipeline.md §Error Codes)
  //   - row active → proceed to OC-guarded write
  // The post-write 0-affected case is then unambiguously a conflict
  // (ADR-022 §8 — no race-prone post-batch re-read).
  const current = await findById(db, id, { includeDeleted: true });
  if (!current) {
    throw new DealsRepoError('not_found', `deal "${id}" not found`);
  }
  if (current.status !== 'active') {
    throw new DealsRepoError('wrong_state', `deal "${id}" is not active`);
  }

  // Filter no-op writes (post-normalization equality). A PATCH that sets
  // every field to its existing value produces zero diffs and no history
  // row (matches user mental-model: "one edit" only emits when there IS
  // an edit).
  const fieldsChanged: DealPatchableField[] = [];
  for (const field of submittedFields) {
    if (current[field] === (changes[field] as Deal[typeof field])) continue;
    fieldsChanged.push(field);
  }
  if (fieldsChanged.length === 0) {
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

  const seenUpdatedAt = current.updatedAt;

  // Stage transition path. Trigger only if the patch BOTH supplies stageId
  // AND it differs from the current stage; a same-stage stageId in the
  // PATCH was already filtered out of `fieldsChanged`.
  const wantsStageTransition =
    fieldsChanged.includes('stageId') && typeof changes.stageId === 'string';
  if (wantsStageTransition) {
    return await applyStageTransition(
      db,
      id,
      current,
      changes,
      fieldsChanged,
      actorId,
      now,
      seenUpdatedAt,
      historyOpts,
    );
  }

  // Non-transition path: standard active-row UPDATE with OC guard.
  const setColumns = { ...changes, updatedAt: now, updatedBy: actorId } as any;
  const whereClause = and(
    eq(deals.id, id),
    eq(deals.status, 'active'),
    eq(deals.updatedAt, seenUpdatedAt),
  );

  if (!historyOpts.recordHistory) {
    const updated = await db
      .update(deals)
      .set(setColumns)
      .where(whereClause)
      .returning();
    const row = updated[0];
    if (!row) {
      // Pre-read confirmed the row was active with seenUpdatedAt — any
      // 0-affected outcome here is a concurrent-write conflict.
      throw new DealsRepoError(
        'conflict',
        `deal "${id}" was modified by a concurrent write — re-read and retry`,
      );
    }
    return { deal: row, fieldsChanged };
  }

  // Indie path: batch UPDATE with predicate-mirrored history INSERT.
  //
  // The post-state witness below proves "an UPDATE by this actor at this
  // millisecond landed on this row" but does NOT assert the new value of
  // every co-modified field. ADR-022 §7 documents this as the accepted
  // v1 limitation — same-actor-same-millisecond races with disjoint
  // changesets could still emit a phantom history row alongside a 409
  // (data correctness preserved; only timeline phantom). Tightening to
  // per-field value witnesses, a version column, or strictly-greater
  // updated_at is deferred until the race is observed in production.
  const diffs: DealHistoryChangeEntry[] = fieldsChanged.map((field) => ({
    field,
    from: current[field],
    to: changes[field],
  }));
  const historyId = generateId('dhx');
  const changesJson = serializeUpdated(diffs);
  const results = await db.batch([
    db.update(deals).set(setColumns).where(whereClause).returning(),
    db.insert(dealHistory).select((qb) =>
      qb
        .select({
          id: sql<string>`${historyId}`.as('id'),
          dealId: sql<string>`${id}`.as('deal_id'),
          kind: sql<string>`'updated'`.as('kind'),
          changes: sql<string>`${changesJson}`.as('changes'),
          actorId: sql<string>`${actorId}`.as('actor_id'),
          credentialType: sql<string>`${historyOpts.credentialType}`.as(
            'credential_type',
          ),
          createdAt: sql<string>`${now}`.as('created_at'),
        })
        .from(deals)
        .where(
          and(
            eq(deals.id, id),
            eq(deals.status, 'active'),
            eq(deals.updatedAt, now),
            eq(deals.updatedBy, actorId),
          ),
        ),
    ),
  ]);
  const updatedRows = results[0] as Deal[];
  const row = updatedRows[0];
  if (!row) {
    throw new DealsRepoError(
      'conflict',
      `deal "${id}" was modified by a concurrent write — re-read and retry`,
    );
  }
  return { deal: row, fieldsChanged };
}

/**
 * Soft-delete a deal. Mirrors `update()`'s pre-read pattern so the
 * post-write 0-affected case is unambiguously a conflict.
 *
 * History co-emission: `kind='soft_deleted'`, `changes=null` (ADR-022 §4).
 * The post-state witness includes `status='deleted'`, `deleted_at=:now`,
 * `deleted_by=:actorId` AND `updated_at=:now AND updated_by=:actorId` so a
 * concurrent same-millisecond update by another actor cannot accidentally
 * satisfy the witness (ADR-022 §7).
 */
export async function softDelete(
  db: Db,
  id: string,
  actorId: string,
  now: string,
  historyOpts: HistoryEmitOptions,
): Promise<Deal> {
  if (!DEAL_ID_REGEX.test(id)) {
    throw new DealsRepoError(
      'invalid_input',
      'deal id must match "deal_<21 lowercase alphanumeric>"',
    );
  }

  const current = await findById(db, id, { includeDeleted: true });
  if (!current) {
    throw new DealsRepoError('not_found', `deal "${id}" not found`);
  }
  if (current.status !== 'active') {
    throw new DealsRepoError(
      'wrong_state',
      `deal "${id}" is already deleted`,
    );
  }
  const seenUpdatedAt = current.updatedAt;

  const setColumns = {
    status: 'deleted' as const,
    deletedAt: now,
    deletedBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  const whereClause = and(
    eq(deals.id, id),
    eq(deals.status, 'active'),
    eq(deals.updatedAt, seenUpdatedAt),
  );

  if (!historyOpts.recordHistory) {
    const updated = await db
      .update(deals)
      .set(setColumns)
      .where(whereClause)
      .returning();
    const row = updated[0];
    if (!row) {
      throw new DealsRepoError(
        'conflict',
        `deal "${id}" was modified by a concurrent write — re-read and retry`,
      );
    }
    return row;
  }

  const historyId = generateId('dhx');
  const results = await db.batch([
    db.update(deals).set(setColumns).where(whereClause).returning(),
    db.insert(dealHistory).select((qb) =>
      qb
        .select({
          id: sql<string>`${historyId}`.as('id'),
          dealId: sql<string>`${id}`.as('deal_id'),
          kind: sql<string>`'soft_deleted'`.as('kind'),
          changes: sql<string | null>`NULL`.as('changes'),
          actorId: sql<string>`${actorId}`.as('actor_id'),
          credentialType: sql<string>`${historyOpts.credentialType}`.as(
            'credential_type',
          ),
          createdAt: sql<string>`${now}`.as('created_at'),
        })
        .from(deals)
        .where(
          and(
            eq(deals.id, id),
            eq(deals.status, 'deleted'),
            eq(deals.deletedAt, now),
            eq(deals.deletedBy, actorId),
            eq(deals.updatedAt, now),
            eq(deals.updatedBy, actorId),
          ),
        ),
    ),
  ]);
  const updatedRows = results[0] as Deal[];
  const row = updatedRows[0];
  if (!row) {
    throw new DealsRepoError(
      'conflict',
      `deal "${id}" was modified by a concurrent write — re-read and retry`,
    );
  }
  return row;
}

// ---------- stage transition ----------

/**
 * Apply a deal update that includes a stage transition. Called only when
 * `changes.stageId` is present and differs from `current.stageId` (the
 * same-stage case is filtered out at the no-op-diff check upstream).
 *
 * The transition is atomic: a single conditional UPDATE asserts the deal
 * is active, the seenUpdatedAt OC guard holds, the current stage matches
 * the pre-read `from_stage_id`, and the target stage is active AND in the
 * deal's pipeline. `stage_entered_at` is reset to `now`.
 *
 * Target-stage validity (active + same-pipeline) is pre-validated as a
 * synchronous read so that user-facing failures surface as
 * `invalid_input` (→ 400). The `EXISTS` clause stays in the UPDATE as a
 * concurrent-soft-delete safety net; if the pre-validation passed and
 * the UPDATE still affects 0 rows, that's an OC conflict, not invalid
 * input.
 *
 * History `kind='stage_moved'` carries `{from_stage_id, to_stage_id,
 * changes: [other diffs]}`. The history witness includes
 * `stage_id=:to AND stage_entered_at=:now AND updated_at=:now AND
 * updated_by=:actorId` so a coincident-millisecond write by another actor
 * cannot satisfy it (ADR-022 §7).
 */
async function applyStageTransition(
  db: Db,
  id: string,
  current: Deal,
  changes: Partial<Record<DealPatchableField, unknown>>,
  fieldsChanged: DealPatchableField[],
  actorId: string,
  now: string,
  seenUpdatedAt: string,
  historyOpts: HistoryEmitOptions,
): Promise<UpdateResult> {
  const targetStageId = changes.stageId as string;
  const fromStageId = current.stageId;

  // Pre-validate the target stage's active state + pipeline membership.
  // Any failure here → 400 INVALID_INPUT; if it passes, a later 0-affected
  // UPDATE is unambiguously an OC conflict (status / updated_at / stage_id
  // moved between read and write) and not a pre-validation issue.
  await assertStageInActivePipeline(db, targetStageId, current.pipelineId);

  const otherChanges = { ...changes };
  delete otherChanges.stageId;

  const setColumns = {
    ...otherChanges,
    stageId: targetStageId,
    stageEnteredAt: now,
    updatedAt: now,
    updatedBy: actorId,
  } as any;
  const whereClause = and(
    eq(deals.id, id),
    eq(deals.status, 'active'),
    eq(deals.updatedAt, seenUpdatedAt),
    eq(deals.stageId, fromStageId),
    sql`EXISTS (SELECT 1 FROM stages WHERE id = ${targetStageId} AND status = 'active' AND pipeline_id = ${deals.pipelineId})`,
  );

  if (!historyOpts.recordHistory) {
    const updated = await db
      .update(deals)
      .set(setColumns)
      .where(whereClause)
      .returning();
    const row = updated[0];
    if (!row) {
      throw new DealsRepoError(
        'conflict',
        `deal "${id}" was modified by a concurrent write — re-read and retry`,
      );
    }
    return { deal: row, fieldsChanged };
  }

  // Build the `stage_moved` payload: typed transition wrapper around any
  // co-modified fields. fieldsChanged excludes `stageId` for the inner
  // diff list.
  const otherDiffs: DealHistoryChangeEntry[] = fieldsChanged
    .filter((f) => f !== 'stageId')
    .map((field) => ({
      field,
      from: current[field],
      to: changes[field],
    }));
  const historyId = generateId('dhx');
  const changesJson = serializeStageMoved(
    fromStageId,
    targetStageId,
    otherDiffs,
  );

  const results = await db.batch([
    db.update(deals).set(setColumns).where(whereClause).returning(),
    db.insert(dealHistory).select((qb) =>
      qb
        .select({
          id: sql<string>`${historyId}`.as('id'),
          dealId: sql<string>`${id}`.as('deal_id'),
          kind: sql<string>`'stage_moved'`.as('kind'),
          changes: sql<string>`${changesJson}`.as('changes'),
          actorId: sql<string>`${actorId}`.as('actor_id'),
          credentialType: sql<string>`${historyOpts.credentialType}`.as(
            'credential_type',
          ),
          createdAt: sql<string>`${now}`.as('created_at'),
        })
        .from(deals)
        .where(
          and(
            eq(deals.id, id),
            eq(deals.status, 'active'),
            eq(deals.stageId, targetStageId),
            eq(deals.stageEnteredAt, now),
            eq(deals.updatedAt, now),
            eq(deals.updatedBy, actorId),
          ),
        ),
    ),
  ]);
  const updatedRows = results[0] as Deal[];
  const row = updatedRows[0];
  if (!row) {
    throw new DealsRepoError(
      'conflict',
      `deal "${id}" was modified by a concurrent write — re-read and retry`,
    );
  }
  return { deal: row, fieldsChanged };
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
      'pipelineId must match "pipe_<21 lowercase alphanumeric>"',
    );
  }
  if (typeof input.stageId !== 'string' || !STAGE_ID_REGEX.test(input.stageId)) {
    throw new DealsRepoError(
      'invalid_input',
      'stageId must match "stag_<21 lowercase alphanumeric>"',
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
          'stageId must match "stag_<21 lowercase alphanumeric>"',
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
