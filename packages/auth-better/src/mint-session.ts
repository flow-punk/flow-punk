/**
 * Server-to-server session mint (Phase 6 / ADR-020 §5 + ADR-021 §6).
 *
 * Called by the gateway's `/api/session/redeem` endpoint *only*. It
 * never reaches the public network — the wrapper service routes it
 * behind `POST /internal/session/mint` and the gateway's router
 * never proxies the `/internal/*` prefix.
 *
 * The mint:
 *   1. Calls better-auth's `internalAdapter.createSession(userId)` so
 *      the new session row lives in the same `auth_session` table the
 *      normal sign-in path uses. We rely on better-auth to set
 *      expiry, IP/userAgent, and any plugin-side hooks. Side-effect:
 *      `session.create.after` fires, which means the existing
 *      `auth.sign-in.succeeded` audit event also fires — that is
 *      intentional. The cross-host exchange is, semantically, a
 *      successful sign-in on the target tenant.
 *   2. Signs the session token with the configured `secret` using the
 *      same HMAC-SHA256 + `${value}.${signature}` envelope better-auth
 *      uses on the normal sign-in path. The cookie name comes from
 *      better-auth's own `authCookies.sessionToken.name` so we never
 *      drift if better-auth adds a prefix in a future minor version.
 *   3. Returns a `Set-Cookie` value the caller appends to its
 *      response. Attributes match the wrapper's better-auth config
 *      (HttpOnly + Secure + SameSite=Strict per ADR-021 §6).
 *
 * The returned `sessionId` is the better-auth session id used for the
 * audit trail (`session.exchange.completed.detail.newSessionId`).
 */
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import {
  authUser as authUserTable,
  users as usersTable,
  hasAdminRights,
} from "@flowpunk-indie/db";

import type { CreateAuthHandlerInput } from "./handler.js";
import { createAuthInstance } from "./handler.js";

export interface MintSessionInput extends CreateAuthHandlerInput {
  /**
   * Email — the cross-tenant identity (ADR-021 §6). Used to resolve
   * the canonical `auth_user` row on the target tenant D1 at mint
   * time. Defense in depth: the redeem caller (gateway) carries a
   * denormalized hint, but THIS function does the authoritative
   * lookup so a stale parent-D1 row can never mint against the
   * wrong identity.
   */
  email: string;
  /**
   * Optional hint from the gateway's parent-D1 `tenant_memberships`
   * row. Logged if it disagrees with the canonical row; not
   * trusted for the mint decision.
   */
  authUserIdHint?: string | null;
}

/**
 * Surfaced when the email-resolved `auth_user` / `users` rows fail
 * the active-admin gate. The gateway translates this into
 * `session.exchange.rejected` with reason `target_auth_user_missing`.
 */
export class MintIdentityUnresolvedError extends Error {
  constructor(
    public readonly code:
      | "auth_user_not_found"
      | "domain_user_not_found"
      | "domain_user_inactive"
      | "domain_user_not_admin",
  ) {
    super(code);
    this.name = "MintIdentityUnresolvedError";
  }
}

export interface MintSessionResult {
  /** Better-auth `auth_session.id` — used in audit logs. */
  sessionId: string;
  /** Single `Set-Cookie` header value (caller appends to response). */
  setCookie: string;
}

async function makeHmacSignature(
  value: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  // Better-auth's `makeSignature` is `btoa(String.fromCharCode(...bytes))`
  // (standard base64, no URL-safe variant, no padding stripping). We must
  // match exactly so the cookie verifies on the normal request path.
  let bin = "";
  for (const b of new Uint8Array(signed)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildSetCookieHeader(
  name: string,
  signedValue: string,
  attributes: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none" | "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
    domain?: string;
  },
): string {
  const parts: string[] = [`${name}=${signedValue}`];
  parts.push(`Path=${attributes.path ?? "/"}`);
  if (attributes.maxAge !== undefined) {
    parts.push(`Max-Age=${attributes.maxAge}`);
  }
  if (attributes.domain) parts.push(`Domain=${attributes.domain}`);
  if (attributes.httpOnly) parts.push("HttpOnly");
  if (attributes.secure) parts.push("Secure");
  if (attributes.sameSite) {
    const ss = String(attributes.sameSite).toLowerCase();
    const cap = ss === "strict" ? "Strict" : ss === "none" ? "None" : "Lax";
    parts.push(`SameSite=${cap}`);
  }
  return parts.join("; ");
}

export async function mintSessionForUser(
  input: MintSessionInput,
): Promise<MintSessionResult> {
  // Authoritative resolve: email → auth_user → domain user. The
  // gateway's parent-D1 membership row carried `authUserIdHint` but
  // we ignore it for the mint decision — the tenant D1 is the source
  // of truth for auth_user_id. Rejecting on any gap closes a class
  // of bugs where a stale parent-D1 hint would let us mint as the
  // wrong physical user.
  const tenantDb = drizzle(input.d1);
  const authUserRows = await tenantDb
    .select({
      id: authUserTable.id,
      domainUserId: authUserTable.domainUserId,
    })
    .from(authUserTable)
    .where(eq(authUserTable.email, input.email))
    .limit(1);
  const authUserRow = authUserRows[0];
  if (!authUserRow) {
    throw new MintIdentityUnresolvedError("auth_user_not_found");
  }
  if (!authUserRow.domainUserId) {
    throw new MintIdentityUnresolvedError("domain_user_not_found");
  }
  const domainRows = await tenantDb
    .select({
      id: usersTable.id,
      status: usersTable.status,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, authUserRow.domainUserId),
        eq(usersTable.authUserId, authUserRow.id),
      ),
    )
    .limit(1);
  const domainRow = domainRows[0];
  if (!domainRow) {
    throw new MintIdentityUnresolvedError("domain_user_not_found");
  }
  if (domainRow.status !== "active") {
    throw new MintIdentityUnresolvedError("domain_user_inactive");
  }
  if (!hasAdminRights(domainRow.role)) {
    throw new MintIdentityUnresolvedError("domain_user_not_admin");
  }

  const instance = createAuthInstance(input);
  // `$context` is a `Promise<AuthContext>` per better-auth's typings;
  // resolving it lazily here means the work happens only when a
  // redeem actually runs (cold-start friendly).
  const ctx = await (
    instance as unknown as {
      $context: Promise<{
        secret: string;
        sessionConfig: { expiresIn: number };
        authCookies: {
          sessionToken: {
            name: string;
            attributes: Record<string, unknown>;
          };
        };
        internalAdapter: {
          createSession(userId: string): Promise<{
            id: string;
            token: string;
            expiresAt: Date | string;
          }>;
        };
      }>;
    }
  ).$context;

  const session = await ctx.internalAdapter.createSession(authUserRow.id);

  const signedValue = `${session.token}.${await makeHmacSignature(
    session.token,
    ctx.secret,
  )}`;

  const cookieAttrs = ctx.authCookies.sessionToken.attributes as {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
    path?: string;
    domain?: string;
  };
  const setCookie = buildSetCookieHeader(
    ctx.authCookies.sessionToken.name,
    signedValue,
    {
      ...cookieAttrs,
      maxAge: ctx.sessionConfig?.expiresIn,
    },
  );

  return { sessionId: session.id, setCookie };
}
