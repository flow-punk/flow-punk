import "@flowpunk-indie/dashboard-ui/styles.css";
import { createDashboardApp } from "@flowpunk-indie/dashboard-app";
import {
  baseModules,
  composeModules,
  makeUsersModule,
} from "@flowpunk-indie/dashboard-core";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

// Indie keeps the single-owner contract — exactly one active owner per
// deploy (users-core option `enforceSingleOwner: true`). The dashboard
// mirrors that constraint client-side as a usability hint; the server
// is authoritative.
const { modules, fillers } = composeModules({
  base: baseModules,
  add: [makeUsersModule({ enforceSingleOwner: true, showInvite: false })],
});

const app = createDashboardApp({
  modules,
  fillers,
  apiOrigin: import.meta.env.VITE_API_ORIGIN ?? "",
  hostStrategy: "single",
  features: {},
});

app.mount(root);
