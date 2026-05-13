import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import {
  AppShell,
  Sidebar,
  SidebarItem,
  SidebarSection,
  Topbar,
  TopbarSearch,
  TopbarIconButton,
  Icon,
  Button,
  Input,
  Label,
} from "@flowpunk-indie/dashboard-ui";
import type { DashboardModule, Session } from "@flowpunk-indie/dashboard-core";
import { type CreateDashboardAppInput } from "./types.js";

interface RouterContext {
  /** Current session if signed in. Phase 1 wires this to better-auth. */
  session: Session | null;
  /** Modules resolved at build-time. */
  modules: ReadonlyArray<DashboardModule>;
  /** Gateway origin. */
  apiOrigin: string;
}

function ShellLayout() {
  const navigate = useNavigate();
  return (
    <AppShell
      sidebar={
        <Sidebar
          header={
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left hover:bg-background-hover"
            >
              <span className="grid h-[26px] w-[26px] place-items-center rounded-md bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-xs font-semibold text-white">
                FP
              </span>
              <span className="text-[13.5px] font-semibold">flow-punk</span>
            </button>
          }
        >
          <SidebarSection>
            <SidebarItem
              icon={<Icon name="home" />}
              label="Home"
              onClick={() => navigate({ to: "/" })}
              active
            />
          </SidebarSection>
        </Sidebar>
      }
      topbar={
        <Topbar
          search={<TopbarSearch />}
          actions={
            <>
              <TopbarIconButton icon={<Icon name="bell" />} label="Notifications" />
              <TopbarIconButton icon={<Icon name="help" />} label="Help" />
            </>
          }
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}

function NoModulesIndex() {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">
        no modules registered
      </h1>
      <p className="mt-2 text-sm text-foreground-muted">
        The dashboard factory was invoked with an empty module set. Register
        modules in the app entry to start rendering real screens.
      </p>
    </div>
  );
}

function LoginPlaceholder() {
  return (
    <div className="grid min-h-screen place-items-center bg-background-muted px-5 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-[13px] font-semibold text-white">
            FP
          </span>
          <span className="text-base font-semibold tracking-tight">flow-punk</span>
        </div>
        <h1 className="m-0 text-center text-[22px] font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="-mt-3 text-center text-[13.5px] text-foreground-muted">
          Real sign-in flow lands in Phase 1 (ADR-021 — better-auth).
        </p>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => e.preventDefault()}>
          <div>
            <Label htmlFor="email" className="mb-1.5 block">
              Email
            </Label>
            <Input id="email" type="email" autoComplete="email" disabled />
          </div>
          <Button type="submit" variant="default" disabled className="w-full">
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}

function buildRoutes(modules: ReadonlyArray<DashboardModule>) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
  });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPlaceholder,
  });

  const protectedLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    component: ShellLayout,
    beforeLoad: ({ context, location }) => {
      if (!context.session) {
        throw redirect({
          to: "/login",
          search: { redirect: location.href },
        });
      }
    },
  });

  const indexRoute = createRoute({
    getParentRoute: () => protectedLayout,
    path: "/",
    component: NoModulesIndex,
  });

  const moduleRoutes = modules.flatMap((mod) =>
    (mod.routes ?? []).map((r) =>
      createRoute({
        getParentRoute: () => protectedLayout,
        path: r.path,
        component: r.component,
      }),
    ),
  );

  return rootRoute.addChildren([
    loginRoute,
    protectedLayout.addChildren([indexRoute, ...moduleRoutes]),
  ]);
}

export function createAppRouter(input: CreateDashboardAppInput, session: Session | null) {
  const routeTree = buildRoutes(input.modules);
  return createRouter({
    routeTree,
    context: {
      session,
      modules: input.modules,
      apiOrigin: input.apiOrigin,
    },
    defaultPreload: "intent",
  });
}

export function AppRouter({
  router,
}: {
  router: ReturnType<typeof createAppRouter>;
}) {
  return <RouterProvider router={router} />;
}
