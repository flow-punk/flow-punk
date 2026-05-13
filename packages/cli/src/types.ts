/**
 * Shared types for the flowpunk CLI.
 *
 * The five indie services that get provisioned. Order matters in
 * `provision.ts`: gateway is uploaded LAST because its service bindings
 * reference the four backend scripts by name, and CF rejects bindings to
 * non-existent targets.
 */
export type ServiceName =
  | "auth"
  | "contacts"
  | "pipeline"
  | "users"
  | "gateway";

export const SERVICE_UPLOAD_ORDER: ReadonlyArray<ServiceName> = [
  "auth",
  "contacts",
  "pipeline",
  "users",
  "gateway",
];

/** KV namespace bindings created during init. Keys are stable. */
export type KvBindingKey =
  | "MCP_TOOLS_KV"
  | "MCP_SESSIONS_KV"
  | "LAST_USED_KV"
  | "IDEMPOTENCY_KV"
  | "OAUTH_TOKEN_CACHE";

export const KV_BINDING_KEYS: ReadonlyArray<KvBindingKey> = [
  "MCP_TOOLS_KV",
  "MCP_SESSIONS_KV",
  "LAST_USED_KV",
  // Single shared idempotency cache across contacts/pipeline/users (was 3
  // separate KVs pre-2026-05). Per-service listability is preserved by an
  // unhashed `IDEMPOTENCY_KEY_PREFIX` plain_text binding the CLI injects
  // alongside this binding. See ADR-017 amendment.
  "IDEMPOTENCY_KV",
  // OAuth identity + revocation cache (per ADR-019). Bound by both the
  // gateway (read+write on /oauth/*, /mcp, validate-oauth) and the users
  // service (writes user-invalidation tombstones on soft-delete).
  "OAUTH_TOKEN_CACHE",
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
  tokenSource: "wrangler-oauth" | "explicit";
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
