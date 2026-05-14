import * as p from "@clack/prompts";
import {
  CfAdminError,
  createCfClient,
  type CfClient,
} from "@flowpunk/cf-admin";
import { resolveToken, runWranglerLogin } from "../auth/oauth.js";
import { listAccounts, type AccountSummary } from "../auth/verify.js";
import { CliError } from "../util/errors.js";
import { theme } from "../ui/theme.js";

/**
 * Read token + account, verify against CF, and return a configured client.
 * Used by every command that touches Cloudflare (init, update, doctor,
 * teardown, admin reset, logs).
 *
 * Auth behavior:
 *  - If no credentials are available AND `--token` was not passed: trigger
 *    `wrangler login` interactively (browser OAuth), then proceed.
 *  - If `--token` was passed but is invalid/revoked: hard-fail with a clear
 *    message. We do NOT silently fall back to OAuth, since `--token` is
 *    typically used in CI where a browser prompt would hang.
 *  - If wrangler-stored credentials are invalid: hard-fail with a hint to
 *    re-run `flowpunk login`. (Don't auto-relogin in a loop.)
 */
export async function resolveAndVerify(opts: {
  explicitToken?: string;
  accountIdHint?: string;
}): Promise<{
  client: CfClient;
  token: string;
  tokenSource: "wrangler-oauth" | "explicit";
  accounts: AccountSummary[];
  account: AccountSummary;
}> {
  const { apiToken, source } = await resolveTokenOrLogin(opts);

  // Two-stage: first build a no-account client to list accounts, then pick
  // and rebuild with the real accountId.
  //
  // We deliberately do NOT call `/user/tokens/verify` here — that endpoint
  // is for CF API Tokens (the manually-created kind) and rejects wrangler
  // OAuth access tokens with 401, even when they're perfectly valid. The
  // `listAccounts` call below serves the same purpose: if the token is
  // unauthenticated, this is where we'll find out, and the error handling
  // below converts it to a friendly message.
  const probeClient = createCfClient({ apiToken, accountId: "unknown" });
  let accounts: AccountSummary[];
  try {
    accounts = await listAccounts(probeClient);
  } catch (err) {
    if (err instanceof CfAdminError && err.code === "unauthenticated") {
      if (source === "explicit") {
        throw new CliError(
          "The provided --token is invalid or revoked",
          "Generate a fresh token at https://dash.cloudflare.com/profile/api-tokens.",
        );
      }
      throw new CliError(
        "Your stored Cloudflare credentials are invalid or revoked",
        "Run `flowpunk login` to re-authenticate.",
      );
    }
    throw err;
  }
  if (accounts.length === 0) {
    throw new CliError(
      "Token has no accessible Cloudflare accounts",
      "The token must include the `Account: Read` scope.",
    );
  }
  const account = pickAccount(accounts, opts.accountIdHint);
  const client = createCfClient({ apiToken, accountId: account.id });
  return { client, token: apiToken, tokenSource: source, accounts, account };
}

/**
 * Resolve a token; if none available AND no explicit token was passed,
 * trigger `wrangler login` and retry once. If --token was passed but
 * couldn't be read, that's a programming error in the caller — propagate.
 */
async function resolveTokenOrLogin(opts: {
  explicitToken?: string;
}): Promise<{ apiToken: string; source: "wrangler-oauth" | "explicit" }> {
  try {
    return await resolveToken({ explicitToken: opts.explicitToken });
  } catch (err) {
    // If the user passed --token (or set CLOUDFLARE_API_TOKEN) and we still
    // failed to resolve, that's not an auth-state issue — propagate.
    if (opts.explicitToken || process.env.CLOUDFLARE_API_TOKEN) throw err;

    p.note(
      [
        "You're not logged in to Cloudflare yet.",
        "",
        theme.dim(
          "Opening your browser to authorize. This is a one-time step.",
        ),
      ].join("\n"),
      "Cloudflare login",
    );
    await runWranglerLogin();
    return await resolveToken({ explicitToken: opts.explicitToken });
  }
}

function pickAccount(
  accounts: AccountSummary[],
  hint?: string,
): AccountSummary {
  if (hint) {
    const match = accounts.find((a) => a.id === hint);
    if (!match) {
      throw new CliError(
        `Account "${hint}" not visible to this token`,
        `Visible accounts: ${accounts.map((a) => a.id).join(", ")}`,
      );
    }
    return match;
  }
  if (accounts.length === 1) return accounts[0]!;
  // Multiple accounts and no hint: caller must prompt the user. We can't
  // do that here (helpers run in non-interactive doctor too), so return
  // the first and let the caller decide. `init` always prompts before
  // calling this with a hint set.
  return accounts[0]!;
}
