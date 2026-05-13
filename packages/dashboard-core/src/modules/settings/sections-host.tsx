import { SlotHost, useSlotFillers } from "../slots.js";

/**
 * Renders the `settings.sections` slot. Indie ships with no fillers,
 * so the host emits nothing — including no heading — to keep the
 * Settings page free of empty scaffolding. Managed contributes Billing,
 * Plan, and Seats fillers via `dashboard-extensions`.
 */
export const SETTINGS_SECTIONS_SLOT = "settings.sections";

export function SettingsSectionsHost() {
  const fillers = useSlotFillers(SETTINGS_SECTIONS_SLOT);
  if (fillers.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <SlotHost slot={SETTINGS_SECTIONS_SLOT} />
    </div>
  );
}
