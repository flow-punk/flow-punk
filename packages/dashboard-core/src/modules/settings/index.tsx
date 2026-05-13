import {
  Icon,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@flowpunk-indie/dashboard-ui";
import { useSearch, useNavigate } from "@tanstack/react-router";
import type { DashboardModule } from "../types.js";
import { SettingsProfile } from "./profile.js";
import { SettingsSecurity } from "./security.js";
import {
  SETTINGS_SECTIONS_SLOT,
  SettingsSectionsHost,
} from "./sections-host.js";
import { useSlotFillers } from "../slots.js";

const VALID_TABS = ["profile", "security", "extras"] as const;
type TabId = (typeof VALID_TABS)[number];

function isTab(v: unknown): v is TabId {
  return typeof v === "string" && (VALID_TABS as readonly string[]).includes(v);
}

function SettingsScreen() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const tab: TabId = isTab(search?.tab) ? search.tab : "profile";
  const extraFillers = useSlotFillers(SETTINGS_SECTIONS_SLOT);
  const showExtras = extraFillers.length > 0;

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="Settings"
        subtitle="Profile, password, sessions, and workspace extras."
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ to: "/settings" as "/", search: { tab: v } as never })
        }
      >
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {showExtras && <TabsTrigger value="extras">Workspace</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile">
          <SettingsProfile />
        </TabsContent>
        <TabsContent value="security">
          <SettingsSecurity />
        </TabsContent>
        {showExtras && (
          <TabsContent value="extras">
            <SettingsSectionsHost />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/**
 * Settings module. Exposes the `settings.sections` slot — managed
 * contributes Billing / Plan / Seats sections via
 * `@flowpunk-managed/dashboard-extensions` (stable filler ids, explicit
 * order). Indie ships with no fillers and hides the extras tab entirely
 * so the empty surface never shows.
 */
export const settingsModule: DashboardModule = {
  id: "settings",
  nav: [
    {
      id: "workspace.settings",
      label: "Workspace",
      items: [
        {
          id: "settings",
          label: "Settings",
          to: "/settings",
          icon: ({ className }) => (
            <Icon name="sliders" className={className} />
          ),
        },
      ],
    },
  ],
  routes: [
    {
      path: "/settings",
      component: SettingsScreen,
    },
  ],
  slots: [
    {
      id: SETTINGS_SECTIONS_SLOT,
      description:
        "Additional Settings tab content. Managed contributes Billing, " +
        "Plan, and Seats fillers. Filler component prop shape: {} (no props).",
    },
  ],
};

export { SettingsProfile } from "./profile.js";
export { SettingsSecurity } from "./security.js";
export { SettingsSectionsHost, SETTINGS_SECTIONS_SLOT } from "./sections-host.js";
export {
  useActiveSessions,
  useChangePassword,
  useRevokeSession,
  useSignOutEverywhere,
  SESSIONS_QUERY_KEY,
} from "./hooks.js";
