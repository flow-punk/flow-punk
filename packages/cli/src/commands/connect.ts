import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import * as p from '@clack/prompts';
import { queryD1 } from '@flowpunk/cf-admin';
import { generateId } from '@flowpunk/service-utils';

import { resolveAndVerify } from './helpers.js';
import { readConfig } from '../auth/token-store.js';
import { theme } from '../ui/theme.js';
import { CliError } from '../util/errors.js';

export interface ConnectOpts {
  token?: string;
  account?: string;
  prefix?: string;
}

const TOKEN_TTL_SECONDS = 5 * 60;

/**
 * `flowpunk connect` — mint a one-shot 5-minute browser-login token and
 * print its plaintext for the operator to paste into `/auth/login`.
 *
 * Per ADR-019 amendment 2026-05-06. Authorization is implicit: this
 * command can only succeed if the operator already has Cloudflare API
 * access to the deployment's account + D1, the same authority model
 * `flowpunk init` and `flowpunk update` use. No additional indie-side
 * credential is required.
 *
 * Token mechanics:
 *   - 32 bytes of crypto-random base64url (matches the cookie payload
 *     entropy used elsewhere in the indie auth surface).
 *   - SHA-256 hashed before storage; plaintext is printed once and never
 *     persisted.
 *   - 5-minute expiry; one-shot consumption is enforced server-side at
 *     `POST /auth/login` via `auth_login_tokens.consumed_at`.
 *   - Bound to the seeded owner user (`role='owner'`); future multi-user
 *     adds `--user <id>`.
 */
export async function connectCommand(opts: ConnectOpts): Promise<void> {
  const { client, account } = await resolveAndVerify({
    explicitToken: opts.token,
    accountIdHint: opts.account,
  });

  const config = await readConfig();
  const matching = Object.values(config.deployments).filter(
    (d) =>
      d.accountId === account.id &&
      (!opts.prefix || d.prefix === opts.prefix),
  );
  if (matching.length === 0) {
    throw new CliError(
      `No deployment recorded for account ${account.name}`,
      'Run `flowpunk init` first.',
    );
  }
  if (matching.length > 1 && !opts.prefix) {
    throw new CliError(
      `Multiple deployments on this account: ${matching.map((d) => d.prefix).join(', ')}`,
      'Pass --prefix <name>.',
    );
  }
  const dep = matching[0]!;
  const gatewayUrl = dep.resources.workers.gateway.url;
  if (!gatewayUrl) {
    throw new CliError(
      'Gateway URL missing from deployment record',
      'Re-run `flowpunk init --resume` to fix the record, then retry.',
    );
  }

  const databaseId = dep.resources.d1.id;

  // Look up the seeded owner. Indie's single-operator model has exactly
  // one; we pick the oldest by `created_at` so the choice is stable
  // across re-runs.
  const ownerId = await findOwnerUserId(client, databaseId);
  if (!ownerId) {
    throw new CliError(
      'No owner user found in the indie users table',
      'Run `flowpunk admin reset` to seed a fresh owner, or check the deployment is reachable.',
    );
  }

  // Generate token: 32 random bytes, base64url-stripped, sliced to 32
  // chars (matches `seedAdmin.generateCookiePayload`).
  const token = base64UrlPayload();
  const tokenHash = sha256Hex(token);
  const tokenId = generateId('alt');
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(
    Date.now() + TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  await queryD1(client, {
    databaseId,
    sql: `INSERT INTO auth_login_tokens (id, token_hash, user_id, expires_at, consumed_at, created_at, created_by)
          VALUES (?, ?, ?, ?, NULL, ?, ?);`,
    params: [tokenId, tokenHash, ownerId, expiresIso, nowIso, 'flowpunk-cli'],
  });

  const banner = '═'.repeat(72);
  process.stdout.write(
    [
      '',
      theme.brand(banner),
      theme.bold('  Login token — valid for 5 minutes, single use'),
      theme.brand(banner),
      '',
      `${theme.bold('Token:')}  ${theme.accent(token)}`,
      '',
      theme.bold('Sign in:'),
      `  ${theme.accent(`${gatewayUrl}/auth/login`)}`,
      `  ${theme.dim('Paste the token above into the form.')}`,
      '',
      theme.dim('  Re-run `flowpunk connect` to mint a fresh token if this one expires'),
      theme.dim('  before you use it (or after consumption).'),
      theme.brand(banner),
      '',
    ].join('\n'),
  );

  // Suppress unused-import warning for the shared p namespace (we may use it
  // for richer prompts in a future revision but the v1 path is non-interactive).
  void p;
}

function base64UrlPayload(): string {
  const bytes = randomBytes(32);
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/[=+/]/g, '').slice(0, 32);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

async function findOwnerUserId(
  client: Parameters<typeof queryD1>[0],
  databaseId: string,
): Promise<string | null> {
  const rows = await queryD1(client, {
    databaseId,
    sql: `SELECT id FROM users WHERE role = 'owner' AND status = 'active'
          ORDER BY created_at ASC LIMIT 1;`,
    params: [],
  });
  for (const r of rows) {
    if (Array.isArray(r.results)) {
      for (const row of r.results) {
        if (row && typeof row === 'object' && 'id' in row) {
          const id = (row as { id: unknown }).id;
          if (typeof id === 'string') return id;
        }
      }
    }
  }
  return null;
}
