import * as p from '@clack/prompts';
import { resolveAndVerify } from './helpers.js';
import { readConfig } from '../auth/token-store.js';
import { theme } from '../ui/theme.js';
import { CliError } from '../util/errors.js';
import { seedAdmin } from '../flow/seed-admin.js';
import { mintApiKey } from '../flow/mint-api-key.js';

export interface AdminResetOpts {
  token?: string;
  account?: string;
  prefix?: string;
  email?: string;
  displayName?: string;
}

/**
 * Mint a fresh admin user + session + API key against an existing deployment.
 *
 * Used when:
 *   - the original API key/cookie was lost
 *   - rotating credentials after a leak
 *
 * Inserts a NEW user row (does not modify or revoke the existing one) plus
 * a new mcp_sessions row. Then mints a fresh `fpk_` key against the live
 * gateway. Old keys/sessions remain valid until the operator deletes them.
 */
export async function adminResetCommand(opts: AdminResetOpts): Promise<void> {
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

  const adminEmail =
    opts.email ??
    (await (async () => {
      const v = await p.text({
        message: 'Admin email for the new user row?',
        validate: (s) =>
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? undefined : 'Enter a valid email.',
      });
      if (p.isCancel(v)) {
        p.cancel('Cancelled.');
        process.exit(0);
      }
      return v as string;
    })());

  const adminDisplayName =
    opts.displayName ??
    (await (async () => {
      const v = await p.text({
        message: 'Admin display name?',
        placeholder: 'Operator',
        defaultValue: 'Operator',
      });
      if (p.isCancel(v)) {
        p.cancel('Cancelled.');
        process.exit(0);
      }
      return v as string;
    })());

  p.note(
    [
      `Account:   ${dep.accountName} (${dep.accountId})`,
      `Prefix:    ${dep.prefix}`,
      `Gateway:   ${gatewayUrl}`,
      `New email: ${adminEmail}`,
      ``,
      theme.dim('A new owner row + session will be inserted (existing rows untouched).'),
    ].join('\n'),
    'Mint new admin credentials',
  );
  const ok = await p.confirm({ message: 'Proceed?' });
  if (p.isCancel(ok) || !ok) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const seeded = await seedAdmin(client, {
    databaseId: dep.resources.d1.id,
    email: adminEmail,
    displayName: adminDisplayName,
  });

  const minted = await mintApiKey({
    gatewayUrl,
    cookieValue: seeded.cookieValue,
    label: 'flowpunk admin reset',
  });

  const banner = '═'.repeat(72);
  process.stdout.write(
    [
      '',
      theme.brand(banner),
      theme.bold('  New admin credentials — shown ONCE'),
      theme.brand(banner),
      '',
      `${theme.bold('User ID:')}        ${seeded.userId}`,
      `${theme.bold('API key:')}        ${theme.accent(minted.apiKey)}`,
      `${theme.bold('Session cookie:')} ${theme.accent(seeded.cookieValue)}`,
      '',
      theme.warn('  Old credentials remain valid. Revoke them via the deployed'),
      theme.warn('  gateway if you need to rotate (DELETE /api/v1/auth/api-keys/<id>'),
      theme.warn('  or DELETE /api/v1/users/<old-user-id>).'),
      theme.brand(banner),
      '',
    ].join('\n'),
  );
}
