#!/usr/bin/env tsx
/**
 * Bootstrap an admin user + session for manual smoke-testing of the indie
 * accounts surface.
 *
 * Mirrors managed/services/tenants/scripts/bootstrap-admin.ts; deltas:
 *  - Wrangler runs with cwd = indie/services/gateway so `DB` resolves to the
 *    indie `flowpunk-indie` D1 (ADR-011 §Tenancy: indie is single-D1).
 *  - Binding name is `DB`, not `PARENT_DB`.
 *  - Writes to indie's `users` and `mcp_sessions` tables.
 *  - `tenant_id` is hardcoded to `_system` — indie is single-tenant per
 *    ADR-011, and the gateway propagates `X-Tenant-Id` for audit context
 *    only; entity rows do not carry it.
 *
 * The session cookie is printed ONCE on success. It is hashed (sha256 hex)
 * before persistence, so a fresh run is the only recovery path.
 *
 * Caveat: the `isSessionAllowedPath` flip for `/api/v1/accounts/` is gated
 * on origin + CSRF + scope-on-session work that has NOT shipped in this
 * pass. Until then, sessions cannot reach accounts via the gateway. Use
 * the printed cookie only after the session-flip has landed; in the
 * meantime use API-key auth for accounts smoke-tests.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sha256Hex } from '@flowpunk/gateway/auth';
import { generateId } from '@flowpunk/service-utils';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// indie/services/contacts/scripts → indie/services/gateway is `../../gateway`.
const GATEWAY_DIR = resolve(SCRIPT_DIR, '../../gateway');
// Resolved by Wrangler against process.cwd() (= GATEWAY_DIR), landing at
// <repo-root>/.wrangler-state — same shared persistence root the managed
// bootstrap script uses, so a single state dir backs both editions.
const PERSIST_TO_REL = '../../../.wrangler-state';

function persistFlags(mode: ParsedArgs['mode']): string[] {
  return mode === '--local' ? ['--persist-to', PERSIST_TO_REL] : [];
}

const TENANT_SENTINEL = '_system';
const USER_ID_PATTERN = /^usr_[a-z0-9]{1,40}$/;

interface ParsedArgs {
  mode: '--local' | '--remote';
  expiresDays: number;
  userId: string | null;
}

function printUsage(): void {
  process.stderr.write(
    [
      'Usage: pnpm bootstrap:admin:indie -- [flags]',
      '',
      'Flags:',
      '  --local            Use the local D1 (default)',
      '  --remote           Use the remote D1',
      '  --expires-days <n> Session lifetime in days (default 30)',
      '  --user-id <id>     Reuse an existing admin user; only the session',
      '                     row is inserted. Must match ^usr_[a-z0-9]{1,40}$',
      '                     and reference a row with is_admin = 1.',
      '  --help             Show this message',
      '',
      'Wrangler always runs from indie/services/gateway and, in --local',
      'mode, passes --persist-to <repo-root>/.wrangler-state so state is',
      'shared with both `pnpm dev` sessions and the managed bootstrap.',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  let mode: ParsedArgs['mode'] = '--local';
  let expiresDays = 30;
  let userId: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case '--':
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--local':
        mode = '--local';
        break;
      case '--remote':
        mode = '--remote';
        break;
      case '--expires-days': {
        const next = argv[++i];
        if (next === undefined) fail('--expires-days requires a value');
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          fail(`--expires-days must be a positive integer, got "${next}"`);
        }
        expiresDays = parsed;
        break;
      }
      case '--user-id': {
        const next = argv[++i];
        if (next === undefined) fail('--user-id requires a value');
        if (!USER_ID_PATTERN.test(next!)) {
          fail(
            `--user-id must match ${USER_ID_PATTERN.source}, got "${next}"`,
          );
        }
        userId = next!;
        break;
      }
      default:
        fail(`Unknown flag: ${arg}`);
    }
  }

  return { mode, expiresDays, userId };
}

function fail(msg: string): never {
  process.stderr.write(`bootstrap-admin: ${msg}\n`);
  process.exit(2);
}

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function generateCookieValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = Buffer.from(bytes).toString('base64');
  return b64.replace(/[=+/]/g, '').slice(0, 32);
}

interface WranglerResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runWrangler(args: string[], captureStdout = false): WranglerResult {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', ...args],
    {
      cwd: GATEWAY_DIR,
      stdio: captureStdout
        ? ['ignore', 'pipe', 'pipe']
        : ['ignore', 'inherit', 'inherit'],
      encoding: 'utf8',
    },
  );

  if (result.error) {
    fail(`failed to spawn wrangler: ${result.error.message}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ownerUserExists(mode: ParsedArgs['mode'], userId: string): boolean {
  const sql = `SELECT id FROM users WHERE id = '${escapeSqlLiteral(userId)}' AND role = 'owner' AND status = 'active'`;
  const result = runWrangler(
    [mode, ...persistFlags(mode), '--json', '--command', sql],
    true,
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(`pre-flight SELECT failed (status ${result.status})`);
  }
  return result.stdout.includes(`"${userId}"`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Cookie value follows ADR-013 scoped format `<scope>.<sessionId>`.
  // Indie always uses `_system` as the scope (single tenant by definition).
  // The full string (prefix included) is what gets hashed into mcp_sessions.cookie_hash.
  const sessionPayload = generateCookieValue();
  const cookieValue = `${TENANT_SENTINEL}.${sessionPayload}`;
  const cookieHash = await sha256Hex(cookieValue);

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(
    Date.now() + args.expiresDays * 86_400_000,
  ).toISOString();

  let userId: string;
  let skipUserInsert = false;

  if (args.userId) {
    if (!ownerUserExists(args.mode, args.userId)) {
      fail(
        `--user-id "${args.userId}" does not match an active owner user.`,
      );
    }
    userId = args.userId;
    skipUserInsert = true;
  } else {
    userId = generateId('usr');
  }

  const sessionId = generateId('sess');

  if (!skipUserInsert) {
    // Bootstrap defaults for the operator row. `email` and `display_name`
    // are NOT NULL; bootstrap values can be PATCHed by the operator
    // through `/api/v1/users/<id>` once the gateway is up.
    const email = `admin+${userId}@example.invalid`;
    const displayName = 'Operator';
    const userSql = `INSERT OR IGNORE INTO users (id, email, display_name, role, status, created_at, updated_at) VALUES ('${escapeSqlLiteral(userId)}', '${escapeSqlLiteral(email)}', '${escapeSqlLiteral(displayName)}', 'owner', 'active', '${escapeSqlLiteral(nowIso)}', '${escapeSqlLiteral(nowIso)}');`;
    const userResult = runWrangler([
      args.mode,
      ...persistFlags(args.mode),
      '--command',
      userSql,
    ]);
    if (userResult.status !== 0) {
      fail(`user insert failed (status ${userResult.status})`);
    }
  }

  const sessionSql = `INSERT INTO mcp_sessions (id, cookie_hash, user_id, expires_at, created_at, updated_at) VALUES ('${escapeSqlLiteral(sessionId)}', '${escapeSqlLiteral(cookieHash)}', '${escapeSqlLiteral(userId)}', '${escapeSqlLiteral(expiresIso)}', '${escapeSqlLiteral(nowIso)}', '${escapeSqlLiteral(nowIso)}');`;
  const sessionResult = runWrangler([
    args.mode,
    ...persistFlags(args.mode),
    '--command',
    sessionSql,
  ]);
  if (sessionResult.status !== 0) {
    if (!skipUserInsert) {
      const persistFragment =
        args.mode === '--local' ? ` --persist-to ${PERSIST_TO_REL}` : '';
      const cleanupCmd = `cd indie/services/gateway && npx wrangler d1 execute DB ${args.mode}${persistFragment} --command "DELETE FROM users WHERE id = '${escapeSqlLiteral(userId)}'"`;
      process.stderr.write(
        `\nSession insert failed. To clean up the orphan user row run:\n  ${cleanupCmd}\n`,
      );
    }
    process.exit(sessionResult.status);
  }

  const banner = '='.repeat(72);
  process.stdout.write(
    [
      '',
      banner,
      'BOOTSTRAP COMPLETE — cookie value below is shown ONCE',
      banner,
      `cookie:     ${cookieValue}`,
      `user id:    ${userId}${skipUserInsert ? ' (existing)' : ''}`,
      `session id: ${sessionId}`,
      `expires:    ${expiresIso}`,
      `tenant_id:  ${TENANT_SENTINEL}`,
      `mode:       ${args.mode}`,
      '',
      'NOTE: session-cookie auth on /api/v1/accounts is gated on origin +',
      'CSRF + scope-on-session work that has not shipped yet. Use API-key',
      'auth for the accounts surface until that flip lands.',
      '',
      'Smoke test (after the session flip ships):',
      `  curl -i -H "Cookie: fp_session=${cookieValue}" -H "X-CSRF-Token: <minted-token>" http://localhost:8787/api/v1/accounts`,
      banner,
      '',
    ].join('\n'),
  );
}

void main();
