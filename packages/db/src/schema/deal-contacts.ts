import { sql } from 'drizzle-orm';
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

const DEAL_CONTACT_ROLES = [
  'decision_maker',
  'champion',
  'billing',
  'technical',
  'other',
] as const;
export type DealContactRole = (typeof DEAL_CONTACT_ROLES)[number];

const inList = (values: readonly string[]): string =>
  values.map((v) => `'${v}'`).join(', ');

/**
 * Deal contacts (many-to-many between `deals` and `persons`).
 *
 * Indie base CRM entity. Single-tenant deploy per ADR-011 §Tenancy: there is
 * no `tenant_id` column. Tenant identity propagates via gateway-stamped
 * `X-Tenant-Id` for audit/log context only.
 *
 * Moves indie from Pipedrive's 1-slot model (`deals.primaryPersonId`) toward
 * HubSpot's many-to-many model. `deals.primaryPersonId` stays as the
 * denormalized fast pointer (= HubSpot's "primary contact" label).
 *
 * **No soft-delete on this table** — a row IS the association. Removing a
 * contact deletes the row. Audit history (when emission lands) covers
 * add/remove events.
 *
 * **Invariants** (enforced at the repo, not the handler — TOCTOU safety):
 *
 * - Active-deal guard: `add`, `remove`, `listByDeal` all require
 *   `deals.status = 'active'` for the parent deal. Public sub-resource
 *   endpoints under a soft-deleted deal return 404 (matches the bare
 *   `GET /api/v1/deals/:id` posture with default `includeDeleted=false`).
 * - Active-person pre-check on `add` (same posture as
 *   `deals.primaryPersonId` — see `persons.ts:46-49`). TOCTOU window vs.
 *   concurrent person soft-delete acknowledged; the FK is the floor.
 * - `primaryPersonId` ↔ `deal_contacts` consistency: when a deal is
 *   created or patched with `primaryPersonId=X` (non-null), the repo
 *   auto-upserts a `deal_contacts(dealId, X)` row (role defaults to NULL)
 *   in the same logical write. `dealContactsRepo.remove(dealId, personId)`
 *   atomically clears `deals.primaryPersonId` when it equals `personId`.
 *
 * FKs are declared at the SQL layer (`0015_deal_contacts.sql`) using
 * Drizzle's `references()` because both parent tables are loaded by the
 * same db module by the time this schema is instantiated.
 *
 * PII per ADR-007: `role` is a closed enum (decision-making metadata,
 * not personal data); NOT marked `pii()`. The `personId` FK references
 * a PII-bearing row but is itself an opaque id.
 */
export const dealContacts = sqliteTable(
  'deal_contacts',
  {
    dealId: text('deal_id').notNull(),
    personId: text('person_id').notNull(),
    role: text('role').$type<DealContactRole>(),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.dealId, t.personId] }),
    dealIdIdx: index('idx_deal_contacts_deal_id').on(t.dealId),
    personIdIdx: index('idx_deal_contacts_person_id').on(t.personId),
    roleCheck: check(
      'deal_contacts_role_check',
      sql.raw(
        `role IS NULL OR role IN (${inList(DEAL_CONTACT_ROLES)})`,
      ),
    ),
  }),
);

export type DealContact = typeof dealContacts.$inferSelect;
export type NewDealContact = typeof dealContacts.$inferInsert;

export const DEAL_CONTACT_ROLE_VALUES: readonly DealContactRole[] =
  DEAL_CONTACT_ROLES;
