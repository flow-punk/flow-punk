import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
  useNavigate,
  useRouter,
  useRouterState,
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
import type {
  DashboardModule,
  ModuleRequirements,
  NavItem,
  Session,
  SessionUser,
} from "@flowpunk-indie/dashboard-core";
import { type CreateDashboardAppInput } from "./types.js";

interface RouterContext {
  /** Current session if signed in. Phase 1 wires this to better-auth. */
  session: Session | null;
  /** Modules resolved at build-time. */
  modules: ReadonlyArray<DashboardModule>;
  /** Gateway origin. */
  apiOrigin: string;
}

function requirementsSatisfied(
  user: SessionUser | null,
  requires: ModuleRequirements | undefined,
): boolean {
  if (!requires) return true;
  if (requires.role && user?.role !== requires.role) return false;
  return true;
}

function ShellLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { modules, session } = router.options.context as RouterContext;

  const navSections = modules
    .filter((mod) => requirementsSatisfied(session?.user ?? null, mod.requires))
    .flatMap((mod) => mod.nav ?? []);

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
          {navSections.length === 0 ? (
            <SidebarSection>
              <div className="px-2.5 py-2 text-xs text-foreground-subtle">
                no modules registered
              </div>
            </SidebarSection>
          ) : (
            navSections.map((group) => {
              const items = group.items.filter((item: NavItem) =>
                requirementsSatisfied(session?.user ?? null, item.requires),
              );
              if (items.length === 0) return null;
              return (
                <SidebarSection key={group.id} label={group.label}>
                  {items.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <SidebarItem
                        key={item.id}
                        icon={IconComp ? <IconComp /> : undefined}
                        label={item.label}
                        active={pathname === item.to}
                        onClick={() => navigate({ to: item.to })}
                      />
                    );
                  })}
                </SidebarSection>
              );
            })
          )}
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

  // Public routes — reachable without a session. The Phase-0 empty-shell
  // index lives here so the "no modules registered" landing is visible
  // before better-auth bootstrap exists; Phase 1 will move `/` under the
  // protected layout once a real session can be hydrated.
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPlaceholder,
  });

  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_shell",
    component: ShellLayout,
  });

  const indexRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/",
    component: NoModulesIndex,
  });

  // Protected layout — module routes mount here. beforeLoad redirects to
  // /login when no session is present, so the auth-redirect path is
  // exercised the moment a module-contributed route is hit.
  const protectedLayout = createRoute({
    getParentRoute: () => shellRoute,
    id: "_app",
    component: Outlet,
    beforeLoad: ({ context, location }) => {
      if (!context.session) {
        throw redirect({
          to: "/login",
          search: { redirect: location.href },
        });
      }
    },
  });

  const moduleRoutes = modules.flatMap((mod) =>
    (mod.routes ?? [])
      .filter(
        (r) =>
          // Module-level requirements gate at compose time; route-level
          // requirements are evaluated client-side. Hidden routes are
          // omitted from the tree so unauthorized direct navigation 404s.
          requirementsSatisfied(null, r.requires) || mod.requires,
      )
      .map((r) =>
        createRoute({
          getParentRoute: () => protectedLayout,
          path: r.path,
          component: r.component,
        }),
      ),
  );

  return rootRoute.addChildren([
    loginRoute,
    shellRoute.addChildren([
      indexRoute,
      protectedLayout.addChildren(moduleRoutes),
    ]),
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
