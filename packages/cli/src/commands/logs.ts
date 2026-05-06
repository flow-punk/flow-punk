import { spawn } from 'node:child_process';
import { resolveAndVerify } from './helpers.js';
import { readConfig } from '../auth/token-store.js';
import { theme } from '../ui/theme.js';
import { CliError } from '../util/errors.js';
import type { ServiceName } from '../types.js';

export interface LogsOpts {
  token?: string;
  account?: string;
  prefix?: string;
  service?: string;
}

const SERVICES: ServiceName[] = ['gateway', 'auth', 'contacts', 'pipeline', 'users'];

/**
 * Tail Worker logs by shelling out to `wrangler tail`. We pass the resolved
 * CF API token via env so wrangler doesn't need its own login.
 */
export async function logsCommand(opts: LogsOpts): Promise<void> {
  if (!opts.service) {
    throw new CliError(
      'Specify a service to tail',
      `Usage: flowpunk logs <${SERVICES.join(' | ')}>`,
    );
  }
  if (!SERVICES.includes(opts.service as ServiceName)) {
    throw new CliError(
      `Unknown service "${opts.service}"`,
      `Valid: ${SERVICES.join(', ')}`,
    );
  }
  const service = opts.service as ServiceName;

  const { client, token, account } = await resolveAndVerify({
    explicitToken: opts.token,
    accountIdHint: opts.account,
  });
  void client;

  const config = await readConfig();
  const matching = Object.values(config.deployments).filter(
    (d) =>
      d.accountId === account.id &&
      (!opts.prefix || d.prefix === opts.prefix),
  );
  if (matching.length === 0) {
    throw new CliError(
      `No deployment for account ${account.name}`,
      'Run `flowpunk init` first.',
    );
  }
  if (matching.length > 1 && !opts.prefix) {
    throw new CliError(
      `Multiple deployments: ${matching.map((d) => d.prefix).join(', ')}`,
      'Pass --prefix <name>.',
    );
  }
  const dep = matching[0]!;
  const scriptName = dep.resources.workers[service].name;

  process.stderr.write(
    `${theme.dim(`Tailing ${scriptName} on account ${dep.accountName} — Ctrl+C to stop.`)}\n`,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'tail', scriptName, '--format', 'pretty'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: token,
        CLOUDFLARE_ACCOUNT_ID: account.id,
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new CliError(`wrangler tail exited with code ${code}`));
    });
  });
}
