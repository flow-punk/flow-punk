import type { CreateDashboardAppInput } from "./types.js";

/** Phase 0 placeholder. The TanStack-Start factory lands in a follow-up step
 *  along with the route tree, auth-redirect, and host-driven layout. */
export interface DashboardApp {
  /** Mount the app into a DOM node (browser entry) or return a request handler
   *  (Worker entry). The exact shape is finalized when the framework is wired. */
  mount(target: Element): void;
}

export function createDashboardApp(input: CreateDashboardAppInput): DashboardApp {
  const { modules } = input;
  return {
    mount(target: Element): void {
      // Empty shell while modules/factory are scaffolded. Per the Phase 0 DoD,
      // an unconfigured app must render "no modules registered" and redirect
      // unauthenticated requests to /login. The framework wiring lands next.
      target.textContent =
        modules.length === 0
          ? "no modules registered"
          : `${modules.length} module(s) registered`;
    },
  };
}
