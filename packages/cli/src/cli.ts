import { Command } from 'commander';
import { formatError } from './util/errors.js';
import { theme } from './ui/theme.js';
import { checkForUpgrade } from './update-check/notifier.js';

// `init` runs ~15 sequential clack spinners, each registering its own
// SIGINT/exit handlers. Node's default 10-listener cap triggers a warning
// midway through. The handlers are real (Ctrl+C cleanup), not a leak —
// just bump the cap.
process.setMaxListeners(40);

const VERSION = '0.0.1-alpha.0';

async function main(): Promise<void> {
  // Kick off the upgrade check in the background. Resolves silently with
  // `{ hint: null }` on any error, so we never block on it.
  const upgradeCheck = checkForUpgrade(VERSION);

  const program = new Command();
  program
    .name('flowpunk')
    .description('Self-host flow-punk indie on your Cloudflare account.')
    .version(VERSION)
    .option('--token <token>', 'Cloudflare API token (alternative to OAuth)')
    .option('--account <id>', 'Cloudflare account ID')
    .option('--prefix <name>', 'Worker name prefix', 'flowpunk')
    .option('--debug', 'Dump CF API requests + responses');

  program
    .command('init')
    .description('Provision a fresh indie deployment.')
    .action(async () => {
      const opts = program.optsWithGlobals<{
        token?: string;
        account?: string;
        prefix?: string;
      }>();
      const { initCommand } = await import('./commands/init.js');
      await initCommand(opts);
    });

  program
    .command('update')
    .description('Apply pending migrations + redeploy changed workers.')
    .option('--schema-only', 'Apply migrations; skip worker redeploys')
    .option('--code-only', 'Redeploy workers; skip migrations')
    .option('--service <name>', 'Restrict to a single service')
    .action(async (cmdOpts: {
      schemaOnly?: boolean;
      codeOnly?: boolean;
      service?: string;
    }) => {
      const opts = {
        ...program.optsWithGlobals<{
          token?: string;
          account?: string;
          prefix?: string;
        }>(),
        ...cmdOpts,
      };
      const { updateCommand } = await import('./commands/update.js');
      await updateCommand(opts);
    });

  program
    .command('login')
    .description('Authenticate with Cloudflare via OAuth.')
    .action(async () => {
      const opts = program.optsWithGlobals<{ token?: string }>();
      const { loginCommand } = await import('./commands/login.js');
      await loginCommand(opts);
    });

  program
    .command('logout')
    .description('Clear stored Cloudflare credentials.')
    .action(async () => {
      const { logoutCommand } = await import('./commands/logout.js');
      await logoutCommand();
    });

  program
    .command('doctor')
    .description('Health-check the current deployment.')
    .action(async () => {
      const opts = program.optsWithGlobals<{
        token?: string;
        account?: string;
        prefix?: string;
      }>();
      const { doctorCommand } = await import('./commands/doctor.js');
      await doctorCommand(opts);
    });

  const adminCmd = program
    .command('admin')
    .description('Admin user management.');
  adminCmd
    .command('reset')
    .description('Mint a new admin user, session, and API key.')
    .option('--email <email>', 'Admin email (skip prompt)')
    .option('--display-name <name>', 'Admin display name (skip prompt)')
    .action(async (cmdOpts: { email?: string; displayName?: string }) => {
      const opts = {
        ...program.optsWithGlobals<{
          token?: string;
          account?: string;
          prefix?: string;
        }>(),
        ...cmdOpts,
      };
      const { adminResetCommand } = await import('./commands/admin-reset.js');
      await adminResetCommand(opts);
    });

  program
    .command('logs <service>')
    .description('Tail Worker logs for a service (gateway/auth/contacts/pipeline/users).')
    .action(async (service: string) => {
      const opts = {
        ...program.optsWithGlobals<{
          token?: string;
          account?: string;
          prefix?: string;
        }>(),
        service,
      };
      const { logsCommand } = await import('./commands/logs.js');
      await logsCommand(opts);
    });

  program
    .command('teardown')
    .description('Delete the deployed Workers + KVs (D1 retained).')
    .action(async () => {
      const opts = program.optsWithGlobals<{
        token?: string;
        account?: string;
        prefix?: string;
      }>();
      const { teardownCommand } = await import('./commands/teardown.js');
      await teardownCommand(opts);
    });

  program
    .command('status', { isDefault: true })
    .description('Summarize the deployment(s) on this machine.')
    .action(async () => {
      const { statusCommand } = await import('./commands/status.js');
      await statusCommand();
    });

  await program.parseAsync(process.argv);

  // Print the upgrade hint once at the very end of a successful run.
  const { hint } = await upgradeCheck;
  if (hint) {
    process.stderr.write(`\n${theme.warn('▲')} ${theme.dim(hint)}\n`);
  }
}

main().catch(async (err) => {
  const formatted = formatError(err);
  process.stderr.write(`${theme.error('error:')} ${formatted.message}\n`);
  if (formatted.hint) {
    process.stderr.write(`${theme.dim('hint:')} ${formatted.hint}\n`);
  }
  process.exit(formatted.code);
});
