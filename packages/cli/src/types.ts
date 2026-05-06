/**
 * Shared types for the flowpunk CLI.
 *
 * The five indie services that get provisioned. Order matters in
 * `provision.ts`: gateway is uploaded LAST because its service bindings
 * reference the four backend scripts by name, and CF rejects bindings to
 * non-existent targets.
 */
export type ServiceName = 'auth' | 'contacts' | 'pipeline' | 'users' | 'gateway';

export const SERVICE_UPLOAD_ORDER: ReadonlyArray<ServiceName> = [
  'auth',
  'contacts',
  'pipeline',
  'users',
  'gateway',
];

/** KV namespace bindings created during init. Keys are stable. */
export type KvBindingKey =
  | 'MCP_TOOLS_KV'
  | 'MCP_SESSIONS_KV'
  | 'LAST_USED_KV'
  | 'IDEMPOTENCY_KV_CONTACTS'
  | 'IDEMPOTENCY_KV_PIPELINE'
  | 'IDEMPOTENCY_KV_USERS';

export const KV_BINDING_KEYS: ReadonlyArray<KvBindingKey> = [
  'MCP_TOOLS_KV',
  'MCP_SESSIONS_KV',
  'LAST_USED_KV',
  'IDEMPOTENCY_KV_CONTACTS',
  'IDEMPOTENCY_KV_PIPELINE',
  'IDEMPOTENCY_KV_USERS',
];

export interface ResourceInventory {
  d1: { id: string; name: string };
  kv: Record<KvBindingKey, string>;
  workers: Record<ServiceName, { name: string; url?: string }>;
  doMigrationTag: string;
}

export interface DeploymentRecord {
  accountId: string;
  accountName: string;
  prefix: string;
  /** 'wrangler-oauth' or 'explicit' (--token). Tokens themselves are NEVER persisted. */
  tokenSource: 'wrangler-oauth' | 'explicit';
  resources: ResourceInventory;
  /** SHA-256 of each deployed worker bundle, used by `update` to skip unchanged services. */
  lastDeployedBundleHashes?: Partial<Record<ServiceName, string>>;
  cliVersionAtLastUpdate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigFile {
  version: 1;
  /** Keyed by `${accountId}:${prefix}`. */
  deployments: Record<string, DeploymentRecord>;
}

export interface InitAnswers {
  accountId: string;
  accountName: string;
  prefix: string;
  adminEmail: string;
  adminDisplayName: string;
}
