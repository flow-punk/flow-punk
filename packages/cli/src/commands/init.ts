import * as p from "@clack/prompts";
import { findD1ByName, queryD1 } from "@flowpunk/cf-admin";
import { renderLogo } from "../ui/logo.js";
import { theme } from "../ui/theme.js";
import { resolveAndVerify } from "./helpers.js";
import { provisionFresh } from "../flow/provision.js";
import {
  deploymentKey,
  readDeployment,
  writeDeployment,
} from "../auth/token-store.js";
import type { InitAnswers } from "../types.js";
import { CliError } from "../util/errors.js";

type OwnerSummary =
  | { kind: "one"; email: string; displayName: string }
  | { kind: "multi"; count: number }
  | { kind: "none" };

export interface InitOpts {
  token?: string;
  prefix?: string;
  account?: string;
}

const CLI_VERSION = "0.0.1-alpha.0";

export async function initCommand(opts: InitOpts): Promise<void> {
  process.stdout.write(renderLogo());

  // Auth: resolve a verified client.
  const initialResolve = await resolveAndVerify({
    explicitToken: opts.token,
    accountIdHint: opts.account,
  });
  const { token, tokenSource, accounts } = initialResolve;
  let { account, client } = initialResolve;

  if (accounts.length > 1 && !opts.account) {
    const choice = await p.select({
      message: "Which Cloudflare account should we deploy to?",
      options: accounts.map((a) => ({
        value: a.id,
        label: `${a.name} (${a.id})`,
      })),
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    account = accounts.find((a) => a.id === choice)!;
    // Rebuild client with the chosen account ID.
    const { createCfClient } = await import("@flowpunk/cf-admin");
    client = createCfClient({ apiToken: token, accountId: account.id });
  }

  const prefix =
    opts.prefix ??
    (await (async () => {
      const v = await p.text({
        message: "Worker name prefix?",
        placeholder: "flowpunk",
        defaultValue: "flowpunk",
        validate: (s) =>
          /^[a-z][a-z0-9-]{0,30}$/.test(s)
            ? undefined
            : "Lowercase letters, digits, hyphens. Start with a letter. Max 31 chars.",
      });
      if (p.isCancel(v)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      return v as string;
    })());

  // Existing deployment? Resume / Recreate / Different prefix.
  const key = deploymentKey(account.id, prefix);
  const existing = await readDeployment(key);
  if (existing) {
    const choice = await p.select({
      message: `A deployment already exists for ${account.name} with prefix "${prefix}". What now?`,
      options: [
        {
          value: "resume",
          label: "Resume (re-run init; existing resources will be reused)",
        },
        {
          value: "cancel",
          label: "Cancel and use `flowpunk update` / `flowpunk doctor` instead",
        },
        { value: "prefix", label: "Use a different prefix" },
      ],
    });
    if (p.isCancel(choice) || choice === "cancel") {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    if (choice === "prefix") {
      throw new CliError(
        "Pick a different prefix and re-run with --prefix <name>",
      );
    }
    // resume — fall through.
  }

  // No local-config record for (account, prefix), but the D1 might still
  // exist on Cloudflare from a prior `flowpunk teardown` that retained it.
  // If so, prompt the operator: Reuse (keep CRM data, revoke credentials)
  // or Cancel (and let them run `flowpunk teardown --prefix X` for a clean
  // slate). The Reuse path inherits the existing owner row's email +
  // display-name so we never insert a second `role='owner'` and never
  // collide with the unique-active `(user_id, label)` index on api_keys
  // when init mints its `flowpunk init` key.
  let inheritedOwner: { email: string; displayName: string } | null = null;
  let revokeCredentials = false;
  if (!existing) {
    const probableD1Name = `${prefix}-indie`;
    const cfD1 = await findD1ByName(client, probableD1Name);
    if (cfD1) {
      p.note(
        [
          `D1 database "${probableD1Name}" already exists on Cloudflare`,
          `(id ${cfD1.uuid.slice(0, 8)}…).`,
          ``,
          `Reusing keeps your CRM data (contacts, deals, pipelines, etc.)`,
          `but ${theme.warn("revokes all credentials")} — API keys, OAuth registrations,`,
          `browser sessions, and login tokens. A fresh API key is minted at the`,
          `end of init.`,
          ``,
          `If you want a clean slate (delete the D1 entirely), cancel and run:`,
          `  ${theme.accent(`flowpunk teardown --prefix ${prefix}`)}`,
          `then re-run \`flowpunk init\`.`,
        ].join("\n"),
        "Existing D1 detected",
      );

      const choice = await p.select({
        message: "What now?",
        options: [
          {
            value: "reuse",
            label: "Reuse — keep CRM data, revoke all credentials",
          },
          { value: "cancel", label: "Cancel" },
        ],
      });
      if (p.isCancel(choice) || choice === "cancel") {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      // Reuse path. Read owner state to decide between inherit / fall-through
      // / multi-owner abort. Schema-tolerant: an old/partial-init D1 missing
      // the `users` table or `display_name` column returns 'none' and we
      // fall through to normal email/display-name prompts; migrations
      // inside provisionFresh then bring the schema current and seedAdmin
      // inserts the first owner row.
      const ownerInfo = await readOwnerSummary(client, cfD1.uuid);
      if (ownerInfo.kind === "multi") {
        throw new CliError(
          `Existing D1 has ${ownerInfo.count} active owner rows (expected 1).`,
          `Resolve via \`flowpunk admin reset --prefix ${prefix}\` or manual D1 inspection, then re-run \`flowpunk init\`.`,
        );
      }
      if (ownerInfo.kind === "one") {
        inheritedOwner = {
          email: ownerInfo.email,
          displayName: ownerInfo.displayName,
        };
        p.note(
          `Reusing existing admin: ${theme.accent(ownerInfo.email)}`,
          "Inherited",
        );
      }
      // 'none' → fall through silently.

      revokeCredentials = true;
    }
  }

  const adminEmail =
    inheritedOwner?.email ??
    (await (async () => {
      const v = await p.text({
        message: "Admin email?",
        validate: (s) =>
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
            ? undefined
            : "Enter a valid email.",
      });
      if (p.isCancel(v)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      return v as string;
    })());
  const adminDisplayName =
    inheritedOwner?.displayName ??
    (await (async () => {
      const v = await p.text({
        message: "Admin display name?",
        placeholder: "Operator",
        defaultValue: "Operator",
      });
      if (p.isCancel(v)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      return v as string;
    })());

  const answers: InitAnswers = {
    accountId: account.id,
    accountName: account.name,
    prefix,
    adminEmail,
    adminDisplayName,
  };

  p.note(
    [
      `Account:    ${account.name} (${account.id})`,
      `Prefix:     ${prefix}`,
      `Admin:      ${answers.adminEmail}`,
      ``,
      `Will create on Cloudflare:`,
      `  • 1 D1 database`,
      `  • 6 KV namespaces`,
      `  • 5 Workers (1 public gateway + 4 internal)`,
      `  • 1 Durable Object class`,
    ].join("\n"),
    "Plan summary",
  );
  const confirm = await p.confirm({ message: "Proceed?" });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Persist after every inventory-mutating step so a partial failure leaves a
  // recoverable state file. Re-running `init` then resumes via find-then-create.
  const result = await provisionFresh(
    client,
    answers,
    CLI_VERSION,
    async (rec) => {
      await writeDeployment(key, rec);
    },
    { revokeCredentialsBeforeSeed: revokeCredentials },
  );
  await writeDeployment(key, result.record);

  // Suppress unused-import warning for `tokenSource` (logged in deployment record).
  void tokenSource;

  printSuccessCard(result);
}

function printSuccessCard(result: {
  record: { resources: { workers: { gateway: { url?: string } } } };
  apiKey: string;
}): void {
  const url = result.record.resources.workers.gateway.url ?? "<gateway-url>";
  const banner = "═".repeat(72);
  const lines = [
    "",
    theme.brand(banner),
    theme.bold("  flow-punk indie is live — API key below is shown ONCE"),
    theme.brand(banner),
    "",
    `${theme.bold("Gateway URL:")}  ${theme.accent(url)}`,
    `${theme.bold("API key:")}      ${theme.accent(result.apiKey)}`,
    "",
    theme.bold("First-time browser login:"),
    `  ${theme.accent("flowpunk connect")}`,
    `  ${theme.dim("then visit")} ${theme.accent(`${url}/auth/login`)}`,
    `  ${theme.dim("and paste the printed login token (30-minute one-shot).")}`,
    "",
    theme.bold("Try the API:"),
    `  ${theme.accent(`curl -H "Authorization: Bearer ${result.apiKey}" \\`)}`,
    `  ${theme.accent(`     ${url}/api/v1/contacts`)}`,
    "",
    theme.bold("Connect MCP — browser or hosted agents (Claude.ai, ChatGPT)"),
    `  ${theme.dim("Paste this URL — login is handled via OAuth in the browser:")}`,
    `    ${theme.accent(`${url}/mcp`)}`,
    `  ${theme.dim("(if this is your first connection, complete the browser-login step above first)")}`,
    "",
    theme.bold(
      "Connect MCP — desktop or IDE clients (Claude Desktop, Cursor, …)",
    ),
    `  ${theme.dim("Paste into your MCP config (uses your API key directly):")}`,
    theme.accent(
      JSON.stringify(
        {
          mcpServers: {
            flowpunk: {
              url: `${url}/mcp`,
              headers: { Authorization: `Bearer ${result.apiKey}` },
            },
          },
        },
        null,
        2,
      ),
    ),
    "",
    theme.dim(
      `Day-2 upgrades: \`flowpunk update\`. Health check: \`flowpunk doctor\`.`,
    ),
    theme.brand(banner),
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

async function readOwnerSummary(
  client: Parameters<typeof queryD1>[0],
  databaseId: string,
): Promise<OwnerSummary> {
  try {
    const rows = await queryD1(client, {
      databaseId,
      sql: `SELECT email, display_name FROM users
            WHERE role = 'owner' AND status = 'active'
            ORDER BY created_at ASC;`,
      params: [],
    });
    const collected: Array<{ email: string; displayName: string }> = [];
    for (const r of rows) {
      if (Array.isArray(r.results)) {
        for (const row of r.results) {
          if (
            row &&
            typeof row === "object" &&
            "email" in row &&
            "display_name" in row
          ) {
            const email = (row as { email: unknown }).email;
            const displayName = (row as { display_name: unknown }).display_name;
            if (typeof email === "string" && typeof displayName === "string") {
              collected.push({ email, displayName });
            }
          }
        }
      }
    }
    if (collected.length === 0) return { kind: "none" };
    if (collected.length === 1) {
      return {
        kind: "one",
        email: collected[0]!.email,
        displayName: collected[0]!.displayName,
      };
    }
    return { kind: "multi", count: collected.length };
  } catch {
    return { kind: "none" };
  }
}
