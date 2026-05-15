/**
 * deal_history repository — read-only access to the append-only timeline.
 *
 * Functional style (matches `deals.ts`). The insert side lives in
 * `deals.ts` (history rows are co-emitted via `db.batch()` with the
 * underlying deal mutation — see ADR-022 §7). This module exposes only
 * the read surface.
 *
 * Soft-delete posture: history rows have no FK to `deals.id` and survive
 * soft-delete of the parent deal. The `findById` / `listByDealId` reads
 * do NOT filter on the deal's status; the timeline of a closed/deleted
 * deal remains queryable.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import { dealHistory } from '../schema/deal-history.js';
import type { DealHistoryRow } from '../schema/deal-history.js';

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

const DEAL_HISTORY_ID_REGEX = /^dhx_[a-z0-9]{21}$/;
const DEAL_ID_REGEX = /^deal_[a-z0-9]{21}$/;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListByDealOptions {
  limit?: number;
  cursor?: string | null;
}

export interface ListResult {
  items: DealHistoryRow[];
  nextCursor: string | null;
}

export async function findById(
  db: Db,
  id: string,
): Promise<DealHistoryRow | null> {
  if (!DEAL_HISTORY_ID_REGEX.test(id)) {
    throw new DealHistoryRepoError(
      'invalid_input',
      'deal_history id must match "dhx_<21 lowercase alphanumeric>"',
    );
  }
  const rows = await db
    .select()
    .from(dealHistory)
    .where(eq(dealHistory.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listByDealId(
  db: Db,
  dealId: string,
  options: ListByDealOptions = {},
): Promise<ListResult> {
  if (!DEAL_ID_REGEX.test(dealId)) {
    throw new DealHistoryRepoError(
      'invalid_input',
      'dealId must match "deal_<21 lowercase alphanumeric>"',
    );
  }
  const limit = clampLimit(options.limit);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const filters = [eq(dealHistory.dealId, dealId)];
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
    .where(filters.length === 1 ? filters[0] : and(...filters))
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

function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new DealHistoryRepoError(
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
    throw new DealHistoryRepoError('invalid_input', 'malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DealHistoryRepoError('invalid_input', 'malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new DealHistoryRepoError('invalid_input', 'malformed cursor');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.createdAt !== 'string' || typeof obj.id !== 'string') {
    throw new DealHistoryRepoError('invalid_input', 'malformed cursor');
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
