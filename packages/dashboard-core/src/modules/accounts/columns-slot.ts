/**
 * Slot id + descriptor type for `accounts.list.columns`.
 *
 * Slot contract (see SlotDefinition documentation on `accountsModule`):
 *
 * - Built-in columns (Name, Domain, Industry, Owner, Status, …) are
 *   NOT slot-driven. The slot only appends optional columns at the
 *   end of the table; built-ins stay edition-agnostic.
 * - Filler props per ADR-016 §"Slots": filler receives `{ account }`
 *   at render time (threaded via context inside the list view), and
 *   returns a cell renderer for that row.
 * - Filler `id` doubles as the column id used in the column-toggle
 *   menu and the `localStorage` visibility map (key prefix
 *   `dashboard.accounts.columns`). An optional `:Label` suffix on
 *   the filler id lets the contributor name the column without a
 *   parallel registry — e.g. `mrr:MRR`. Without a suffix, the label
 *   is derived from the id (Title Case).
 *
 * The descriptor type below is the v1 contract. Future extensions
 * (sortability, alignment) are additive and stay backwards-compatible.
 */
import type { ReactNode } from "react";
import type { Account } from "./hooks.js";

export const ACCOUNTS_LIST_COLUMNS_SLOT = "accounts.list.columns" as const;

export interface AccountsListColumn {
  /** Stable column id, persisted in `dashboard.accounts.columns`. */
  id: string;
  /** Header text rendered in the table head. */
  label: string;
  /** When false, the column is hidden by default until toggled on. */
  defaultVisible?: boolean;
  /** Cell renderer for a single account row. */
  render: (account: Account) => ReactNode;
}
