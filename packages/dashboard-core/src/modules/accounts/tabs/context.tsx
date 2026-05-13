/**
 * React-context bridge for the `accounts.detail.tabs` slot.
 *
 * Per ADR-016 §"Slots", slot filler components take no props — they pull
 * what they need from context. Accounts detail tabs need the active
 * account id, so we expose it via `AccountTabContext` rather than
 * stretching the slot host to thread props. This keeps the filler shape
 * uniform across slots while still giving tab implementations the
 * record they're rendering against.
 *
 * Slot id: `accounts.detail.tabs` (stable, never change after ship).
 */
import { createContext, useContext, type ReactNode } from "react";

export const ACCOUNTS_DETAIL_TABS_SLOT = "accounts.detail.tabs" as const;

interface AccountTabContextValue {
  accountId: string;
}

const AccountTabContext = createContext<AccountTabContextValue | null>(null);

export function AccountTabProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  return (
    <AccountTabContext.Provider value={{ accountId }}>
      {children}
    </AccountTabContext.Provider>
  );
}

export function useAccountTabContext(): AccountTabContextValue {
  const v = useContext(AccountTabContext);
  if (!v) {
    throw new Error(
      "useAccountTabContext must be used inside an <AccountTabProvider>. " +
        "Accounts detail tabs are rendered with the active account id in context.",
    );
  }
  return v;
}
