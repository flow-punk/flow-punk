/**
 * Deal contacts repository — many-to-many between deals and persons.
 *
 * Functional style (matches indie/packages/db/src/repositories/deals.ts).
 * Throws `DealContactsRepoError` for caller-actionable failures; the
 * pipeline service's `mapRepoError` maps to HTTP.
 *
 * Invariants enforced here (not in handlers — TOCTOU safety):
 *
 * - Active-deal guard. `add` / `remove` / `listByDeal` require
 *   `deals.status = 'active'`. Sub-resource endpoints under a soft-deleted
 *   deal return 404, matching `GET /api/v1/deals/:id` with default
 *   `includeDeleted=false`.
 * - Active-person pre-check on `add` (same posture as `deals.primaryPersonId`).
 *   TOCTOU window vs. concurrent person soft-delete acknowledged.
 * - `primaryPersonId` ↔ `deal_contacts` consistency:
 *   - `add` upserts a row but does NOT touch `deals.primaryPersonId`
 *     (choosing primary is an explicit PATCH on the deal).
 *   - `remove` does a single conditional UPDATE-on-deals AND DELETE-on-
 *     deal_contacts; when `deals.primaryPersonId = personId`, the column
 *     is cleared in the same statement. Atomicity guarantees no orphan
 *     primary pointer.
 *   - Deal create/update paths (in repositories/deals.ts) auto-upsert a
 *     row when `primaryPersonId` is set.
 */
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, asc, eq } from 'drizzle-orm';

import { dealContacts, type DealContact } from '../schema/deal-contacts.js';
import { deals } from '../schema/deals.js';
import { persons } from '../schema/persons.js';
import {
  DEAL_CONTACT_ROLE_VALUES,
  type DealContactRole,
} from '../schema/deal-contacts.js';

type Db = DrizzleD1Database<Record<string, never>>;

export class DealContactsRepoError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'wrong_state'
      | 'already_exists'
      | 'invariant_violation',
    message: string,
  ) {
    super(message);
    this.name = 'DealContactsRepoError';
  }
}

const DEAL_ID_REGEX = /^deal_[a-z0-9]{21}$/;
const PERSON_ID_REGEX = /^per_[a-z0-9]{21}$/;
const ROLE_SET = new Set<string>(DEAL_CONTACT_ROLE_VALUES);

export interface AddDealContactInput {
  dealId: string;
  personId: string;
  role?: DealContactRole | null;
}

export interface ListResult {
  items: DealContact[];
}

/**
 * Add a contact to a deal. The new row's `role` may be null (no role
 * assigned) or one of the closed enum values. PK collision on
 * `(deal_id, person_id)` surfaces as `already_exists` (409).
 *
 * Pre-checks:
 * - parent deal exists and is `status = 'active'`
 * - person exists and is `status = 'active'`
 *
 * Returns the inserted row.
 */
