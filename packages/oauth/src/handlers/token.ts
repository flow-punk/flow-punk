import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import {
  oauthClientsRepo,
  oauthCodesRepo,
  oauthTokensRepo,
} from "@flowpunk-indie/db";
import { mcpOauthTokens } from "@flowpunk-indie/db";
import {
  isExpired,
  isoNow,
  isoSecondsFromNow,
  isValidPkceVerifier,
  pkceChallengeForVerifier,
  randomOpaqueId,
  redirectUriMatches,
  sha256Hex,
} from "@flowpunk-indie/oauth-protocol";

import type { OAuthEnv } from "../env.js";
import {
  isIndieToken,
  mintIndieAccessToken,
  mintIndieRefreshToken,
} from "../codec.js";
import { safeFormUrlEncoded } from "../body.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_ACTOR,
  REFRESH_FAMILY_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../policy.js";
import { getAllowedResources, getSingleResource } from "../origin.js";
import { oauthJsonError, oauthTokenJson } from "../responses.js";

type Db = DrizzleD1Database<Record<string, never>>;

interface ParsedClient {
  clientId: string;
  redirectUris: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
}

export async function handleToken(
  request: Request,
  env: OAuthEnv,
  requestId: string,
): Promise<Response> {
  const form = await safeFormUrlEncoded(request, env, requestId);
  if (form instanceof Response) return form;
  if (!form) return oauthJsonError(400, "invalid_request");

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (typeof grantType !== "string" || typeof clientId !== "string") {
    return oauthJsonError(400, "invalid_request");
  }

  const db = drizzle(env.DB);
  const clientRow = await oauthClientsRepo.findByClientId(db, clientId);
  if (!clientRow || clientRow.tokenEndpointAuthMethod !== "none") {
    return oauthJsonError(401, "invalid_client");
  }
  const client: ParsedClient = {
    clientId: clientRow.clientId,
    redirectUris: safeJsonArray(clientRow.redirectUris),
    grantTypes: safeJsonArray(clientRow.grantTypes),
    tokenEndpointAuthMethod: clientRow.tokenEndpointAuthMethod,
  };

  if (grantType === "authorization_code") {
    return exchangeAuthorizationCode(request, env, db, client, form);
  }
  if (grantType === "refresh_token") {
    return exchangeRefreshToken(request, env, db, client, form);
  }
  return oauthJsonError(400, "unsupported_grant_type");
}

async function exchangeAuthorizationCode(
  request: Request,
  env: OAuthEnv,
  db: Db,
  client: ParsedClient,
  form: FormData,
): Promise<Response> {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  const redirectUri = form.get("redirect_uri");

  const allowedResources = getAllowedResources(env, request);
  const resourceResult = getSingleResource(
    form.getAll("resource").filter((v): v is string => typeof v === "string"),
    allowedResources,
  );

  if (
    typeof code !== "string" ||
    typeof verifier !== "string" ||
    typeof redirectUri !== "string" ||
    !resourceResult.ok
  ) {
    return oauthJsonError(
      400,
      resourceResult.ok ? "invalid_request" : resourceResult.error,
    );
  }
  if (!isValidPkceVerifier(verifier)) {
    return oauthJsonError(400, "invalid_request", "invalid_code_verifier");
  }
  if (!client.redirectUris.some((u) => redirectUriMatches(redirectUri, [u]))) {
    return oauthJsonError(400, "invalid_grant");
  }

  const codeHash = await sha256Hex(code);
  const codeRow = await oauthCodesRepo.findByHash(db, codeHash);
  if (!codeRow || codeRow.clientId !== client.clientId) {
    return oauthJsonError(400, "invalid_grant");
  }
  if (
    codeRow.redirectUri !== redirectUri ||
    codeRow.resource !== resourceResult.resource
  ) {
    return oauthJsonError(400, "invalid_grant");
  }
  if (codeRow.usedAt || isExpired(codeRow.expiresAt)) {
    return oauthJsonError(400, "invalid_grant");
  }

  const computedChallenge = await pkceChallengeForVerifier(verifier);
  if (
    codeRow.codeChallengeMethod !== "S256" ||
    computedChallenge !== codeRow.codeChallenge
  ) {
    return oauthJsonError(400, "invalid_grant");
  }

  // Atomic single-use consumption — closes replay race.
  const consumed = await oauthCodesRepo.consume(db, codeHash, isoNow());
  if (!consumed) return oauthJsonError(400, "invalid_grant");

  const tokens = await issueTokenPair(db, {
    clientId: client.clientId,
    userId: codeRow.userId,
    scope: codeRow.scope,
    audience: codeRow.resource,
  });

  // Touch last-used on the client row (stale-GC tracking).
  await oauthClientsRepo
    .touchLastUsed(db, client.clientId, isoNow())
    .catch(() => {});

  return oauthTokenJson({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: tokens.refreshToken,
    scope: codeRow.scope,
  });
}

