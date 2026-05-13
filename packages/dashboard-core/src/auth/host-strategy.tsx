import { createContext, useContext, type ReactNode } from "react";

/**
 * Host strategy hint shared with auth hooks so role mapping can branch on
 * console vs tenant cleanly. ADR-013 — platform admins and tenant users
 * are structurally separate identities; the gateway has already routed
 * better-auth to the right D1 by the time `useSession` runs, but the
 * client doesn't see that decision, so we mirror it here from the
 * factory input (`createDashboardApp({ hostStrategy })`).
 *
 * Default is `tenant` so indie / unwrapped consumers keep working.
 */
export type HostStrategyHint = "single" | "tenant" | "console";

const HostStrategyContext = createContext<HostStrategyHint>("tenant");

export function HostStrategyProvider({
  hostStrategy,
  children,
}: {
  hostStrategy: HostStrategyHint;
  children: ReactNode;
}) {
  return (
    <HostStrategyContext.Provider value={hostStrategy}>
      {children}
    </HostStrategyContext.Provider>
  );
}

export function useHostStrategy(): HostStrategyHint {
  return useContext(HostStrategyContext);
}
