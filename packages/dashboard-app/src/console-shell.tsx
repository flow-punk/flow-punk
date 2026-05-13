import {
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  AppShell,
  Badge,
  Sidebar,
  SidebarItem,
  SidebarSection,
  Topbar,
  TopbarIconButton,
  Icon,
} from "@flowpunk-indie/dashboard-ui";
import {
  useSession,
  type DashboardModule,
  type ModuleRequirements,
  type NavItem,
  type SessionUser,
} from "@flowpunk-indie/dashboard-core";

interface ConsoleRouterContext {
  modules: ReadonlyArray<DashboardModule>;
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

/**
 * Console host shell. Diverges from the tenant `ShellLayout` in three
 * deliberate ways (ADR-016 §"Managed host model"):
 *
 *   - No workspace switcher: there's no workspace context on the console.
 *   - Sidebar branding marks the surface as a platform-admin tool so
 *     operators never confuse it with a tenant view.
 *   - Topbar surfaces a `Platform admin` badge + the signed-in email,
 *     plus a sign-out trigger; the search input is omitted (cross-tenant
 *     search has its own dedicated route under `/search`).
 */
export function ConsoleShellLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { modules } = router.options.context as ConsoleRouterContext;
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
              <span className="grid h-[26px] w-[26px] place-items-center rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-semibold text-white">
                FP
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[13.5px] font-semibold">flow-punk</span>
                <span className="text-[10.5px] uppercase tracking-wide text-foreground-subtle">
                  console
                </span>
              </span>
            </button>
          }
        >
          {navSections.length === 0 ? (
            <SidebarSection>
              <div className="px-2.5 py-2 text-xs text-foreground-subtle">
                no platform modules registered
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
          actions={
            <>
              <div className="flex items-center gap-2 pr-1 text-[12.5px]">
                <Badge tone="warn">Platform admin</Badge>
                {session?.user.email ? (
                  <span className="text-foreground-muted">
                    {session.user.email}
                  </span>
                ) : null}
              </div>
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
