import { Suspense } from "react";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
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
} from "@flowpunk-indie/dashboard-ui";
import {
  ForgotPasswordScreen,
  ResetPasswordConfirmScreen,
  SignInScreen,
  useSession,
  type DashboardModule,
  type ModuleRequirements,
  type NavItem,
  type SessionUser,
} from "@flowpunk-indie/dashboard-core";
import { type CreateDashboardAppInput } from "./types.js";

interface RouterContext {
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
  const { modules } = router.options.context as RouterContext;
  const { session } = useSession();

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

interface LoginSearch {
  redirect?: string;
}

function LoginRoute() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as LoginSearch;
  return (
    <SignInScreen
      onSignedIn={() =>
        navigate({ to: (search?.redirect ?? "/") as "/" })
      }
      onForgotPassword={() => navigate({ to: "/login/reset" })}
    />
  );
}

function ForgotPasswordRoute() {
  const navigate = useNavigate();
  return <ForgotPasswordScreen onBack={() => navigate({ to: "/login" })} />;
}

interface ResetSearch {
  token?: string;
}

function ResetPasswordConfirmRoute() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ResetSearch;
  const token = search?.token ?? "";
  if (!token) {
    return (
      <div className="grid min-h-screen place-items-center bg-background-muted px-5 py-10">
        <p className="text-[13.5px] text-foreground-muted">
          Invalid reset link.
        </p>
      </div>
    );
  }
  return (
    <ResetPasswordConfirmScreen
      token={token}
      onDone={() => navigate({ to: "/login" })}
    />
  );
}

/**
 * Wrapper component that gates the protected shell on the better-auth
 * session resolving. While `useSession` is fetching for the first time we
 * render a minimal splash so the user never sees the shell flash before
 * the redirect-to-login fires.
 *
 * `beforeLoad` cannot read React-Query state, so the redirect happens
 * here in a synchronous render path once `isLoading === false`.
 */
function ProtectedShellGate() {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background-muted">
        <p className="text-sm text-foreground-muted">Loading…</p>
      </div>
    );
  }
  if (!session) {
    queueMicrotask(() =>
      navigate({
        to: "/login",
        search: { redirect: pathname },
      }),
    );
    return null;
  }
  return <ShellLayout />;
}

function buildRoutes(modules: ReadonlyArray<DashboardModule>) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: () => (
      <Suspense fallback={<SuspenseFallback />}>
        <Outlet />
      </Suspense>
    ),
  });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginRoute,
  });
  const forgotRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login/reset",
    component: ForgotPasswordRoute,
  });
  const resetConfirmRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login/reset/confirm",
    component: ResetPasswordConfirmRoute,
  });

  // Protected shell — every authenticated route lives under this layout.
  // ProtectedShellGate hydrates the session in-place; the index route now
  // sits under it (the Phase-0 lift to a public `_shell` is reverted now
  // that `useSession` hydrates pre-paint).
  const protectedShell = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    component: ProtectedShellGate,
  });

  const indexRoute = createRoute({
    getParentRoute: () => protectedShell,
    path: "/",
    component: NoModulesIndex,
  });

  const moduleRoutes = modules.flatMap((mod) =>
    (mod.routes ?? [])
      .filter(
        (r) =>
          requirementsSatisfied(null, r.requires) || mod.requires,
      )
      .map((r) =>
        createRoute({
          getParentRoute: () => protectedShell,
          path: r.path,
          component: r.component,
        }),
      ),
  );

  // Public module-contributed routes — mounted outside `_app`, no
  // session gate. Used for sign-up and similar pre-auth surfaces
  // (Phase 1.3 — ADR-021). Indie modules don't contribute any today;
  // managed's signup module is the first.
  const publicModuleRoutes = modules.flatMap((mod) =>
    (mod.publicRoutes ?? []).map((r) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: r.path,
        component: r.component,
      }),
    ),
  );

  return rootRoute.addChildren([
    loginRoute,
    forgotRoute,
    resetConfirmRoute,
    ...publicModuleRoutes,
    protectedShell.addChildren([indexRoute, ...moduleRoutes]),
  ]);
}

function SuspenseFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-background-muted">
      <p className="text-sm text-foreground-muted">Loading…</p>
    </div>
  );
}

export function createAppRouter(input: CreateDashboardAppInput) {
  const routeTree = buildRoutes(input.modules);
  return createRouter({
    routeTree,
    context: {
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

