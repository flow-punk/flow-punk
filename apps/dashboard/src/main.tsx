import "@flowpunk-indie/dashboard-ui/styles.css";
import { createDashboardApp } from "@flowpunk-indie/dashboard-app";
import { baseModules } from "@flowpunk-indie/dashboard-core";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

const app = createDashboardApp({
  modules: baseModules,
  apiOrigin: import.meta.env.VITE_API_ORIGIN ?? "",
  hostStrategy: "single",
  features: {},
});

app.mount(root);
