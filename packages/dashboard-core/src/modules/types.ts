import type { ComponentType, FunctionComponent } from "react";

/** A single navigation entry rendered in the sidebar. */
export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon?: ComponentType<{ className?: string }>;
  /** Optional capability gate; surface only when current session satisfies. */
  requires?: ModuleRequirements;
}

/** A grouped block of nav items. */
export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

/** A named extension point a module exposes; other modules may fill it. */
export interface SlotDefinition {
  id: string;
  description?: string;
}

/** A contribution to a named slot. */
export interface SlotFiller<TProps = unknown> {
  /** Matches `SlotDefinition.id` of the slot being filled. */
  slot: string;
  /** Stable identifier for this filler (used to deduplicate / order). */
  id: string;
  /** Render order; lower comes first. Defaults to 0. */
  order?: number;
  component: ComponentType<TProps>;
  /**
   * Capability requirements; filler is omitted at render time if the
   * current session does not satisfy. Mirrors the same gating contract
   * as modules + nav + routes (see `ModuleRequirements`).
   *
   * Server-side authorization remains authoritative — this is a UI
   * surface gate (don't render a Billing panel for a session that
   * can't reach the billing endpoint) not a security boundary.
   */
  requires?: ModuleRequirements;
}

/** Capability requirements gating a module/route/nav. */
export interface ModuleRequirements {
  role?: "platform-admin" | "tenant-admin" | "tenant-member";
  /** Edition-specific flags; never used for `if (managed)` branching. */
  features?: string[];
}

/** A discrete piece of dashboard functionality. */
export interface DashboardModule {
  /** Stable identifier — used by composition (replace/remove/order). */
  id: string;
  /** Optional nav contributions. */
  nav?: NavGroup[];
  /** Routes contributed by this module. Wired up by the app shell. */
  routes?: ReadonlyArray<DashboardRoute>;
  /**
   * Public routes contributed by this module — mounted OUTSIDE the
   * protected `_app` layout (no session required, no redirect-to-login).
   * Used for sign-up + future invite-acceptance flows (Phase 1.3 — ADR-021).
   */
  publicRoutes?: ReadonlyArray<DashboardRoute>;
  /** Slot extension points this module defines. */
  slots?: ReadonlyArray<SlotDefinition>;
  /** Slot contributions this module makes to other modules' slots. */
  slotFillers?: ReadonlyArray<SlotFiller>;
  /** Required capabilities; module is omitted if unsatisfied. */
  requires?: ModuleRequirements;
}

/** A route contributed by a module. The actual mounting strategy lives in
 *  `dashboard-app`, which converts these into framework-specific routes. */
export interface DashboardRoute {
  /** Pathname under the dashboard root. */
  path: string;
  /** React component for the route. Function components only; TanStack
   *  Router rejects ComponentClass-shaped values. */
  component: FunctionComponent;
  /** Optional capability gate on this specific route. */
  requires?: ModuleRequirements;
}
