/**
 * Worker script binding metadata.
 *
 * Per Cloudflare's Workers Scripts API, `metadata.bindings` is a flat array
 * of typed binding objects — REPLACE-not-merge. Every PUT must contain the
 * full binding superset for the script.
 */

export type BindingMetadata =
  | {
      name: string;
      type: "d1";
      /**
       * D1 database UUID. Cloudflare's current Workers Scripts API uses
       * `database_id`; the older `id` field is deprecated but still
       * accepted on read for backwards compatibility — see `normalizeBinding`
       * which coerces inbound payloads to the canonical shape.
       */
      database_id: string;
    }
  | { name: string; type: "kv_namespace"; namespace_id: string }
  | {
      name: string;
      type: "service";
      service: string;
      environment?: string;
    }
  | {
      name: string;
      type: "durable_object_namespace";
      class_name: string;
      script_name?: string;
      environment?: string;
    }
  | { name: string; type: "plain_text"; text: string }
  | { name: string; type: "secret_text"; text: string };

/**
 * Coerce an inbound binding metadata blob (from `getWorkerScript`) to the
 * canonical shape. Tolerates legacy d1 bindings that use `id` instead of
 * `database_id`. Unknown / malformed entries are dropped.
 */
export function normalizeBinding(raw: unknown): BindingMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.type !== "string") return null;
  switch (r.type) {
    case "d1": {
      const databaseId =
        typeof r.database_id === "string"
          ? r.database_id
          : typeof r.id === "string"
            ? r.id
            : null;
      if (!databaseId) return null;
      return { name: r.name, type: "d1", database_id: databaseId };
    }
    case "kv_namespace":
      if (typeof r.namespace_id !== "string") return null;
      return {
        name: r.name,
        type: "kv_namespace",
        namespace_id: r.namespace_id,
      };
    case "service":
      if (typeof r.service !== "string") return null;
      return {
        name: r.name,
        type: "service",
        service: r.service,
        ...(typeof r.environment === "string"
          ? { environment: r.environment }
          : {}),
      };
    case "durable_object_namespace":
      if (typeof r.class_name !== "string") return null;
      return {
        name: r.name,
        type: "durable_object_namespace",
        class_name: r.class_name,
        ...(typeof r.script_name === "string"
          ? { script_name: r.script_name }
          : {}),
        ...(typeof r.environment === "string"
          ? { environment: r.environment }
          : {}),
      };
    case "plain_text":
      if (typeof r.text !== "string") return null;
      return { name: r.name, type: "plain_text", text: r.text };
    case "secret_text":
      if (typeof r.text !== "string") return null;
      return { name: r.name, type: "secret_text", text: r.text };
    default:
      return null;
  }
}

/**
 * Durable Object migration step for the script-PUT envelope.
 *
 * IMPORTANT: CF's script-PUT API takes a SINGLE migration step (the one
 * being applied right now), NOT an array of historical steps. The
 * wrangler.toml `[[migrations]]` syntax is an array of TOML tables, but
 * wrangler only sends the latest entry as `migrations: {...}` to the API.
 *
 * On first deploy emit `{ new_tag, new_sqlite_classes }` (or `new_classes`
 * for non-sqlite). On subsequent deploys with no DO change, OMIT the
 * `migrations` field entirely — sending the same `new_tag` again returns a
 * "already applied" error.
 */
export interface DoMigrationStep {
  new_tag?: string;
  old_tag?: string;
  new_classes?: string[];
  new_sqlite_classes?: string[];
  renamed_classes?: Array<{ from: string; to: string }>;
  deleted_classes?: string[];
  transferred_classes?: Array<{
    from: string;
    from_script: string;
    to: string;
  }>;
}

/**
 * Script metadata as accepted by `PUT /accounts/{id}/workers/scripts/{name}`
 * and returned by the GET counterpart. Unknown fields are preserved on
 * round-trip.
 */
export interface ScriptMetadata {
  main_module: string;
  bindings?: BindingMetadata[];
  compatibility_date?: string;
  compatibility_flags?: string[];
  observability?: { enabled?: boolean; head_sampling_rate?: number };
  placement?: { mode?: string };
  tail_consumers?: Array<{
    service: string;
    environment?: string;
    namespace?: string;
  }>;
  migrations?: DoMigrationStep;
  /** Any other metadata fields are preserved verbatim on round-trip. */
  [extra: string]: unknown;
}

export interface ScriptDeployment {
  metadata: ScriptMetadata;
  /** The script's source bytes. The main_module field names this part on PUT. */
  body: Uint8Array;
  /** The filename used in the multipart part (e.g. "worker.js"). */
  mainModuleFilename: string;
}

/**
 * Replace-not-merge binding update. Any binding whose `name` matches an
 * existing entry is replaced; new bindings are appended.
 */
export function mergeBindings(
  existing: ReadonlyArray<BindingMetadata>,
  updates: ReadonlyArray<BindingMetadata>,
): BindingMetadata[] {
  const byName = new Map<string, BindingMetadata>();
  for (const b of existing) byName.set(b.name, b);
  for (const b of updates) byName.set(b.name, b);
  return Array.from(byName.values());
}

/**
 * Construct the multipart FormData body for `PUT /workers/scripts/{name}`.
 * The CF API expects:
 *   - one part named `metadata` containing JSON metadata (Content-Type: application/json)
 *   - one part named after `metadata.main_module` containing the script body
 *     (Content-Type: application/javascript+module for ES modules)
 *
 * `fetch` will set `Content-Type: multipart/form-data; boundary=...` from
 * the FormData body — DO NOT set it manually on the request.
 */
export function buildScriptPutFormData(deployment: ScriptDeployment): FormData {
  const fd = new FormData();
  fd.append(
    "metadata",
    new Blob([JSON.stringify(deployment.metadata)], {
      type: "application/json",
    }),
    "metadata.json",
  );
  fd.append(
    deployment.mainModuleFilename,
    new Blob([deployment.body as unknown as ArrayBuffer], {
      type: "application/javascript+module",
    }),
    deployment.mainModuleFilename,
  );
  return fd;
}
