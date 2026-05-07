import type { BindingMetadata, ScriptMetadata } from '@flowpunk/cf-admin';
import type { ResourceInventory, ServiceName } from '../types.js';

/**
 * Source of truth for every per-service runtime setting that lands in the
 * Cloudflare Workers script-PUT envelope.
 *
 * The CLI does NOT parse wrangler.toml at runtime. Instead, this module
 * encodes the binding shapes, vars, compatibility settings, and
 * `workers_dev` posture for each indie service. A CI guard (in scripts/)
 * diffs these constants against the actual indie wrangler.toml files and
 * fails the build on drift.
 *
 * Service binding allowlist (gateway): exactly 4 — AUTH, CONTACTS, PIPELINE,
 * USERS. Indie's gateway wrangler.toml declares 7 service bindings but 3 of
 * them point at managed-only services that don't exist in indie. CF's
 * script-PUT API rejects bindings to non-existent target scripts, so those
 * are explicitly excluded here.
 *
 * Upload order: gateway LAST. Service bindings resolve at upload time, not
 * lazily. See `provision.ts`.
 */

const COMPATIBILITY_DATE = '2025-06-01';
const DO_MIGRATION_TAG = 'mcp-session-do-v1';

interface BuildInput {
  service: ServiceName;
  /** Resolved CF resource IDs from the create steps. */
  inventory: ResourceInventory;
  /** Computed at runtime from the gateway worker URL — gateway only. */
  gatewayUrl?: string;
  /** True if we've never deployed this script before (DO migration block applies). */
  isFreshDeploy: boolean;
  /** The bundle filename inside the multipart envelope. */
  mainModuleFilename: string;
}

/**
 * Returns the canonical script name for a service, given the user's prefix.
 * Defaults to `flowpunk-` for safety against name collisions on the user's
 * Cloudflare account.
 */
export function scriptName(prefix: string, service: ServiceName): string {
  return `${prefix}-${service}`;
}

/** Returns true if `workers_dev` should be enabled for this service. */
export function isPubliclyExposed(service: ServiceName): boolean {
  return service === 'gateway';
}

/**
 * Build the full ScriptMetadata for a service. This is what gets sent in
 * the multipart envelope's `metadata` part.
 *
 * NOTE: `workers_dev` is NOT part of `ScriptMetadata` per CF's API — it's
 * controlled via a separate `/subdomain` endpoint. See `provision.ts` for
 * the call to `setWorkersDevSubdomain`.
 */
