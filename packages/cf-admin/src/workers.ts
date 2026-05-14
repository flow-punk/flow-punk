import { CfAdminError, classifyHttpStatus } from "./errors.js";
import { parseEnvelope, type CfClient } from "./client.js";
import {
  buildScriptPutFormData,
  normalizeBinding,
  type BindingMetadata,
  type ScriptDeployment,
  type ScriptMetadata,
} from "./multipart.js";

export interface GetWorkerScriptInput {
  scriptName: string;
}

export interface PutWorkerScriptInput {
  scriptName: string;
  deployment: ScriptDeployment;
}

/** Backward-compat aliases — managed callers used these names. */
export type GetRouterScriptInput = GetWorkerScriptInput;
export type PutRouterScriptInput = PutWorkerScriptInput;

/**
 * GET the deployed script as a multipart bundle, then parse out the body
 * and metadata. The metadata contains the current bindings list — callers
 * that need to add bindings should `mergeBindings(existing, newOnes)` and
 * round-trip the rest of the metadata fields.
 *
 * Throws a typed `CfAdminError` (`code: 'not_found'`) if the script does not
 * exist on the account — useful for "fresh deploy vs. update" detection.
 */
export async function getWorkerScript(
  client: CfClient,
  input: GetWorkerScriptInput,
): Promise<ScriptDeployment> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}`,
  );
  if (!response.ok) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `getWorkerScript(${input.scriptName}) failed (status ${response.status})`,
      response.status,
    );
  }
  const fd = await response.formData();

  // FormData.get() returns string for text parts, Blob/File for binary
  // parts. The runtime varies:
  //   - Cloudflare Workers: binary parts come back as Blob even for JSON.
  //   - Node 18+ undici: JSON parts come back as string; binary as Blob.
  // We accept both shapes for both parts.
  const metadataEntry = fd.get("metadata") as unknown as Blob | string | null;
  if (metadataEntry === null || metadataEntry === undefined) {
    throw new CfAdminError(
      "invalid_response",
      "Script GET returned no `metadata` part",
    );
  }
  let metadata: ScriptMetadata;
  try {
    const metadataText =
      typeof metadataEntry === "string"
        ? metadataEntry
        : await metadataEntry.text();
    metadata = JSON.parse(metadataText) as ScriptMetadata;
  } catch (err) {
    throw new CfAdminError(
      "invalid_response",
      `Script metadata JSON parse failed: ${(err as Error).message}`,
    );
  }
  if (!metadata.main_module) {
    throw new CfAdminError(
      "invalid_response",
      "Script metadata missing `main_module` — cannot identify body part",
    );
  }
  const bodyEntry = fd.get(metadata.main_module) as unknown as
    | Blob
    | string
    | null;
  if (bodyEntry === null || bodyEntry === undefined) {
    throw new CfAdminError(
      "invalid_response",
      `Script GET returned no part named "${metadata.main_module}" (the main module)`,
    );
  }
  const bodyBuffer =
    typeof bodyEntry === "string"
      ? new TextEncoder().encode(bodyEntry).buffer
      : await bodyEntry.arrayBuffer();

  const normalizedBindings: BindingMetadata[] = Array.isArray(metadata.bindings)
    ? metadata.bindings
        .map((b) => normalizeBinding(b))
        .filter((b): b is BindingMetadata => b !== null)
    : [];

  return {
    metadata: { ...metadata, bindings: normalizedBindings },
    body: new Uint8Array(bodyBuffer),
    mainModuleFilename: metadata.main_module,
  };
}

/**
 * Replace the deployed script. CF's PUT endpoint is full-replacement: the
 * `metadata.bindings` array provided here is the new full set (NOT merged
 * with the deployed value). Callers that want to ADD a binding to an
 * existing script must first `getWorkerScript` and `mergeBindings`.
 */
export async function putWorkerScript(
  client: CfClient,
  input: PutWorkerScriptInput,
): Promise<{ id: string; etag?: string }> {
  if (!input.deployment.metadata.main_module) {
    throw new CfAdminError(
      "invalid_input",
      "deployment.metadata.main_module is required",
    );
  }
  const body = buildScriptPutFormData(input.deployment);
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}`,
    { method: "PUT", body },
  );
  return parseEnvelope<{ id: string; etag?: string }>(response);
}

/** Backward-compat aliases for managed callers. */
export const getRouterScript = getWorkerScript;
export const putRouterScript = putWorkerScript;

/**
 * Lightweight "does this script exist?" check. Hits the `/settings`
 * subresource which returns 200 if the script is deployed, 404 if not.
 * Cheaper and more reliable than `getWorkerScript` (which downloads the
 * entire bundle just to check presence).
 */
export async function workerScriptExists(
  client: CfClient,
  input: { scriptName: string },
): Promise<boolean> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}/settings`,
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `workerScriptExists(${input.scriptName}) failed (status ${response.status})`,
      response.status,
    );
  }
  // Drain the body so the connection can be reused.
  await response.text().catch(() => "");
  return true;
}

/**
 * GET the account's `*.workers.dev` subdomain (e.g. `myorg` →
 * `<script>.myorg.workers.dev`). Returns null if the account has not yet
 * registered a subdomain.
 */
export async function getAccountSubdomain(
  client: CfClient,
): Promise<string | null> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/subdomain`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `getAccountSubdomain failed (status ${response.status})`,
      response.status,
    );
  }
  const result = await parseEnvelope<{ subdomain?: string | null }>(response);
  return result.subdomain ?? null;
}

/**
 * Read whether a script's `*.workers.dev` subdomain is enabled. Used by
 * `flowpunk doctor` as the canonical source of truth for the
 * "backend-not-publicly-reachable" security invariant — DO NOT rely on
 * HTTP probes against the workers.dev URL, since a publicly enabled worker
 * may return 404 for paths that don't match its router.
 */
export async function getWorkersDevSubdomainEnabled(
  client: CfClient,
  input: { scriptName: string },
): Promise<boolean> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}/subdomain`,
  );
  if (!response.ok) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `getWorkersDevSubdomainEnabled(${input.scriptName}) failed (status ${response.status})`,
      response.status,
    );
  }
  const result = await parseEnvelope<{ enabled?: boolean }>(response);
  return result.enabled === true;
}

/**
 * Disable the public `<name>.<account>.workers.dev` route for this script.
 * CF's API for this is a separate `subdomain` endpoint; calling it with
 * `enabled: false` is the equivalent of `workers_dev = false` in
 * wrangler.toml. Idempotent — calling on an already-disabled script is a
 * no-op.
 */
export async function setWorkersDevSubdomain(
  client: CfClient,
  input: { scriptName: string; enabled: boolean },
): Promise<void> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}/subdomain`,
    {
      method: "POST",
      body: JSON.stringify({ enabled: input.enabled }),
    },
  );
  await parseEnvelope<{ enabled: boolean }>(response);
}

/** Delete a deployed Worker script. Used by `flowpunk teardown`. */
export async function deleteWorkerScript(
  client: CfClient,
  input: { scriptName: string },
): Promise<void> {
  const response = await client.request(
    `/accounts/${client.accountId}/workers/scripts/${encodeURIComponent(input.scriptName)}?force=true`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `deleteWorkerScript(${input.scriptName}) failed (status ${response.status})`,
      response.status,
    );
  }
}
