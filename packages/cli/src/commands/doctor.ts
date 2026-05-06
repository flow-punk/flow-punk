import * as p from '@clack/prompts';
import {
  findD1ByName,
  getWorkersDevSubdomainEnabled,
  workerScriptExists,
} from '@flowpunk/cf-admin';
import { resolveAndVerify } from './helpers.js';
import { readConfig } from '../auth/token-store.js';
import { theme } from '../ui/theme.js';
import { CliError } from '../util/errors.js';
import type { ServiceName } from '../types.js';

export interface DoctorOpts {
  token?: string;
  account?: string;
  prefix?: string;
}

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export async function doctorCommand(opts: DoctorOpts): Promise<void> {
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
      `No deployment recorded for account ${account.name} (${account.id}).\n${theme.dim('Run `flowpunk init` to provision.')}`,
      'No deployment',
    );
    return;
  }

  for (const dep of matching) {
    p.intro(`${theme.brand('●')} ${dep.accountName} / ${dep.prefix}`);
    const checks: CheckResult[] = [];

    // Token verified during resolveAndVerify.
    checks.push({ label: 'Token verified', ok: true });

    // D1.
    try {
      const d1 = await findD1ByName(client, dep.resources.d1.name);
      checks.push({
        label: `D1 reachable: ${dep.resources.d1.name}`,
        ok: d1 !== null,
        detail: d1 ? d1.uuid.slice(0, 8) + '…' : 'not found',
      });
    } catch (err) {
      checks.push({
        label: `D1 reachable: ${dep.resources.d1.name}`,
        ok: false,
        detail: (err as Error).message,
      });
    }

    // Workers + workers_dev posture.
    for (const svc of ['gateway', 'auth', 'contacts', 'pipeline', 'users'] as ServiceName[]) {
      const name = dep.resources.workers[svc].name;
      try {
        const exists = await workerScriptExists(client, { scriptName: name });
        checks.push({
          label: `Worker deployed: ${name}`,
          ok: exists,
          detail: exists ? undefined : 'not found',
        });
      } catch (err) {
        checks.push({
          label: `Worker deployed: ${name}`,
          ok: false,
          detail: (err as Error).message,
        });
      }
    }

    // Gateway reachable.
    if (dep.resources.workers.gateway.url) {
      const url = dep.resources.workers.gateway.url;
      try {
        const res = await fetch(`${url}/health`);
        checks.push({
          label: `Gateway /health → ${res.status}`,
          ok: res.ok,
        });
      } catch (err) {
        checks.push({
          label: `Gateway /health`,
          ok: false,
          detail: (err as Error).message,
        });
      }

      // Backends NOT publicly reachable (security invariant per ADR-017).
      // Source of truth is the CF API — NOT an HTTP probe, which can falsely
      // pass when a publicly enabled worker just happens to return 404 for `/`.
      for (const svc of ['auth', 'contacts', 'pipeline', 'users'] as ServiceName[]) {
        const backendName = dep.resources.workers[svc].name;
        try {
          const enabled = await getWorkersDevSubdomainEnabled(client, {
            scriptName: backendName,
          });
          checks.push({
            label: `Backend not public: ${backendName}`,
            ok: enabled === false,
            detail: enabled
              ? 'workers.dev subdomain ENABLED — security regression!'
              : 'workers.dev disabled',
          });
        } catch (err) {
          checks.push({
            label: `Backend not public: ${backendName}`,
            ok: false,
            detail: (err as Error).message,
          });
        }
      }

      // Also assert the gateway's subdomain IS enabled (otherwise the public
      // URL we recorded in state isn't actually serving).
      try {
        const enabled = await getWorkersDevSubdomainEnabled(client, {
          scriptName: dep.resources.workers.gateway.name,
        });
        checks.push({
          label: `Gateway publicly reachable`,
          ok: enabled === true,
          detail: enabled ? 'workers.dev enabled' : 'workers.dev DISABLED',
        });
      } catch (err) {
        checks.push({
          label: `Gateway publicly reachable`,
          ok: false,
          detail: (err as Error).message,
        });
      }
    }

    for (const c of checks) {
      const mark = c.ok ? theme.ok('✓') : theme.error('✗');
      const tail = c.detail ? ` ${theme.dim(c.detail)}` : '';
      process.stdout.write(`  ${mark} ${c.label}${tail}\n`);
    }
    if (checks.some((c) => !c.ok)) {
      throw new CliError('One or more health checks failed');
    }
  }
}
