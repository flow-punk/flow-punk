import type { DashboardModule } from "./types.js";
import { apiKeysModule } from "./api-keys/index.js";
import { settingsModule } from "./settings/index.js";

/**
 * Edition-agnostic base modules. The users module is NOT included here:
 * it's a parameterized factory (`makeUsersModule({ enforceSingleOwner })`)
 * so each edition's wrapper passes its own constraint at app entry.
 * Managed's wrapper can also REPLACE the users module entirely with a
 * multi-seat variant via `resolveTenantExtensions.replace`.
 *
 * api-keys + settings ship as edition-agnostic singletons — the
 * server-side `maxActiveKeys` cap (indie 1, managed 5) is enforced
 * inside auth-core, and the settings module exposes a slot
 * (`settings.sections`) for managed to extend.
 */
export const baseModules: ReadonlyArray<DashboardModule> = [
  apiKeysModule,
  settingsModule,
];
