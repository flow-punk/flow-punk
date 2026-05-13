import { CfAdminError, classifyHttpStatus } from "./errors.js";
import { parseEnvelope, type CfClient } from "./client.js";

export interface KvNamespace {
  id: string;
  title: string;
  beta?: boolean;
  supports_url_encoding?: boolean;
}

export async function createKvNamespace(
  client: CfClient,
  input: { title: string },
): Promise<KvNamespace> {
  if (!input.title) {
    throw new CfAdminError("invalid_input", "title is required");
  }
  const response = await client.request(
    `/accounts/${client.accountId}/storage/kv/namespaces`,
    { method: "POST", body: JSON.stringify({ title: input.title }) },
  );
  return parseEnvelope<KvNamespace>(response);
}

/**
 * List all KV namespaces on the account. CF paginates by 100; we fetch all
 * pages so callers can `findKvByTitle` deterministically.
 */
export async function listKvNamespaces(
  client: CfClient,
): Promise<KvNamespace[]> {
  const all: KvNamespace[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: "100",
    });
    const response = await client.request(
      `/accounts/${client.accountId}/storage/kv/namespaces?${params.toString()}`,
    );
    const batch = await parseEnvelope<KvNamespace[]>(response);
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all;
}

export async function findKvByTitle(
  client: CfClient,
  title: string,
): Promise<KvNamespace | null> {
  const all = await listKvNamespaces(client);
  return all.find((kv) => kv.title === title) ?? null;
}

export async function deleteKvNamespace(
  client: CfClient,
  input: { id: string },
): Promise<void> {
  const response = await client.request(
    `/accounts/${client.accountId}/storage/kv/namespaces/${encodeURIComponent(input.id)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `deleteKvNamespace(${input.id}) failed (status ${response.status})`,
      response.status,
    );
  }
}
