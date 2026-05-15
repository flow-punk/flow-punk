/**
 * Deterministic serialization of `deal_history.changes` JSON payloads.
 *
 * ALL `changes` JSON is produced through this module. Field order is pinned
 * so byte-shape is stable across runs and the redaction-coverage test can
 * grep for `changes.from` / `changes.to` cleartext logging without false
 * negatives (per ADR-022 §9).
 *
 * The four exported builders correspond to the kinds emitted in v1:
 * `serializeCreated`, `serializeUpdated`, `serializeStageMoved`, and
 * `serializeSoftDeleted` (returns `null`). `contact_added` / `contact_removed`
 * are reserved in the schema CHECK constraint but no serializer ships in
 * v1 — `deal_contacts` is a separate workstream.
 */

import type { Deal, DealPatchableField } from '../schema/deals.js';
import {
  DEAL_HISTORY_CREATED_FIELD_ORDER,
  type DealHistoryChangeEntry,
} from '../schema/deal-history.js';

/**
 * Build the `created` payload: every non-null patch-shaped field, in the
 * pinned `DEAL_HISTORY_CREATED_FIELD_ORDER`.
 *
 * `from` is always `null` for `created`. `to` carries the inserted value
 * (including transformed `name`, normalized `currency`, etc. — `row` is
 * post-normalization).
 */
export function serializeCreated(row: Deal): string {
  const entries: DealHistoryChangeEntry[] = [];
  for (const field of DEAL_HISTORY_CREATED_FIELD_ORDER) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    entries.push({ field, from: null, to: value });
  }
  return JSON.stringify(entries);
}

/**
 * Build the `updated` payload from a list of {field, from, to} diffs. The
 * caller pins entry order via `ALLOWED_PATCH_FIELDS` iteration in the
 * deals repo so byte-shape is stable.
 */
export function serializeUpdated(diffs: DealHistoryChangeEntry[]): string {
  return JSON.stringify(diffs);
}

/**
 * Build the `stage_moved` payload: typed transition wrapper around any
 * co-modified field diffs.
 *
 * `changes` inside the payload is the array of OTHER fields that moved
 * in the same PATCH (everything except `stageId`). When the PATCH was a
 * pure stage move, `changes` is `[]`.
 */
export function serializeStageMoved(
  fromStageId: string,
  toStageId: string,
  otherDiffs: DealHistoryChangeEntry[],
): string {
  return JSON.stringify({
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    changes: otherDiffs,
  });
}

/** `soft_deleted` carries no payload per ADR-022 §4. */
export function serializeSoftDeleted(): null {
  return null;
}

/**
 * Helper used by `deals.ts` to construct `updated` / `stage_moved` co-diffs:
 * iterate `ALLOWED_PATCH_FIELDS` (caller's responsibility to pass), filter
 * to fields actually changed (post-normalization equality), build the entry
 * shape with consistent column-name strings.
 *
 * `fieldsChanged` is the list of patch-field keys that the repo already
 * collected; this helper just zips them into entries.
 */
export function buildDiffEntries(
  current: Deal,
  next: Record<DealPatchableField, unknown>,
  fieldsChanged: readonly DealPatchableField[],
): DealHistoryChangeEntry[] {
  const out: DealHistoryChangeEntry[] = [];
  for (const field of fieldsChanged) {
    out.push({
      field,
      from: current[field],
      to: next[field],
    });
  }
  return out;
}
