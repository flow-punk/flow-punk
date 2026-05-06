import * as p from '@clack/prompts';
import { deleteD1 } from '@flowpunk/cf-admin';
import { resolveAndVerify } from './helpers.js';
import { teardownDeployment } from '../flow/provision.js';
import {
  deleteDeployment,
  deploymentKey,
  readConfig,
} from '../auth/token-store.js';
import { theme } from '../ui/theme.js';
import { CliError } from '../util/errors.js';

export interface TeardownOpts {
  token?: string;
  account?: string;
  prefix?: string;
}

export async function teardownCommand(opts: TeardownOpts): Promise<void> {
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
    p.note(
      `No deployment recorded for account ${account.name}.\n${theme.dim('Nothing to delete.')}`,
      'No deployment',
    );
    return;
  }
  if (matching.length > 1 && !opts.prefix) {
    throw new CliError(
      `Multiple deployments on this account: ${matching.map((d) => d.prefix).join(', ')}`,
      'Pass --prefix <name> to target a specific deployment.',
    );
  }
  const dep = matching[0]!;

  p.note(
    [
      `Account: ${dep.accountName}`,
      `Prefix:  ${dep.prefix}`,
      ``,
      `Will delete:`,
      `  • 5 workers (gateway + 4 backends)`,
      `  • 6 KV namespaces`,
      ``,
      theme.dim('  D1 deletion is asked separately after — opt in.'),
    ].join('\n'),
    'Teardown plan',
  );

  const typed = await p.text({
    message: `Type the prefix "${dep.prefix}" to confirm teardown`,
    validate: (s) =>
      s === dep.prefix ? undefined : 'Must match exactly. Cancel with Ctrl+C.',
  });
  if (p.isCancel(typed)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  await teardownDeployment(client, dep);

  // Now ask about D1 separately. Default no — D1 deletion is irrecoverable.
  const dbName = dep.resources.d1.name;
  const dbId = dep.resources.d1.id;
  const dropDb = await p.confirm({
    message: `Also delete the D1 database ${theme.bold(dbName)}? ${theme.warn('(irrecoverable — wipes all data)')}`,
    initialValue: false,
  });

  let dbDeleted = false;
  if (!p.isCancel(dropDb) && dropDb) {
    const typedName = await p.text({
      message: `Type the D1 name ${theme.bold(`"${dbName}"`)} to confirm deletion`,
      validate: (s) =>
        s === dbName ? undefined : 'Must match exactly. Cancel with Ctrl+C.',
    });
    if (!p.isCancel(typedName)) {
      const spinner = p.spinner();
      spinner.start(`Delete D1: ${dbName}`);
      try {
        await deleteD1(client, { databaseId: dbId });
        dbDeleted = true;
        spinner.stop(`${theme.ok('✓')} Deleted D1: ${dbName}`);
      } catch (err) {
        spinner.stop(`${theme.error('✗')} D1 delete failed: ${(err as Error).message}`);
      }
    }
  }

  await deleteDeployment(deploymentKey(dep.accountId, dep.prefix));

  const dbLine = dbDeleted
    ? `${theme.dim(`D1 deleted: ${dbName}`)}`
    : `${theme.dim(`D1 retained: ${dbName} (${dbId}). Delete from the CF dashboard if you change your mind.`)}`;
  p.outro(`${theme.ok('✓')} Teardown complete.\n${dbLine}`);
}
