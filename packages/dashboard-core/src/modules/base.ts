import type { DashboardModule } from "./types.js";

/** Modules land in later phases (users, api-keys, settings, accounts, etc.). */
export const baseModules: ReadonlyArray<DashboardModule> = [];
