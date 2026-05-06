import {
  getAccountSubdomain,
  migrateD1,
  putWorkerScript,
  setWorkersDevSubdomain,
  workerScriptExists,
  type CfClient,
} from '@flowpunk/cf-admin';

import { SERVICE_UPLOAD_ORDER, type DeploymentRecord, type ServiceName } from '../types.js';
import {
  buildScriptMetadata,
  isPubliclyExposed,
} from './script-metadata.js';
import { hashBundle, loadMigrations, loadWorkerBundle } from './bundles.js';
import { runChecklist, type ChecklistItem } from '../ui/checklist.js';
import { withRetry } from '../util/retry.js';
import { CliError } from '../util/errors.js';

export interface UpdateOptions {
  /** Apply migrations only; skip worker redeploys. */
  schemaOnly?: boolean;
  /** Redeploy workers only; skip migrations. */
  codeOnly?: boolean;
  /** Restrict to a single service (and its dependents-on-the-gateway). */
  onlyService?: ServiceName;
}

export interface UpdateOutcome {
  record: DeploymentRecord;
  migrationsApplied: string[];
  workersRedeployed: ServiceName[];
  workersUnchanged: ServiceName[];
}

/**
 * Apply pending migrations + redeploy any worker whose bundle hash differs
 * from the last-deployed value in state. Idempotent: a no-op when nothing
 * has changed.
 */
export async function updateDeployment(
  client: CfClient,
  record: DeploymentRecord,
  cliVersion: string,
  options: UpdateOptions = {},
): Promise<UpdateOutcome> {
  if (options.schemaOnly && options.codeOnly) {
    throw new CliError('--schema-only and --code-only are mutually exclusive');
  }

  const items: ChecklistItem[] = [];
  let accountSubdomain: string | null = null;
  let migrationsApplied: string[] = [];
  const workersRedeployed: ServiceName[] = [];
  const workersUnchanged: ServiceName[] = [];
  const newBundleHashes: Partial<Record<ServiceName, string>> = {
    ...record.lastDeployedBundleHashes,
  };

  // 0. Resolve subdomain (needed for ALLOWED_ORIGINS on any gateway redeploy).
  if (!options.schemaOnly) {
    items.push({
      key: 'account.subdomain',
      label: 'Resolve account workers.dev subdomain',
      run: async () => {
        accountSubdomain = await withRetry(() => getAccountSubdomain(client));
        if (!accountSubdomain) {
          throw new Error(
            'No workers.dev subdomain registered. Visit dash.cloudflare.com and pick one.',
          );
        }
        return accountSubdomain;
      },
    });
  }

  // 1. Migrations.
  if (!options.codeOnly) {
    items.push({
      key: 'd1.migrate',
      label: 'Apply pending D1 migrations',
      run: async () => {
        const migrations = await loadMigrations();
        const result = await migrateD1(client, {
          databaseId: record.resources.d1.id,
          migrations,
        });
        if (result.failed) {
          throw new Error(
            `Migration ${result.failed.name} failed: ${result.failed.error}`,
          );
        }
        migrationsApplied = [...result.applied];
        return result.applied.length === 0
          ? `nothing pending (${result.alreadyApplied.length} already applied)`
          : `${result.applied.length} applied`;
      },
    });
  }

  // 2. Workers — diff hashes, redeploy only changed ones.
  if (!options.schemaOnly) {
    const ordered = SERVICE_UPLOAD_ORDER.filter(
      (s) => !options.onlyService || s === options.onlyService,
    );

    // Pre-compute hashes so the user-visible checklist accurately predicts
    // which workers will redeploy. We do this in a separate "diff" step
    // because the per-service step needs the result.
    const localHashes: Partial<Record<ServiceName, string>> = {};
    items.push({
      key: 'worker.diff',
      label: 'Diff worker bundles',
      run: async () => {
        for (const svc of ordered) {
          const body = await loadWorkerBundle(svc);
          localHashes[svc] = hashBundle(body);
        }
        const changed = ordered.filter(
          (svc) => localHashes[svc] !== record.lastDeployedBundleHashes?.[svc],
        );
        return changed.length === 0
          ? 'no changes'
          : `${changed.length} changed: ${changed.join(', ')}`;
      },
    });

    for (const service of ordered) {
      const name = record.resources.workers[service].name;
      items.push({
        key: `worker.${service}`,
        label: `Worker: ${name}`,
        run: async () => {
          const local = localHashes[service];
          if (!local) throw new Error('hash not computed');
          const last = record.lastDeployedBundleHashes?.[service];

          // ALWAYS reassert workers_dev posture, even when the bundle is
          // unchanged. Per ADR-017, `workers_dev: false` on backends is a
          // security invariant: a manual dashboard flip (or any out-of-band
          // change) that re-enables the public route silently introduces a
          // header-spoofing vector. The cost is one cheap API call per
          // service per update.
          await withRetry(() =>
            setWorkersDevSubdomain(client, {
              scriptName: name,
              enabled: isPubliclyExposed(service),
            }),
          );

          if (local === last) {
            workersUnchanged.push(service);
            return 'unchanged';
          }
          if (!accountSubdomain) {
            throw new Error('account subdomain not resolved');
          }
          const isFreshDeploy = await isWorkerAbsent(client, name);
          const body = await loadWorkerBundle(service);
          const gatewayUrl = `https://${record.resources.workers.gateway.name}.${accountSubdomain}.workers.dev`;
          const metadata = buildScriptMetadata({
            service,
            inventory: record.resources,
            gatewayUrl,
            isFreshDeploy,
            mainModuleFilename: 'index.js',
          });
          await withRetry(() =>
            putWorkerScript(client, {
              scriptName: name,
              deployment: { metadata, body, mainModuleFilename: 'index.js' },
            }),
          );
          newBundleHashes[service] = local;
          workersRedeployed.push(service);
          return 'redeployed';
        },
      });
    }
  }

  await runChecklist(items);

  const updatedRecord: DeploymentRecord = {
    ...record,
    lastDeployedBundleHashes: newBundleHashes,
    cliVersionAtLastUpdate: cliVersion,
    updatedAt: new Date().toISOString(),
  };

  return {
    record: updatedRecord,
    migrationsApplied,
    workersRedeployed,
    workersUnchanged,
  };
}

async function isWorkerAbsent(client: CfClient, name: string): Promise<boolean> {
  const exists = await workerScriptExists(client, { scriptName: name });
  return !exists;
}
