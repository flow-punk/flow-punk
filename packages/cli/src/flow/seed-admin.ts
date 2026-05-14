import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { queryD1, type CfClient } from "@flowpunk/cf-admin";
import { generateId } from "@flowpunk/service-utils";

/**
 * Seed the first owner user + a transient session in the indie D1.
 *
 * Per ADR-019 amendment 2026-05-06: the cookie this returns is for
 * INTERNAL init-time use only — it authenticates the immediate-next
 * `mintApiKey` call to `/api/v1/auth/keys`. It is NEVER printed in the
 * success card and never returned outside the init flow's own scope.
 * After init, the operator establishes a fresh browser session via
 * `flowpunk connect` + `/auth/login` (a separate, one-shot bootstrap).
 *
 * Cookie encoding (matches `validateSession`'s expectations):
 *   - cookie payload = base64(crypto random 32 bytes), stripped of `=+/`,
 *     sliced to 32 chars
 *   - cookie value   = `_system.<payload>`
 *   - cookie_hash    = sha256 hex of the FULL cookie value
 *
 * Idempotent on resume: a previously-inserted active owner is reused;
 * we always insert a fresh `mcp_sessions` row (the prior session's
 * cookie value isn't recoverable from the hash, so we can't reuse it).
 */

const TENANT_SENTINEL = "_system";
const SESSION_LIFETIME_DAYS = 30;

export interface SeedAdminInput {
  databaseId: string;
  email: string;
  displayName: string;
}

export interface SeedAdminOutput {
  userId: string;
  /**
   * Init-internal cookie value. Used to authenticate the `mintApiKey`
   * call later in the same provision run. NEVER printed to stdout.
   */
  cookieValue: string;
}

export function generateCookiePayload(): string {
  const bytes = randomBytes(32);
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/[=+/]/g, "").slice(0, 32);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export async function seedAdmin(
  client: CfClient,
  input: SeedAdminInput,
): Promise<SeedAdminOutput> {
  const sessionId = generateId("sess");
  const sessionPayload = generateCookiePayload();
  const cookieValue = `${TENANT_SENTINEL}.${sessionPayload}`;
  const cookieHash = sha256Hex(cookieValue);

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(
    Date.now() + SESSION_LIFETIME_DAYS * 86_400_000,
  ).toISOString();

  const existing = await findActiveOwnerByEmail(
    client,
    input.databaseId,
    input.email,
  );
  let userId: string;
  if (existing) {
    userId = existing;
  } else {
    userId = generateId("usr");
    await queryD1(client, {
      databaseId: input.databaseId,
      sql: `INSERT INTO users (id, email, display_name, role, status, created_at, updated_at)
            VALUES (?, ?, ?, 'owner', 'active', ?, ?);`,
      params: [userId, input.email, input.displayName, nowIso, nowIso],
    });
  }

  await queryD1(client, {
    databaseId: input.databaseId,
    sql: `INSERT INTO mcp_sessions (id, cookie_hash, user_id, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?);`,
    params: [sessionId, cookieHash, userId, expiresIso, nowIso, nowIso],
  });

  return { userId, cookieValue };
}

async function findActiveOwnerByEmail(
  client: CfClient,
  databaseId: string,
  email: string,
): Promise<string | null> {
  const rows = await queryD1(client, {
    databaseId,
    sql: `SELECT id FROM users WHERE email = ? AND role = 'owner' AND status = 'active' LIMIT 1;`,
    params: [email],
  });
  for (const r of rows) {
    if (Array.isArray(r.results)) {
      for (const row of r.results) {
        if (row && typeof row === "object" && "id" in row) {
          const id = (row as { id: unknown }).id;
          if (typeof id === "string") return id;
        }
      }
    }
  }
  return null;
}