export function buildScriptMetadata(input: BuildInput): ScriptMetadata {
  const { service, inventory, gatewayUrl, isFreshDeploy, mainModuleFilename } = input;
  const bindings: BindingMetadata[] = [];

  // D1 binding — every service binds the same `flowpunk-indie` D1 as `DB`.
  bindings.push({
    name: 'DB',
    type: 'd1',
    database_id: inventory.d1.id,
  });

  // Per-service KV bindings.
  switch (service) {
    case 'gateway':
      bindings.push({
        name: 'MCP_TOOLS_KV',
        type: 'kv_namespace',
        namespace_id: inventory.kv.MCP_TOOLS_KV,
      });
      bindings.push({
        name: 'MCP_SESSIONS_KV',
        type: 'kv_namespace',
        namespace_id: inventory.kv.MCP_SESSIONS_KV,
      });
      // OAuth identity + revocation cache (per ADR-019). Carries cached
      // identity entries (60s TTL), `oauth:revoked:<hash>` tombstones,
      // and `user_invalidated:_system:<userId>` tombstones written by
      // the users service on soft-delete.
      bindings.push({
        name: 'OAUTH_TOKEN_CACHE',
        type: 'kv_namespace',
        namespace_id: inventory.kv.OAUTH_TOKEN_CACHE,
      });
      break;
    case 'auth':
      bindings.push({
        name: 'LAST_USED_KV',
        type: 'kv_namespace',
        namespace_id: inventory.kv.LAST_USED_KV,
      });
      break;
    case 'contacts':
    case 'pipeline':
    case 'users':
      // Indie consolidates a single `IDEMPOTENCY_KV` namespace across all
      // three mutating services (was 3 separate KVs pre-2026-05). Per-service
      // listability is preserved by `IDEMPOTENCY_KEY_PREFIX` (mirrors each
      // service's wrangler.toml `[vars]` block; read by the `-core` router
      // and forwarded into `withIdempotency` as `keyPrefix`).
      bindings.push({
        name: 'IDEMPOTENCY_KV',
        type: 'kv_namespace',
        namespace_id: inventory.kv.IDEMPOTENCY_KV,
      });
      bindings.push({
        name: 'IDEMPOTENCY_KEY_PREFIX',
        type: 'plain_text',
        text: `${service}:`,
      });
      if (service === 'users') {
        // OAuth user-invalidation tombstone target (per ADR-019 §B5). The
        // users wrapper writes `user_invalidated:_system:<userId>` on
        // successful soft-delete so the gateway's identity-cache hit path
        // stops returning the deleted user's identity within 60s. Same KV
        // namespace the gateway binds.
        bindings.push({
          name: 'OAUTH_TOKEN_CACHE',
          type: 'kv_namespace',
          namespace_id: inventory.kv.OAUTH_TOKEN_CACHE,
        });
      }
      break;
  }

  // Gateway: service bindings + DO + vars.
  if (service === 'gateway') {
    // Service binding allowlist — EXACTLY 4 (per plan). Adding more here
    // would target nonexistent worker scripts and the upload would fail.
    bindings.push({
      name: 'AUTH_SERVICE',
      type: 'service',
      service: inventory.workers.auth.name,
    });
    bindings.push({
      name: 'CONTACTS_SERVICE',
      type: 'service',
      service: inventory.workers.contacts.name,
    });
    bindings.push({
      name: 'PIPELINE_SERVICE',
      type: 'service',
      service: inventory.workers.pipeline.name,
    });
    bindings.push({
      name: 'USERS_SERVICE',
      type: 'service',
      service: inventory.workers.users.name,
    });

    // Durable Object binding.
    bindings.push({
      name: 'MCP_SESSION_DO',
      type: 'durable_object_namespace',
      class_name: 'McpSessionDurableObject',
    });

    // Plain-text vars (mirrors gateway wrangler.toml [vars] section).
    bindings.push({
      name: 'MAX_REQUEST_BODY_BYTES',
      type: 'plain_text',
      text: '10485760',
    });
    bindings.push({
      name: 'SERVICE_TIMEOUT_MS',
      type: 'plain_text',
      text: '10000',
    });
    bindings.push({
      name: 'ALLOWED_ORIGINS',
      type: 'plain_text',
      // Default to the gateway's own origin. Local-dev origins from the
      // wrangler.toml example are not appropriate on a deployed worker —
      // operators add custom origins via post-init configuration.
      text: gatewayUrl ?? '',
    });
    // OAuth issuer URL (per ADR-019). RFC 9728/8414 metadata, token
    // audience, and approve-origin policy all derive from this. We seed
    // it to the gateway's own URL; operators that bind a custom domain
    // post-init must update this var (and re-deploy) so the OAuth flow
    // advertises the right origin.
    bindings.push({
      name: 'GATEWAY_PUBLIC_ORIGIN',
      type: 'plain_text',
      text: gatewayUrl ?? '',
    });
    // RFC 8707 resource allowlist for OAuth tokens. Empty → defaults to
    // the issuer origin (which is what indie wants). Operators that
    // protect non-root sub-paths can override post-init.
    bindings.push({
      name: 'OAUTH_RESOURCE_ALLOWLIST',
      type: 'plain_text',
      text: '',
    });
    bindings.push({
      name: 'MCP_TOOLS_DYNAMIC_SERVICES',
      type: 'plain_text',
      text: '',
    });
    bindings.push({
      name: 'EDITION',
      type: 'plain_text',
      text: 'indie',
    });
  }

  // Users service: EDITION=indie var.
  if (service === 'users') {
    bindings.push({
      name: 'EDITION',
      type: 'plain_text',
      text: 'indie',
    });
  }

  const metadata: ScriptMetadata = {
    main_module: mainModuleFilename,
    bindings,
    compatibility_date: COMPATIBILITY_DATE,
  };

  // DO migration step — gateway only, fresh deploy only.
  // CF's script-PUT API takes a SINGLE migration step (the one being
  // applied now), NOT an array of historical steps. On subsequent uploads
  // the field MUST be omitted; CF rejects a re-applied tag with an
  // already-applied error.
  if (service === 'gateway' && isFreshDeploy) {
    metadata.migrations = {
      new_tag: DO_MIGRATION_TAG,
      new_sqlite_classes: ['McpSessionDurableObject'],
    };
  }

  return metadata;
}

/** Snapshot helper for tests. */
export function _doMigrationTag(): string {
  return DO_MIGRATION_TAG;
}
