/**
 * Deal history repository — append-only timeline of deal + deal_contact
 * mutations. See ADR-022 for the architectural framework.
 *
 * This repo intentionally exposes only READ surfaces. Writes happen from
 * inside the deals / deal-contacts repos via raw SQL helpers (see
 * `buildHistoryInsert`) that participate in the same `db.batch([...])` as
 * the mutation they record. Splitting the write into a separate, non-batched
 * helper would break the ADR-022 §7 atomicity contract (predicate-mirrored
 * `INSERT ... SELECT ... WHERE EXISTS`).
 *
 * Reads:
 * - `findById` — single history row by id.
 * - `listByDeal` — cursor-paginated timeline for a single deal,
 *   ordered `(created_at DESC, id DESC)`.
 *
 * Writes (helpers consumed by other repos):
 * - `buildHistoryInsert` — returns a `SQL` fragment for `INSERT ... SELECT
 *   ... WHERE EXISTS (<witness>)` to be passed into `db.batch([...])` via
 *   `db.run(...)`. The caller supplies the witness predicate that mirrors
 *   their own mutation's `WHERE` clause.
 *
 * Row id prefix: `dhx_<21>` (per ADR-022, decision §IDs).
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { generateId } from '@flowpunk/service-utils';

import {
  dealHistory,
  type DealHistoryCredentialType,
  type DealHistoryKind,
  type DealHistoryRow,
} from '../schema/deal-history.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class DealHistoryRepoError extends Error {
  constructor(
    public readonly code: 'not_found' | 'invalid_input',
    message: string,
  ) {
    super(message);
    this.name = 'DealHistoryRepoError';
  }
}

const HISTORY_ID_REGEX = /^dhx_[a-z0-9]{21}$/;
const DEAL_ID_REGEX = /^deal_[a-z0-9]{21}$/;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListByDealOptions {
  limit?: number;
  cursor?: string | null;
}

export interface ListByDealResult {
  items: DealHistoryRow[];
  nextCursor: string | null;
}

interface CursorPayload {
  createdAt: string;
  id: string;
}

export async function findById(
  db: Db,
  id: string,
): Promise<DealHistoryRow | null> {
  if (!HISTORY_ID_REGEX.test(id)) {
    throw new DealHistoryRepoError(
      'invalid_input',
      'history id must match "dhx_<21 lowercase alphanumeric>"',
    );
  }
  const rows = await db
    .select()
    .from(dealHistory)
    .where(eq(dealHistory.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listByDeal(
  db: Db,
  dealId: string,
  options: ListByDealOptions = {},
): Promise<ListByDealResult> {
  if (!DEAL_ID_REGEX.test(dealId)) {
    throw new DealHistoryRepoError(
      'invalid_input',
      'dealId must match "deal_<21 lowercase alphanumeric>"',
    );
  }
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters: SQL[] = [eq(dealHistory.dealId, dealId)];
  if (cursor) {
    filters.push(
      or(
        lt(dealHistory.createdAt, cursor.createdAt),
        and(
          eq(dealHistory.createdAt, cursor.createdAt),
          lt(dealHistory.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(dealHistory)
    .where(and(...filters))
    .orderBy(desc(dealHistory.createdAt), desc(dealHistory.id))
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

// ---------- write helpers (consumed by deals / deal-contacts repos) ----------

export interface HistoryInsertInput {
  dealId: string;
  kind: DealHistoryKind;
  /** JSON-stringified payload, or null for kinds with no payload. */
  changes: string | null;
  actorId: string;
  credentialType: DealHistoryCredentialType;
  now: string;
}

/**
 * Generate a fresh `dhx_<nano21>` history row id. Callers thread this id
 * into `buildHistoryInsert` so the repo's read APIs and the calling repo
 * agree on the row identity.
 */
export function generateHistoryId(): string {
  return generateId('dhx');
}

/**
 * Build an `INSERT INTO deal_history ... SELECT ... WHERE EXISTS (witness)`
 * statement for inclusion in the caller's `db.batch([...])`. The witness
 * SQL fragment must verify the calling mutation actually landed — typically
 * by checking the deal row matches its post-mutation state (e.g.,
 * `updated_at = now`, or `status = 'deleted' AND deleted_at = now`).
 *
 * If the witness yields zero rows, the INSERT no-ops — preventing orphan
 * history rows when a conditional UPDATE matches zero rows (ADR-022 §7).
 *
 * Caller usage:
 *
 *   const historyId = generateHistoryId();
 *   const results = await db.batch([
 *     db.update(deals).set({...}).where(predicate).returning(),
 *     db.run(buildHistoryInsert(historyId, {...}, witnessSql)),
 *   ]);
 */
export function buildHistoryInsert(
  historyId: string,
  input: HistoryInsertInput,
  witness: SQL,
): SQL {
  return sql`
    INSERT INTO deal_history (id, deal_id, kind, changes, actor_id, credential_type, created_at)
    SELECT ${historyId}, ${input.dealId}, ${input.kind}, ${input.changes}, ${input.actorId}, ${input.credentialType}, ${input.now}
    WHERE EXISTS (${witness})
  `;
}

/**
 * Build an unconditional `INSERT INTO deal_history` for use in the
 * `created` / `contact_added` cases where the mutation is itself an INSERT
 * — if the mutation INSERT fails (e.g., PK collision), the batch
 * transaction rolls back and the history INSERT is rolled back with it.
 * No witness needed; atomicity is provided by the batch transaction.
 */
export function buildHistoryInsertUnconditional(
  historyId: string,
  input: HistoryInsertInput,
): SQL {
  return sql`
    INSERT INTO deal_history (id, deal_id, kind, changes, actor_id, credential_type, created_at)
    VALUES (${historyId}, ${input.dealId}, ${input.kind}, ${input.changes}, ${input.actorId}, ${input.credentialType}, ${input.now})
  `;
}

// ---------- cursor pagination ----------

function clampLimit(input: number | undefined): number {
  if (input === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(input) || input < 1) {
    throw new DealHistoryRepoError('invalid_input', 'limit must be >= 1');
  }
  return Math.min(Math.floor(input), MAX_LIMIT);
}

function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return btoa(json);
}

function decodeCursor(raw: string): CursorPayload {
  try {
    const json = atob(raw);
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid cursor payload');
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new DealHistoryRepoError('invalid_input', 'cursor is malformed');
  }
}
