import { CfAdminError, classifyHttpStatus } from "./errors.js";
import { parseEnvelope, type CfClient } from "./client.js";

export type D1LocationHint = "wnam" | "enam" | "weur" | "eeur" | "apac" | "oc";

export interface D1Database {
  uuid: string;
  name: string;
  created_at?: string;
  version?: string;
  num_tables?: number;
  file_size?: number;
}

export interface CreateD1Input {
  name: string;
  primaryLocationHint?: D1LocationHint;
}

export interface QueryD1Input {
  databaseId: string;
  sql: string;
  params?: unknown[];
}

export interface QueryD1Result {
  results: unknown[];
  meta?: {
    duration?: number;
    rows_read?: number;
    rows_written?: number;
    [key: string]: unknown;
  };
}

/**
 * Create a new D1 database. `name` MUST be globally unique within the
 * account. Callers wanting at-most-once semantics should call `findD1ByName`
 * first and skip if it returns a match.
 */
export async function createD1(
  client: CfClient,
  input: CreateD1Input,
): Promise<D1Database> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.primaryLocationHint) {
    body.primary_location_hint = input.primaryLocationHint;
  }
  const response = await client.request(
    `/accounts/${client.accountId}/d1/database`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return parseEnvelope<D1Database>(response);
}

/** List D1 databases. CF supports `?name=` for exact-name lookup. */
export async function listD1(
  client: CfClient,
  filter?: { name?: string },
): Promise<D1Database[]> {
  const params = new URLSearchParams();
  if (filter?.name) params.set("name", filter.name);
  const qs = params.toString();
  const response = await client.request(
    `/accounts/${client.accountId}/d1/database${qs ? `?${qs}` : ""}`,
  );
  return parseEnvelope<D1Database[]>(response);
}

/**
 * Idempotent lookup. Returns the D1 record if a database with the given name
 * exists in the account, else `null`.
 */
export async function findD1ByName(
  client: CfClient,
  name: string,
): Promise<D1Database | null> {
  const matches = await listD1(client, { name });
  return matches.find((d) => d.name === name) ?? null;
}

/**
 * Execute SQL against a D1 database. Multi-statement DDL is supported via
 * semicolon-separated statements in a single `sql` string. For parameterized
 * queries the `params` array is bound positionally.
 */
export async function queryD1(
  client: CfClient,
  input: QueryD1Input,
): Promise<QueryD1Result[]> {
  if (!input.databaseId) {
    throw new CfAdminError("invalid_input", "databaseId is required");
  }
  const body: Record<string, unknown> = { sql: input.sql };
  if (input.params && input.params.length > 0) {
    body.params = input.params;
  }
  const response = await client.request(
    `/accounts/${client.accountId}/d1/database/${input.databaseId}/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return parseEnvelope<QueryD1Result[]>(response);
}

export interface ApplyMigrationsInput {
  databaseId: string;
  migrations: ReadonlyArray<{ name: string; sql: string }>;
}

export interface ApplyMigrationsResult {
  applied: string[];
  failed?: { name: string; error: string };
}

/**
 * Execute a list of migration SQL strings, one statement per `queryD1` call.
 * Returns the names that succeeded; on first failure, returns
 * `{ applied, failed: { name, error } }` and stops.
 *
 * NOTE: this is a raw SQL exec helper. It does NOT track applied state in a
 * `d1_migrations` table — see `d1-migrate.ts` for the tracking layer used by
 * the CLI.
 */
/**
 * Delete a D1 database. **DESTRUCTIVE — irrecoverable.** Idempotent: a 404
 * response is treated as success (already deleted). Callers MUST gate this
 * behind explicit user confirmation.
 */
export async function deleteD1(
  client: CfClient,
  input: { databaseId: string },
): Promise<void> {
  const response = await client.request(
    `/accounts/${client.accountId}/d1/database/${input.databaseId}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new CfAdminError(
      classifyHttpStatus(response.status),
      `deleteD1(${input.databaseId}) failed (status ${response.status})`,
      response.status,
    );
  }
}

export async function applyD1Migrations(
  client: CfClient,
  input: ApplyMigrationsInput,
): Promise<ApplyMigrationsResult> {
  const applied: string[] = [];
  for (const migration of input.migrations) {
    try {
      await queryD1(client, {
        databaseId: input.databaseId,
        sql: migration.sql,
      });
      applied.push(migration.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { applied, failed: { name: migration.name, error: message } };
    }
  }
  return { applied };
}
