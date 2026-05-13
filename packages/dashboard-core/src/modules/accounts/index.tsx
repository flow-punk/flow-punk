import type { DashboardModule } from "../types.js";
import { Icon } from "@flowpunk-indie/dashboard-ui";
import { AccountsList } from "./list.js";
import { AccountDetail } from "./detail.js";
import { AccountOverviewTab } from "./tabs/overview.js";
import { ACCOUNTS_DETAIL_TABS_SLOT } from "./tabs/context.js";
import { ACCOUNTS_LIST_COLUMNS_SLOT } from "./columns-slot.js";

/**
 * Accounts module. Surfaces the contacts service `accounts` collection.
 *
 * Slots defined:
 * - `accounts.detail.tabs` — extends the right-pane tab strip on the
 *   account detail view. Built-in "Overview" tab is registered as a
 *   slot filler so the strip is fully slot-driven; managed contributes
 *   "Billing" via `dashboard-extensions`. Filler component props: `{}`
 *   — pulls the active account id from `AccountTabContext`.
 * - `accounts.list.columns` — appends optional columns after the
 *   built-in set. See `columns-slot.ts` for the descriptor type. Filler
 *   component receives `{ account: Account }` and renders a cell.
 *
 * Edition-agnostic per ADR-011 — no runtime edition branching.
 */
export const accountsModule: DashboardModule = {
  id: "accounts",
  nav: [
    {
      id: "workspace.accounts",
      label: "Workspace",
      items: [
        {
          id: "accounts",
          label: "Accounts",
          to: "/accounts",
          icon: ({ className }) => (
            <Icon name="building" className={className} />
          ),
        },
      ],
    },
  ],
  routes: [
    { path: "/accounts", component: AccountsList },
    { path: "/accounts/$id", component: AccountDetail },
  ],
  slots: [
    {
      id: ACCOUNTS_DETAIL_TABS_SLOT,
      description:
        "Tabs rendered in the right pane of the account detail view. " +
        "Filler component props: `{}` (active accountId is read from " +
        "AccountTabContext). Filler `id` doubles as the tab value in the " +
        "URL `?tab=` param.",
    },
    {
      id: ACCOUNTS_LIST_COLUMNS_SLOT,
      description:
        "Optional columns appended after the built-in column set on the " +
        "accounts list view. Filler component receives `{ account: Account }`. " +
        "Filler `id` is the column id (persisted in localStorage as " +
        "`dashboard.accounts.columns`); an optional `:Label` suffix sets the " +
        "header text (e.g. `mrr:MRR`).",
    },
  ],
  slotFillers: [
    {
      slot: ACCOUNTS_DETAIL_TABS_SLOT,
      id: "overview",
      order: 10,
      component: AccountOverviewTab,
    },
  ],
};

export { AccountsList } from "./list.js";
export { AccountDetail } from "./detail.js";
export { AccountOverviewTab } from "./tabs/overview.js";
export {
  ACCOUNTS_DETAIL_TABS_SLOT,
  AccountTabProvider,
  useAccountTabContext,
} from "./tabs/context.js";
export {
  ACCOUNTS_LIST_COLUMNS_SLOT,
  type AccountsListColumn,
} from "./columns-slot.js";
export {
  useAccounts,
  useAccount,
  useUpdateAccount,
  useDeleteAccount,
  AccountsError,
  ACCOUNTS_QUERY_KEY,
  accountQueryKey,
  type Account,
  type UpdateAccountInput,
  type UseAccountsOptions,
  type AccountsListResponse,
} from "./hooks.js";
