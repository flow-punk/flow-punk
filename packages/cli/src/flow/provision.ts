import {
  createD1,
  createKvNamespace,
  deleteKvNamespace,
  deleteWorkerScript,
  findD1ByName,
  findKvByTitle,
  getAccountSubdomain,
  migrateD1,
  putWorkerScript,
  setWorkersDevSubdomain,
  workerScriptExists,
  type CfClient,
} from '@flowpunk/cf-admin';

import {
  KV_BINDING_KEYS,
  SERVICE_UPLOAD_ORDER,
  type DeploymentRecord,
  type InitAnswers,
  type KvBindingKey,
  type ResourceInventory,
  type ServiceName,
} from '../types.js';
import {
  buildScriptMetadata,
  isPubliclyExposed,
  scriptName,
} from './script-metadata.js';
import { hashBundle, loadMigrations, loadWorkerBundle } from './bundles.js';
import { runChecklist, type ChecklistItem } from '../ui/checklist.js';
import { withRetry } from '../util/retry.js';
import { seedAdmin } from './seed-admin.js';
import { mintApiKey } from './mint-api-key.js';
import { smokeGateway } from './smoke.js';

const DO_MIGRATION_TAG = 'mcp-session-do-v1';

export interface ProvisionResult {
  record: DeploymentRecord;
  cookieValue: string;
  apiKey: string;
}

/**
 * The central provision orchestrator. Idempotent at the per-resource level
 * (find-then-create).
 *
 * Upload order is encoded in `SERVICE_UPLOAD_ORDER`: the four backend
 * services are uploaded BEFORE the gateway, which references them via
 * service bindings. CF rejects bindings to non-existent target scripts.
 *
 * The `persist` callback is invoked after each material inventory mutation
 * so that a failure mid-flight leaves a recoverable state file pointing at
 * every CF resource we created. Re-running `init` then resumes via
 * find-then-create on each step.
 */
