import type { DashboardModule, SlotFiller } from "@flowpunk-indie/dashboard-core";

/** Indie always runs `single`; managed selects based on host. */
export type HostStrategy = "single" | "tenant-subdomain" | "console";

/** Build-time feature toggles. Conditional UI surfaces are gated by these
 *  flags so indie bundles never include managed-only routes/components. */
export interface DashboardFeatures {
  /** Cross-host /__session/redeem route (managed only). */
  crossHostSwitcher?: "enabled" | "disabled";
  /** Workspace switcher dropdown in the topbar (managed only). */
  workspaceSwitcher?: "enabled" | "disabled";
  /** Managed self-serve sign-up screen (managed only). */
  selfServeSignup?: "enabled" | "disabled";
}

export interface CreateDashboardAppInput {
  modules: ReadonlyArray<DashboardModule>;
  /** Extra slot fillers contributed outside of any module. */
  fillers?: ReadonlyArray<SlotFiller>;
  /** Origin of the gateway, e.g. https://api.example.com */
  apiOrigin: string;
  hostStrategy: HostStrategy;
  features?: DashboardFeatures;
}
