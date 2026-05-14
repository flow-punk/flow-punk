import type { FunctionComponent } from "react";
import type {
  DashboardModule,
  SlotFiller,
} from "@flowpunk-indie/dashboard-core";

/** Indie always runs `single`; managed selects based on host. */
export type HostStrategy = "single" | "tenant-subdomain" | "console";

/** Build-time feature toggles. Indie passes `{}` here so the indie
 *  bundle truly never references managed-only routes / components —
 *  neither the redeem path string nor any component imported from
 *  a managed-only package. The `verify-bundle-clean.mjs` scrub
 *  script grep-checks the emitted JS for forbidden markers as the
 *  runtime proof of this invariant.
 *
 *  Selfserve sign-up is a separate concern (Phase 1.3) and is
 *  controlled through its own flag because the signup module is
 *  registered through `resolveTenantExtensions`, not as a route
 *  contribution here. */
export interface ExtraPublicRoute {
  /** Full path the host app supplies. Used verbatim. */
  path: string;
  /** Route component for the path. */
  component: FunctionComponent;
}

export interface DashboardFeatures {
  /** Managed self-serve sign-up screen (managed only). */
  selfServeSignup?: "enabled" | "disabled";
  /**
   * Extra public routes the host app contributes (mounted outside
   * the protected shell). Managed uses this to register the
   * `/__session/redeem` route with its `SessionRedeemScreen`
   * component — the path string + the component live in the
   * managed app entry, so the indie bundle never sees them. Indie
   * omits this entirely.
   */
  extraPublicRoutes?: ReadonlyArray<ExtraPublicRoute>;
  /**
   * Component the host app supplies for the topbar workspace
   * switcher. Indie omits this; managed passes `WorkspaceSwitcher`
   * imported from `@flowpunk-managed/dashboard-auth`. Rendered only
   * when truthy.
   */
  topbarActionsComponent?: FunctionComponent;
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