async function exchangeRefreshToken(
  request: Request,
  env: OAuthEnv,
  db: Db,
  client: ParsedClient,
  form: FormData,
): Promise<Response> {
  const refreshToken = form.get("refresh_token");
  const allowedResources = getAllowedResources(env, request);
  const resourceResult = getSingleResource(
    form.getAll("resource").filter((v): v is string => typeof v === "string"),
    allowedResources,
  );

  if (typeof refreshToken !== "string" || !resourceResult.ok) {
    return oauthJsonError(
      400,
      resourceResult.ok ? "invalid_request" : resourceResult.error,
    );
  }
  if (!client.grantTypes.includes("refresh_token")) {
    return oauthJsonError(400, "unauthorized_client");
  }
  if (!isIndieToken(refreshToken)) {
    return oauthJsonError(400, "invalid_grant");
  }

  const refreshHash = await sha256Hex(refreshToken);
  const row = await oauthTokensRepo.findByHash(db, refreshHash);
  if (!row || row.tokenType !== "refresh" || row.clientId !== client.clientId) {
    return oauthJsonError(400, "invalid_grant");
  }
  if (row.audience !== resourceResult.resource) {
    return oauthJsonError(400, "invalid_grant");
  }

  if (row.revokedAt) {
    // Reuse detection — revoke the entire family.
    await oauthTokensRepo.revokeFamily(db, row.familyId, isoNow());
    return oauthJsonError(400, "invalid_grant");
  }
  if (isExpired(row.expiresAt)) {
    await oauthTokensRepo.revokeFamily(db, row.familyId, isoNow());
    return oauthJsonError(400, "invalid_grant");
  }

  const familyCreatedMs = Date.parse(row.familyCreatedAt);
  if (
    !Number.isFinite(familyCreatedMs) ||
    familyCreatedMs + REFRESH_FAMILY_TTL_SECONDS * 1000 <= Date.now()
  ) {
    await oauthTokensRepo.revokeFamily(db, row.familyId, isoNow());
    return oauthJsonError(400, "invalid_grant");
  }

  // Atomic revoke of consumed refresh row.
  const now = isoNow();
  const revokeResult = await db.run(sql`
    UPDATE mcp_oauth_tokens
    SET revoked_at = ${now}, updated_at = ${now}, updated_by = ${OAUTH_ACTOR}
    WHERE id = ${row.id} AND revoked_at IS NULL
  `);
  if (!getChanges(revokeResult)) {
    await oauthTokensRepo.revokeFamily(db, row.familyId, isoNow());
    return oauthJsonError(400, "invalid_grant");
  }

  const tokens = await issueTokenPair(db, {
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    audience: row.audience,
    familyId: row.familyId,
    familyCreatedAt: row.familyCreatedAt,
    parentTokenId: row.id,
  });

  await oauthClientsRepo
    .touchLastUsed(db, client.clientId, isoNow())
    .catch(() => {});

  return oauthTokenJson({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: tokens.refreshToken,
    scope: row.scope,
  });
}

interface IssueOptions {
  clientId: string;
  userId: string;
  scope: string;
  audience: string;
  familyId?: string;
  familyCreatedAt?: string;
  parentTokenId?: string;
}

async function issueTokenPair(
  db: Db,
  options: IssueOptions,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = mintIndieAccessToken();
  const refreshToken = mintIndieRefreshToken();
  const accessHash = await sha256Hex(accessToken);
  const refreshHash = await sha256Hex(refreshToken);
  const now = isoNow();
  const familyId = options.familyId ?? randomOpaqueId();
  const familyCreatedAt = options.familyCreatedAt ?? now;

  // Multi-row INSERT (single statement, proxy-compat).
  await db.insert(mcpOauthTokens).values([
    {
      id: randomOpaqueId(),
      tokenHash: accessHash,
      tokenType: "access",
      familyId,
      familyCreatedAt,
      parentTokenId: options.parentTokenId ?? null,
      clientId: options.clientId,
      userId: options.userId,
      audience: options.audience,
      scope: options.scope,
      expiresAt: isoSecondsFromNow(ACCESS_TOKEN_TTL_SECONDS),
      revokedAt: null,
      createdAt: now,
      createdBy: OAUTH_ACTOR,
      updatedAt: now,
      updatedBy: OAUTH_ACTOR,
    },
    {
      id: randomOpaqueId(),
      tokenHash: refreshHash,
      tokenType: "refresh",
      familyId,
      familyCreatedAt,
      parentTokenId: options.parentTokenId ?? null,
      clientId: options.clientId,
      userId: options.userId,
      audience: options.audience,
      scope: options.scope,
      expiresAt: isoSecondsFromNow(REFRESH_TOKEN_TTL_SECONDS),
      revokedAt: null,
      createdAt: now,
      createdBy: OAUTH_ACTOR,
      updatedAt: now,
      updatedBy: OAUTH_ACTOR,
    },
  ]);

  return { accessToken, refreshToken };
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

interface RunResult {
  meta?: { changes?: number };
  changes?: number;
}
function getChanges(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const r = result as RunResult;
  if (typeof r.changes === "number") return r.changes;
  if (r.meta && typeof r.meta.changes === "number") return r.meta.changes;
  return 0;
}
