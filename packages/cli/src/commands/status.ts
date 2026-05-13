import * as p from "@clack/prompts";
import { readConfig } from "../auth/token-store.js";
import { theme } from "../ui/theme.js";

/** Default action when `flowpunk` is invoked bare. */
export async function statusCommand(): Promise<void> {
  const config = await readConfig();
  const deployments = Object.values(config.deployments);
  if (deployments.length === 0) {
    p.note(
      `No deployments yet.\n${theme.dim("Run `flowpunk init` to provision a fresh indie deployment.")}`,
      "flow-punk",
    );
    return;
  }
  const lines = deployments.map(
    (d) =>
      `${theme.brand("●")} ${d.accountName} / ${d.prefix} ${theme.dim("— " + (d.resources.workers.gateway.url ?? "unknown URL"))}`,
  );
  p.note(
    [
      ...lines,
      ``,
      theme.dim(
        "Commands: `flowpunk doctor` (health) · `flowpunk update` (apply changes) · `flowpunk teardown`",
      ),
    ].join("\n"),
    "flow-punk deployments",
  );
}
