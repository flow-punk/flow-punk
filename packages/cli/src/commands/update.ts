import * as p from "@clack/prompts";
import { resolveAndVerify } from "./helpers.js";
import {
  deploymentKey,
  readConfig,
  writeDeployment,
} from "../auth/token-store.js";
import { theme } from "../ui/theme.js";
import { CliError } from "../util/errors.js";
import { updateDeployment } from "../flow/update.js";
import type { ServiceName } from "../types.js";

const CLI_VERSION = "0.0.1-alpha.0";

export interface UpdateOpts {
  token?: string;
  account?: string;
  prefix?: string;
  schemaOnly?: boolean;
  codeOnly?: boolean;
  service?: string;
}

const SERVICES: ServiceName[] = [
  "gateway",
  "auth",
  "contacts",
  "pipeline",
  "users",
];

export async function updateCommand(opts: UpdateOpts): Promise<void> {
  const { client, account } = await resolveAndVerify({
    explicitToken: opts.token,
    accountIdHint: opts.account,
  });

  const config = await readConfig();
  const matching = Object.values(config.deployments).filter(
    (d) =>
      d.accountId === account.id && (!opts.prefix || d.prefix === opts.prefix),
  );
  if (matching.length === 0) {
    throw new CliError(
      `No deployment for account ${account.name}`,
      "Run `flowpunk init` first.",
    );
  }
  if (matching.length > 1 && !opts.prefix) {
    throw new CliError(
      `Multiple deployments: ${matching.map((d) => d.prefix).join(", ")}`,
      "Pass --prefix <name>.",
    );
  }
  const dep = matching[0]!;

  if (opts.service && !SERVICES.includes(opts.service as ServiceName)) {
    throw new CliError(
      `Unknown service "${opts.service}"`,
      `Valid: ${SERVICES.join(", ")}`,
    );
  }

  p.note(
    [
      `Account: ${dep.accountName}`,
      `Prefix:  ${dep.prefix}`,
      `Mode:    ${
        opts.schemaOnly
          ? "schema only"
          : opts.codeOnly
            ? "code only"
            : opts.service
              ? `single service: ${opts.service}`
              : "schema + code"
      }`,
    ].join("\n"),
    "Update plan",
  );

  const outcome = await updateDeployment(client, dep, CLI_VERSION, {
    schemaOnly: opts.schemaOnly,
    codeOnly: opts.codeOnly,
    onlyService: opts.service as ServiceName | undefined,
  });

  await writeDeployment(
    deploymentKey(dep.accountId, dep.prefix),
    outcome.record,
  );

  p.note(
    [
      `Migrations applied: ${outcome.migrationsApplied.length === 0 ? theme.dim("(none)") : outcome.migrationsApplied.join(", ")}`,
      `Workers redeployed: ${outcome.workersRedeployed.length === 0 ? theme.dim("(none)") : outcome.workersRedeployed.join(", ")}`,
      `Workers unchanged:  ${outcome.workersUnchanged.length === 0 ? theme.dim("(none)") : theme.dim(outcome.workersUnchanged.join(", "))}`,
    ].join("\n"),
    `${theme.ok("✓")} Update complete`,
  );
}