export async function provisionFresh(
  client: CfClient,
  answers: InitAnswers,
  cliVersion: string,
  persist?: (record: DeploymentRecord) => Promise<void>,
): Promise<ProvisionResult> {
  const { prefix } = answers;
  const inventory: ResourceInventory = {
    d1: { id: '', name: `${prefix}-indie` },
    kv: {
      MCP_TOOLS_KV: '',
      MCP_SESSIONS_KV: '',
      LAST_USED_KV: '',
      IDEMPOTENCY_KV: '',
      OAUTH_TOKEN_CACHE: '',
    },
    workers: {
      gateway: { name: scriptName(prefix, 'gateway') },
      auth: { name: scriptName(prefix, 'auth') },
      contacts: { name: scriptName(prefix, 'contacts') },
      pipeline: { name: scriptName(prefix, 'pipeline') },
      users: { name: scriptName(prefix, 'users') },
    },
    doMigrationTag: DO_MIGRATION_TAG,
  };

  const bundleHashes: Partial<Record<ServiceName, string>> = {};
  let cookieValue = '';
  let apiKey = '';
  let accountSubdomain: string | null = null;

  const snapshotRecord = (): DeploymentRecord => {
    const now = new Date().toISOString();
    return {
      accountId: answers.accountId,
      accountName: answers.accountName,
      prefix,
      tokenSource: 'wrangler-oauth',
      resources: inventory,
      lastDeployedBundleHashes: { ...bundleHashes },
      cliVersionAtLastUpdate: cliVersion,
      createdAt: now,
      updatedAt: now,
    };
  };
  const flush = async (): Promise<void> => {
    if (persist) await persist(snapshotRecord());
  };

  // Build the checklist. Each item is idempotent; failures throw.
  // After every item that mutates `inventory` or `bundleHashes`, we call
  // `flush()` so the on-disk state matches live CF state at all times.
  const items: ChecklistItem[] = [];

  // 0. Discover the account's `*.workers.dev` subdomain so we can compute
  // ALLOWED_ORIGINS for the gateway. This is a property of the CF account,
  // not of any single worker, and must be resolved before the gateway
  // upload.
  items.push({
    key: 'account.subdomain',
    label: 'Resolve account workers.dev subdomain',
    run: async () => {
      accountSubdomain = await withRetry(() => getAccountSubdomain(client));
      if (!accountSubdomain) {
        throw new Error(
          'No workers.dev subdomain registered on this account. Visit dash.cloudflare.com → Workers & Pages and pick a subdomain, then re-run.',
        );
      }
      return accountSubdomain;
    },
  });

  // 1. D1.
  items.push({
    key: 'd1.create',
    label: `Create D1: ${inventory.d1.name}`,
    run: async () => {
      const existing = await withRetry(() => findD1ByName(client, inventory.d1.name));
      if (existing) {
        inventory.d1.id = existing.uuid;
        await flush();
        return `exists (${existing.uuid.slice(0, 8)}…)`;
      }
      const created = await withRetry(() =>
        createD1(client, { name: inventory.d1.name }),
      );
      inventory.d1.id = created.uuid;
      await flush();
      return created.uuid.slice(0, 8) + '…';
    },
  });

  // 2. Migrations.
  items.push({
    key: 'd1.migrate',
    label: 'Apply D1 migrations',
    run: async () => {
      const migrations = await loadMigrations();
      const result = await migrateD1(client, {
        databaseId: inventory.d1.id,
        migrations,
      });
      if (result.failed) {
        throw new Error(
          `Migration ${result.failed.name} failed: ${result.failed.error}`,
        );
      }
      const total = migrations.length;
      const newOnes = result.applied.length;
      return newOnes === 0
        ? `${total} already applied`
        : `${newOnes} applied (${total} total)`;
    },
  });

  // 3. KV namespaces — one per binding key.
  for (const key of KV_BINDING_KEYS) {
    const title = kvTitle(prefix, key);
    items.push({
      key: `kv.${key}`,
      label: `Create KV: ${key}`,
      run: async () => {
        const existing = await withRetry(() => findKvByTitle(client, title));
        if (existing) {
          inventory.kv[key] = existing.id;
          await flush();
          return `exists`;
        }
        const created = await withRetry(() =>
          createKvNamespace(client, { title }),
        );
        inventory.kv[key] = created.id;
        await flush();
        return undefined;
      },
    });
  }

  // 4. Worker uploads — ordered (gateway last).
  for (const service of SERVICE_UPLOAD_ORDER) {
    const name = inventory.workers[service].name;
    items.push({
      key: `worker.${service}`,
      label: `Upload worker: ${name}`,
      run: async () => {
        if (!accountSubdomain) {
          throw new Error('account subdomain not resolved');
        }
        const isFreshDeploy = await isWorkerAbsent(client, name);
        const body = await loadWorkerBundle(service);
        bundleHashes[service] = hashBundle(body);
        const gatewayUrl = `https://${inventory.workers.gateway.name}.${accountSubdomain}.workers.dev`;
        const metadata = buildScriptMetadata({
          service,
          inventory,
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
        // Set workers_dev posture: gateway = on (public), backends = off.
        // This is a SECURITY INVARIANT — backends trust gateway-set
        // identity headers, so leaving them publicly addressable would
        // allow header spoofing.
        await withRetry(() =>
          setWorkersDevSubdomain(client, {
            scriptName: name,
            enabled: isPubliclyExposed(service),
          }),
        );
        if (service === 'gateway') {
          inventory.workers.gateway.url = gatewayUrl;
        }
        await flush();
        return isFreshDeploy ? 'created' : 'updated';
      },
    });
  }

  // 5. Seed admin user + session.
  items.push({
    key: 'admin.seed',
    label: 'Seed admin user + session',
    run: async () => {
      const seeded = await seedAdmin(client, {
        databaseId: inventory.d1.id,
        email: answers.adminEmail,
        displayName: answers.adminDisplayName,
      });
      cookieValue = seeded.cookieValue;
      return seeded.userId;
    },
  });

  // 5.5. Wait for the gateway's workers.dev subdomain to start serving.
  // After `setWorkersDevSubdomain(enabled=true)` returns, CF takes up to a
  // few seconds to actually route `<name>.<account>.workers.dev` to the
  // worker. Hitting it during that window returns Cloudflare's HTML 404
  // (not the worker's JSON 404), which would fail the next step.
  items.push({
    key: 'gateway.ready',
    label: 'Wait for gateway to be reachable',
    run: async () => {
      const url = inventory.workers.gateway.url;
      if (!url) throw new Error('Gateway URL not set');
      await smokeGateway(url);
      return undefined;
    },
  });

  // 6. Mint first API key.
  items.push({
    key: 'admin.api-key',
    label: 'Mint first API key',
    run: async () => {
      const url = inventory.workers.gateway.url;
      if (!url) throw new Error('Gateway URL not set');
      const minted = await mintApiKey({
        gatewayUrl: url,
        cookieValue,
        label: 'flowpunk init',
      });
      apiKey = minted.apiKey;
      return undefined;
    },
  });

  // 7. Smoke test.
  items.push({
    key: 'smoke',
    label: 'Smoke test GET /health',
    run: async () => {
      const url = inventory.workers.gateway.url;
      if (!url) throw new Error('Gateway URL not set');
      await smokeGateway(url);
      return undefined;
    },
  });

  await runChecklist(items);
  await flush();

  return { record: snapshotRecord(), cookieValue, apiKey };
}

/**
 * Tear down all resources for a deployment. Best-effort; logs but does not
 * throw on individual deletes so a partial state can still be cleaned up.
 *
 * Order is reverse of provision: workers first (so service bindings can't
 * race a half-deleted dependency), then KV, then D1.
 */
export async function teardownDeployment(
  client: CfClient,
  record: DeploymentRecord,
): Promise<void> {
  const items: ChecklistItem[] = [];

  // Workers first — reverse upload order (gateway first since it's the only
  // public surface; then backends).
  const reversed = [...SERVICE_UPLOAD_ORDER].reverse();
  for (const svc of reversed) {
    const name = record.resources.workers[svc].name;
    items.push({
      key: `delete.worker.${svc}`,
      label: `Delete worker: ${name}`,
      run: async () => {
        await deleteWorkerScript(client, { scriptName: name });
        return undefined;
      },
    });
  }

  // KV namespaces.
  for (const key of KV_BINDING_KEYS) {
    const id = record.resources.kv[key];
    if (!id) continue;
    items.push({
      key: `delete.kv.${key}`,
      label: `Delete KV: ${key}`,
      run: async () => {
        await deleteKvNamespace(client, { id });
        return undefined;
      },
    });
  }

  // D1 deletion happens (or doesn't) outside this checklist — see
  // `teardownCommand`, which prompts the user separately because it's
  // irrecoverable.
  await runChecklist(items);
}

async function isWorkerAbsent(client: CfClient, name: string): Promise<boolean> {
  const exists = await workerScriptExists(client, { scriptName: name });
  return !exists;
}

function kvTitle(prefix: string, key: KvBindingKey): string {
  // Stable, deterministic titles so re-running init can find existing namespaces
  // by `findKvByTitle`. Lowercase, hyphen-separated.
  return `${prefix}-${key.toLowerCase().replace(/_/g, '-')}`;
}

