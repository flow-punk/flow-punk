import * as p from '@clack/prompts';
import { renderLogo } from '../ui/logo.js';
import { theme } from '../ui/theme.js';
import { resolveAndVerify } from './helpers.js';
import { provisionFresh } from '../flow/provision.js';
import { deploymentKey, readDeployment, writeDeployment } from '../auth/token-store.js';
import type { InitAnswers } from '../types.js';
import { CliError } from '../util/errors.js';

export interface InitOpts {
  token?: string;
  prefix?: string;
  account?: string;
}

const CLI_VERSION = '0.0.1-alpha.0';

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
      message: 'Which Cloudflare account should we deploy to?',
      options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` })),
    });
    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    account = accounts.find((a) => a.id === choice)!;
    // Rebuild client with the chosen account ID.
    const { createCfClient } = await import('@flowpunk/cf-admin');
    client = createCfClient({ apiToken: token, accountId: account.id });
  }

  const prefix =
    opts.prefix ??
    (await (async () => {
      const v = await p.text({
        message: 'Worker name prefix?',
        placeholder: 'flowpunk',
        defaultValue: 'flowpunk',
        validate: (s) =>
          /^[a-z][a-z0-9-]{0,30}$/.test(s)
            ? undefined
            : 'Lowercase letters, digits, hyphens. Start with a letter. Max 31 chars.',
      });
      if (p.isCancel(v)) {
        p.cancel('Cancelled.');
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
        { value: 'resume', label: 'Resume (re-run init; existing resources will be reused)' },
        { value: 'cancel', label: 'Cancel and use `flowpunk update` / `flowpunk doctor` instead' },
        { value: 'prefix', label: 'Use a different prefix' },
      ],
    });
    if (p.isCancel(choice) || choice === 'cancel') {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    if (choice === 'prefix') {
      throw new CliError(
        'Pick a different prefix and re-run with --prefix <name>',
      );
    }
    // resume — fall through.
  }

  const adminEmail = await p.text({
    message: 'Admin email?',
    validate: (s) =>
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? undefined : 'Enter a valid email.',
  });
  if (p.isCancel(adminEmail)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  const adminDisplayName = await p.text({
    message: 'Admin display name?',
    placeholder: 'Operator',
    defaultValue: 'Operator',
  });
  if (p.isCancel(adminDisplayName)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const answers: InitAnswers = {
    accountId: account.id,
    accountName: account.name,
    prefix,
    adminEmail: adminEmail as string,
    adminDisplayName: adminDisplayName as string,
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
    ].join('\n'),
    'Plan summary',
  );
  const confirm = await p.confirm({ message: 'Proceed?' });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  // Persist after every inventory-mutating step so a partial failure leaves a
  // recoverable state file. Re-running `init` then resumes via find-then-create.
  const result = await provisionFresh(client, answers, CLI_VERSION, async (rec) => {
    await writeDeployment(key, rec);
  });
  await writeDeployment(key, result.record);

  // Suppress unused-import warning for `tokenSource` (logged in deployment record).
  void tokenSource;

  printSuccessCard(result);
}

function printSuccessCard(result: {
  record: { resources: { workers: { gateway: { url?: string } } } };
  apiKey: string;
}): void {
  const url = result.record.resources.workers.gateway.url ?? '<gateway-url>';
  const banner = '═'.repeat(72);
  const lines = [
    '',
    theme.brand(banner),
    theme.bold('  flow-punk indie is live — API key below is shown ONCE'),
    theme.brand(banner),
    '',
    `${theme.bold('Gateway URL:')}  ${theme.accent(url)}`,
    `${theme.bold('API key:')}      ${theme.accent(result.apiKey)}`,
    '',
    theme.bold('First-time browser login:'),
    `  ${theme.accent('flowpunk connect')}`,
    `  ${theme.dim('then visit')} ${theme.accent(`${url}/auth/login`)}`,
    `  ${theme.dim('and paste the printed login token (5-minute one-shot).')}`,
    '',
    theme.bold('Try the API:'),
    `  ${theme.accent(`curl -H "Authorization: Bearer ${result.apiKey}" \\`)}`,
    `  ${theme.accent(`     ${url}/api/v1/contacts`)}`,
    '',
    theme.bold('Connect MCP (Claude Desktop, etc.):'),
    theme.dim(JSON.stringify(
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
    )),
    '',
    theme.dim(`Day-2 upgrades: \`flowpunk update\`. Health check: \`flowpunk doctor\`.`),
    theme.brand(banner),
    '',
  ];
  process.stdout.write(lines.join('\n'));
}
