import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClientProvider,
} from "@tanstack/react-query";
import { createQueryClient } from "@flowpunk-indie/dashboard-core";
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
      // Session is null at startup; Phase 1 swaps this for a better-auth
      // bootstrap that hydrates `session` before the first paint.
      const router = createAppRouter(input, null);
      const queryClient = createQueryClient();
      createRoot(target).render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppRouter router={router} />
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </StrictMode>,
      );
    },
  };
}