export async function add(
  db: Db,
  input: AddDealContactInput,
  actorId: string,
  now: string,
): Promise<DealContact> {
  if (!DEAL_ID_REGEX.test(input.dealId)) {
    throw new DealContactsRepoError(
      'invalid_input',
      'dealId must match "deal_<21 lowercase alphanumeric>"',
    );
  }
  if (!PERSON_ID_REGEX.test(input.personId)) {
    throw new DealContactsRepoError(
      'invalid_input',
      'personId must match "per_<21 lowercase alphanumeric>"',
    );
  }
  if (input.role !== undefined && input.role !== null) {
    if (typeof input.role !== 'string' || !ROLE_SET.has(input.role)) {
      throw new DealContactsRepoError(
        'invalid_input',
        `role must be one of: ${DEAL_CONTACT_ROLE_VALUES.join(', ')}`,
      );
    }
  }

  await assertDealActive(db, input.dealId);
  await assertPersonActive(db, input.personId);

  try {
    const inserted = await db
      .insert(dealContacts)
      .values({
        dealId: input.dealId,
        personId: input.personId,
        role: input.role ?? null,
        createdAt: now,
        createdBy: actorId,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new DealContactsRepoError(
        'invariant_violation',
        'insert returned no row',
      );
    }
    return row;
  } catch (err) {
    // SQLite PRIMARY KEY violation surfaces as a UNIQUE-like constraint
    // error. Distinguish via the message; if uncertain, re-query.
    const message = err instanceof Error ? err.message : '';
    if (
      /UNIQUE constraint|PRIMARY KEY/i.test(message) ||
      /constraint failed/i.test(message)
    ) {
      throw new DealContactsRepoError(
        'already_exists',
        `person "${input.personId}" is already a contact on deal "${input.dealId}"`,
      );
    }
    throw err;
  }
}

/**
 * Remove a contact from a deal. When `deals.primaryPersonId = personId`,
 * the column is cleared in the same logical write (no orphan primary
 * pointer). Performed as a transaction over two SQL statements.
 *
 * Returns nothing. Idempotency: if the row does not exist (and the deal
 * does, and is active), throws `not_found`.
 */
export async function remove(
  db: Db,
  dealId: string,
  personId: string,
  actorId: string,
  now: string,
): Promise<void> {
  if (!DEAL_ID_REGEX.test(dealId)) {
    throw new DealContactsRepoError(
      'invalid_input',
      'dealId must match "deal_<21 lowercase alphanumeric>"',
    );
  }
  if (!PERSON_ID_REGEX.test(personId)) {
    throw new DealContactsRepoError(
      'invalid_input',
      'personId must match "per_<21 lowercase alphanumeric>"',
    );
  }

  await assertDealActive(db, dealId);

  // Clear primaryPersonId on the parent deal if-and-only-if it currently
  // points at this contact, AND in the same transaction delete the
  // deal_contacts row. D1 `db.batch()` is transactional — both succeed
  // or both fail. Matches the pattern in
  // managed/packages/db/src/repositories/tenants.ts.
  const results = await db.batch([
    db
      .update(deals)
      .set({
        primaryPersonId: null,
        updatedAt: now,
        updatedBy: actorId,
      })
      .where(
        and(
          eq(deals.id, dealId),
          eq(deals.status, 'active'),
          eq(deals.primaryPersonId, personId),
        ),
      ),
    db
      .delete(dealContacts)
      .where(
        and(
          eq(dealContacts.dealId, dealId),
          eq(dealContacts.personId, personId),
        ),
      )
      .returning(),
  ]);

  const deletedRows = results[1] as ReadonlyArray<DealContact> | undefined;
  if (!deletedRows || deletedRows.length === 0) {
    throw new DealContactsRepoError(
      'not_found',
      `contact (deal="${dealId}", person="${personId}") not found`,
    );
  }
}

/**
 * List contacts for an active deal. Sub-resource read posture: a
 * soft-deleted parent deal yields 404 (matches `GET /api/v1/deals/:id`
 * with default `includeDeleted=false`).
 *
 * Order is `(created_at ASC, person_id ASC)` for stable history.
 */
export async function listByDeal(
  db: Db,
  dealId: string,
): Promise<ListResult> {
  if (!DEAL_ID_REGEX.test(dealId)) {
    throw new DealContactsRepoError(
      'invalid_input',
      'dealId must match "deal_<21 lowercase alphanumeric>"',
    );
  }
  await assertDealActive(db, dealId);
  const rows = await db
    .select()
    .from(dealContacts)
    .where(eq(dealContacts.dealId, dealId))
    .orderBy(asc(dealContacts.createdAt), asc(dealContacts.personId));
  return { items: rows };
}

/**
 * Upsert a `deal_contacts(dealId, personId)` row from within the deals
 * repo's create / update flows when `primaryPersonId` is set. Does NOT
 * pre-check person/deal active status — that is the caller's
 * responsibility (the deals repo runs `assertPersonActive` already).
 *
 * Idempotent: if the row exists, leaves it as-is (preserves any role).
 */
export async function upsertFromPrimary(
  db: Db,
  dealId: string,
  personId: string,
  actorId: string,
  now: string,
): Promise<void> {
  await db
    .insert(dealContacts)
    .values({
      dealId,
      personId,
      role: null,
      createdAt: now,
      createdBy: actorId,
    })
    .onConflictDoNothing({
      target: [dealContacts.dealId, dealContacts.personId],
    });
}

// ---------- pre-checks ----------

async function assertDealActive(db: Db, dealId: string): Promise<void> {
  const rows = await db
    .select({ status: deals.status })
    .from(deals)
    .where(eq(deals.id, dealId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new DealContactsRepoError(
      'not_found',
      `deal "${dealId}" not found`,
    );
  }
  if (row.status !== 'active') {
    throw new DealContactsRepoError(
      'wrong_state',
      `deal "${dealId}" is not active`,
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
    throw new DealContactsRepoError(
      'invalid_input',
      `person "${personId}" not found (person_not_found)`,
    );
  }
  if (row.status !== 'active') {
    throw new DealContactsRepoError(
      'invalid_input',
      `person "${personId}" is not active (person_not_active)`,
    );
  }
}

// Re-export for spec packages that need the enum at build time.
export { DEAL_CONTACT_ROLE_VALUES };
