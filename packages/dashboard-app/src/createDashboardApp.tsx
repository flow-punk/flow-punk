import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  ApiOriginProvider,
  createQueryClient,
} from "@flowpunk-indie/dashboard-core";
import { TooltipProvider, Toaster } from "@flowpunk-indie/dashboard-ui";
import type { CreateDashboardAppInput } from "./types.js";
import { AppRouter, createAppRouter } from "./routes.js";

export interface DashboardApp {
  /** Mount the dashboard into a DOM node (browser entry). The Worker SSR
   *  entry is added when TanStack Start + Cloudflare Nitro preset wiring
   *  lands; for now both apps build to a static SPA bundle served by a
   *  Worker via Cloudflare Workers Assets. */
  mount(target: Element): void;
}

export function createDashboardApp(input: CreateDashboardAppInput): DashboardApp {
  return {
    mount(target: Element): void {
      // Session hydration runs inside the protected layout via
      // `useSession` (Phase 1.3 — ADR-021). Router context no longer
      // carries the session; the router doesn't gate on auth, the
      // `_app` layout does (so the redirect-on-no-session path is
      // exercised the moment a protected route renders).
      const router = createAppRouter(input);
      const queryClient = createQueryClient();
      createRoot(target).render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <ApiOriginProvider apiOrigin={input.apiOrigin}>
              <TooltipProvider>
                <AppRouter router={router} />
                <Toaster />
              </TooltipProvider>
            </ApiOriginProvider>
          </QueryClientProvider>
        </StrictMode>,
      );
    },
  };
}
